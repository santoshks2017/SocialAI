import { useState, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { usePostStore } from '@/store/postStore';
import { updateBadge, type OfferBadgeStyle } from '@/lib/offer-block';
import { useBrandStore } from '@/store/brandStore';

export const BadgeFormatPanel = () => {
  const selectedObject = usePostStore((s) => s.selectedObject);
  const brandKit = useBrandStore((s) => s.brandKit);
  const [color, setColor] = useState('#E85D04');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (selectedObject?.fill) setColor(selectedObject.fill as string);
  }, [selectedObject]);

  const isBadge = selectedObject && (selectedObject as any).id?.startsWith('offer-badge');
  if (!isBadge) return null;

  const canvas = (window as any).__fabricCanvas;
  const currentStyle = (selectedObject as any).offerStyle as OfferBadgeStyle;

  const onColor = (c: string) => {
    setColor(c);
    if (canvas) updateBadge(canvas, selectedObject, { color: c });
  };

  const onStyle = (s: string) => {
    if (canvas) updateBadge(canvas, selectedObject, { style: s as OfferBadgeStyle });
  };

  const onDelete = () => {
    if (!canvas) return;
    const id = (selectedObject as any).id as string;
    const textId = id.replace('offer-badge', 'offer-text');
    [...canvas.getObjects()].forEach((o: any) => {
      if (o.id === id || o.id === textId) canvas.remove(o);
    });
    canvas.requestRenderAll();
  };

  const swatches = [
    brandKit.primaryHex, brandKit.accentHex,
    '#000000', '#FFFFFF',
    '#D32F2F', '#388E3C', '#F57C00', '#1976D2',
  ];

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-neutral-800">Offer badge</h3>

      <div>
        <Label className="text-xs">Style</Label>
        <Tabs value={currentStyle} onValueChange={onStyle} className="mt-1">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="parallelogram">Slant</TabsTrigger>
            <TabsTrigger value="flat">Flat</TabsTrigger>
            <TabsTrigger value="pill">Pill</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div>
        <Label className="text-xs">Background color</Label>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {swatches.map((c) => (
            <button
              key={c}
              onClick={() => onColor(c)}
              className={`w-7 h-7 rounded-md border-2 transition ${
                color === c ? 'border-orange-600 scale-110' : 'border-neutral-200'
              }`}
              style={{ background: c }}
            />
          ))}
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="w-7 h-7 rounded-md border-2 border-dashed border-neutral-300 text-neutral-500 text-xs"
          >
            +
          </button>
        </div>
        {showPicker && (
          <div className="mt-2">
            <HexColorPicker color={color} onChange={onColor} />
            <p className="text-xs mt-1 text-neutral-600">{color}</p>
          </div>
        )}
      </div>

      <Button variant="outline" size="sm" onClick={onDelete} className="w-full">
        <Trash2 className="w-4 h-4 mr-2" /> Remove offer block
      </Button>

      <p className="text-xs text-neutral-500">
        Click the text on the badge to edit the wording, font, size and color.
      </p>
    </div>
  );
};
