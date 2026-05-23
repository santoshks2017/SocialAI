import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { addOfferBlock, type OfferBadgeStyle } from '@/lib/offer-block';
import { enforceLayerOrder } from '@/lib/layer-order';
import { useBrandStore } from '@/store/brandStore';

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export const OfferBlockDialog = ({ open, onOpenChange }: Props) => {
  const brandKit = useBrandStore((s) => s.brandKit);
  const [amount, setAmount] = useState('₹50,000');
  const [label, setLabel] = useState('Benefits up to');
  const [style, setStyle] = useState<OfferBadgeStyle>('parallelogram');
  const [badgeColor, setBadgeColor] = useState(brandKit.primaryHex);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const onConfirm = async () => {
    const canvas = (window as any).__fabricCanvas;
    if (!canvas) return;
    await addOfferBlock(canvas, { amount, label, style, badgeColor, textColor: '#FFFFFF' });
    enforceLayerOrder(canvas);
    onOpenChange(false);
  };

  const swatches = [
    brandKit.primaryHex,
    brandKit.accentHex,
    '#000000', '#FFFFFF',
    '#D32F2F', '#388E3C', '#F57C00', '#1976D2',
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add offer block</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Style</Label>
            <Tabs value={style} onValueChange={(v) => setStyle(v as OfferBadgeStyle)} className="mt-1">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="parallelogram">Slanted</TabsTrigger>
                <TabsTrigger value="flat">Flat</TabsTrigger>
                <TabsTrigger value="pill">Pill</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div>
            <Label className="text-xs">Badge color</Label>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {swatches.map((c) => (
                <button
                  key={c}
                  onClick={() => setBadgeColor(c)}
                  className={`w-7 h-7 rounded-md border-2 transition ${
                    badgeColor === c ? 'border-orange-600 scale-110' : 'border-neutral-200'
                  }`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-7 h-7 rounded-md border-2 border-dashed border-neutral-300 text-neutral-500 text-xs hover:border-neutral-400"
              >
                +
              </button>
            </div>
            {showColorPicker && (
              <div className="mt-2">
                <HexColorPicker color={badgeColor} onChange={setBadgeColor} />
                <p className="text-xs mt-1 text-neutral-600">{badgeColor}</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm} className="bg-orange-500 hover:bg-orange-600">Add to canvas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
