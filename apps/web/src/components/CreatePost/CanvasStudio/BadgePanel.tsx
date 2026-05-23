import { useState } from 'react';
import { Plus } from 'lucide-react';
import * as fabric from 'fabric';
import { addOfferBlock, updateBadge } from './offerBlock';
import type { OfferBadgeStyle, OfferBlockSpec } from './offerBlock';
import { useCanvasStore } from './useCanvasStore';
import { getObjectId } from './types';

const STYLES: { id: OfferBadgeStyle; label: string }[] = [
  { id: 'parallelogram', label: 'Dynamic' },
  { id: 'flat',          label: 'Flat' },
  { id: 'pill',          label: 'Pill' },
];

export function BadgePanel({ canvas }: { canvas: fabric.Canvas | null }) {
  const selectedObject = useCanvasStore((s) => s.selectedObject) as fabric.Object | null;
  const isBadge = !!selectedObject && typeof getObjectId(selectedObject) === 'string' && getObjectId(selectedObject).startsWith('offer-badge');

  const [amount,     setAmount]     = useState('₹50,000 Off');
  const [label,      setLabel]      = useState('Limited Period');
  const [badgeColor, setBadgeColor] = useState('#f97316');
  const [textColor,  setTextColor]  = useState('#ffffff');
  const [style,      setStyle]      = useState<OfferBadgeStyle>('parallelogram');

  const onStyleChange = (s: OfferBadgeStyle) => {
    setStyle(s);
    if (canvas && isBadge && selectedObject) updateBadge(canvas, selectedObject, { style: s });
  };
  const onColorChange = (c: string) => {
    setBadgeColor(c);
    if (canvas && isBadge && selectedObject) updateBadge(canvas, selectedObject, { color: c });
  };

  const handleAdd = () => {
    if (!canvas) return;
    const spec: OfferBlockSpec = { amount, label, style, badgeColor, textColor };
    void addOfferBlock(canvas, spec);
  };

  return (
    <div className="p-4 space-y-4">
      <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest">Offer Badge</p>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-neutral-600">Amount</label>
        <input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="e.g. ₹50,000 Off"
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-orange-400 bg-neutral-50" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-neutral-600">Label</label>
        <input value={label} onChange={(e)=>setLabel(e.target.value)} placeholder="e.g. Limited Period"
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-orange-400 bg-neutral-50" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-neutral-600">Shape</label>
        <div className="flex gap-1.5">
          {STYLES.map(({ id, label: lbl }) => (
            <button key={id} onClick={() => onStyleChange(id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${style===id ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-semibold text-neutral-600">Badge Color</label>
          <input type="color" value={badgeColor} onChange={(e)=>onColorChange(e.target.value)}
            className="w-full h-9 rounded border border-neutral-200 cursor-pointer" />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-semibold text-neutral-600">Text Color</label>
          <input type="color" value={textColor} onChange={(e)=>setTextColor(e.target.value)}
            className="w-full h-9 rounded border border-neutral-200 cursor-pointer" />
        </div>
      </div>

      <button onClick={handleAdd} disabled={!canvas}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold transition-colors">
        <Plus className="w-4 h-4" /> Add Badge to Canvas
      </button>
    </div>
  );
}
