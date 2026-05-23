import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Plus, Contrast, Sun, Circle, Crosshair, Tag } from 'lucide-react';
import * as fabric from 'fabric';
import { useState } from 'react';
import { usePostStore, type AspectRatio } from '@/store/postStore';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { OfferBlockDialog } from './OfferBlockDialog';
import { enforceLayerOrder } from '@/lib/layer-order';

const ASPECT_OPTIONS: { value: AspectRatio; hint: string }[] = [
  { value: '3:4', hint: 'Feed portrait' },
  { value: '1:1', hint: 'Square' },
  { value: '9:16', hint: 'Stories / Reels' },
  { value: '4:5', hint: 'IG portrait' },
  { value: '16:9', hint: 'Landscape' },
];

interface Props {
  canvas: fabric.Canvas | null;
}

export const CanvasToolbar = ({ canvas }: Props) => {
  const [safeOn, setSafeOn] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const aspectRatio = usePostStore((s) => s.aspectRatio);
  const setAspectRatio = usePostStore((s) => s.setAspectRatio);
  const autoContrast = usePostStore((s) => s.autoContrast);
  const setAutoContrast = usePostStore((s) => s.setAutoContrast);
  const matchSceneLighting = usePostStore((s) => s.matchSceneLighting);
  const setMatchSceneLighting = usePostStore((s) => s.setMatchSceneLighting);
  const contactShadow = usePostStore((s) => s.contactShadow);
  const setContactShadow = usePostStore((s) => s.setContactShadow);

  const handleAddText = () => {
    if (!canvas) return;
    const tb = new fabric.Textbox('Your text here', {
      width: 600,
      fontFamily: 'Inter',
      fontSize: 48,
      fill: '#FFFFFF',
      textAlign: 'center',
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: 'center',
      originY: 'center',
    });
    (tb as any).id = `custom-text-${Date.now()}`;
    canvas.add(tb);
    canvas.setActiveObject(tb);
    enforceLayerOrder(canvas);
    canvas.requestRenderAll();
  };

  const handleSafe = () => {
    if (!canvas) return;
    const existing = canvas.getObjects().find((o) => (o as any).id === 'safe-zone');
    if (existing) canvas.remove(existing);
    if (!safeOn) {
      const w = canvas.getWidth();
      const h = canvas.getHeight();
      const pad = w * 0.05;
      const rect = new fabric.Rect({
        left: pad, top: pad, width: w - pad * 2, height: h - pad * 2,
        fill: 'transparent', stroke: '#E85D04', strokeWidth: 2,
        strokeDashArray: [10, 10], selectable: false, evented: false, excludeFromExport: true,
      });
      (rect as any).id = 'safe-zone';
      canvas.add(rect);
      canvas.bringObjectToFront(rect);
    }
    canvas.requestRenderAll();
    setSafeOn(!safeOn);
  };

  const handleResetCar = () => {
    if (!canvas) return;
    const car = canvas.getObjects().find((o) => (o as any).id === 'car') as fabric.FabricImage | undefined;
    if (!car) return;
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    car.scaleToWidth(w * 0.72);
    car.set({ left: w / 2, top: h * 0.65, originX: 'center', originY: 'center', angle: 0 });
    car.setCoords();
    canvas.requestRenderAll();
  };

  return (
    <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-2 py-1.5 shadow-sm flex-wrap">
      <Button variant="ghost" size="sm" onClick={handleAddText}>
        <Plus className="w-4 h-4 mr-1" /> Text
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOfferOpen(true)}>
        <Tag className="w-4 h-4 mr-1" /> Offer block
      </Button>
      <div className="w-px h-5 bg-border mx-1" />
      <Button variant="ghost" size="sm" onClick={handleSafe}>
        {safeOn ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
        Safe zone
      </Button>
      <div className="w-px h-5 bg-border mx-1" />
      <Button variant={matchSceneLighting ? 'default' : 'ghost'} size="sm"
        onClick={() => setMatchSceneLighting(!matchSceneLighting)}>
        <Sun className="w-4 h-4 mr-1" /> Match light
      </Button>
      <Button variant={contactShadow ? 'default' : 'ghost'} size="sm"
        onClick={() => setContactShadow(!contactShadow)}>
        <Circle className="w-4 h-4 mr-1" /> Shadow
      </Button>
      <Button variant={autoContrast ? 'default' : 'ghost'} size="sm"
        onClick={() => setAutoContrast(!autoContrast)}>
        <Contrast className="w-4 h-4 mr-1" /> Auto contrast
      </Button>
      <Button variant="ghost" size="sm" onClick={handleResetCar}>
        <Crosshair className="w-4 h-4 mr-1" /> Reset car
      </Button>
      <div className="w-px h-5 bg-border mx-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">{aspectRatio}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {ASPECT_OPTIONS.map((opt) => (
            <DropdownMenuItem key={opt.value}
              onClick={() => setAspectRatio(opt.value)}
              className={aspectRatio === opt.value ? 'bg-accent' : ''}>
              <span className="font-medium mr-2">{opt.value}</span>
              <span className="text-xs text-muted-foreground">{opt.hint}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <OfferBlockDialog open={offerOpen} onOpenChange={setOfferOpen} />
    </div>
  );
};
