import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import * as fabric from 'fabric';
import JSZip from 'jszip';
import { exportAspect, type AspectRatio } from '@/lib/aspect-reflow';
import { LUT_LABELS, autoSelectLut, type LutPreset } from '@/lib/lut-grades';
import { usePostStore } from '@/store/postStore';
import { Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';

const ASPECTS: AspectRatio[] = ['1:1', '4:5', '9:16', '3:4', '16:9'];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canvas: fabric.Canvas | null;
}

export const ExportDialog = ({ open, onOpenChange, canvas }: Props) => {
  const sceneVariants = usePostStore((s) => s.sceneVariants);
  const selectedSceneIdx = usePostStore((s) => s.selectedSceneIdx);
  const context = usePostStore((s) => s.context);
  const scene = selectedSceneIdx != null ? sceneVariants[selectedSceneIdx] : null;

  const [selected, setSelected] = useState<Set<AspectRatio>>(new Set(['1:1', '9:16']));
  const [lut, setLut] = useState<LutPreset>(scene ? autoSelectLut({ brief: context.brief, lighting: scene.lighting }) : 'editorial-clean');
  const [busy, setBusy] = useState(false);

  const toggle = (a: AspectRatio) => {
    const next = new Set(selected);
    next.has(a) ? next.delete(a) : next.add(a);
    setSelected(next);
  };

  const handleExport = async () => {
    if (!canvas || !scene || selected.size === 0) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      for (const aspect of selected) {
        const dataUrl = await exportAspect(canvas, aspect, { brief: context.brief, lighting: scene.lighting, lutPreset: lut });
        const b64 = dataUrl.split(',')[1];
        zip.file(`${context.model.replace(/\s+/g, '-') || 'post'}-${aspect.replace(':', 'x')}.png`, b64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${context.model.replace(/\s+/g, '-') || 'post'}-export.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${selected.size} image${selected.size > 1 ? 's' : ''}`);
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs mb-2 block">Aspect ratios</Label>
            <div className="grid grid-cols-5 gap-2">
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  onClick={() => toggle(a)}
                  className={`px-2 py-3 rounded border text-xs font-medium ${selected.has(a) ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-neutral-200 hover:border-neutral-400'}`}
                >{a}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Color grade</Label>
            <select value={lut} onChange={(e) => setLut(e.target.value as LutPreset)} className="w-full h-9 px-2 border rounded text-sm">
              {(Object.keys(LUT_LABELS) as LutPreset[]).map((k) => (
                <option key={k} value={k}>{LUT_LABELS[k]}</option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleExport} disabled={busy || selected.size === 0 || !scene} className="bg-orange-500 hover:bg-orange-600">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export ZIP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};