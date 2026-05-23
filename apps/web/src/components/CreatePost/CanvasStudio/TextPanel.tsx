import { useState, useEffect } from 'react';
import * as fabric from 'fabric';
import { getObjectId } from './types';

interface Props {
  canvas: fabric.Canvas | null;
  initialHeading?: string;
  /** Pass aspectRatio so state resets when the canvas is remounted */
  resetKey?: string;
}

export function TextPanel({ canvas, initialHeading = '', resetKey }: Props) {
  const [heading,      setHeading]      = useState(initialHeading);
  const [byline,       setByline]       = useState('');
  const [headingColor, setHeadingColor] = useState('#ffffff');
  const [headingSize,  setHeadingSize]  = useState(48);
  const [bylineColor,  setBylineColor]  = useState('#ffffffd9'); // rgba(255,255,255,0.85)

  // Reset local state whenever the canvas is remounted (aspect ratio switch)
  useEffect(() => {
    setHeading(initialHeading);
    setByline('');
    setHeadingColor('#ffffff');
    setHeadingSize(48);
    setBylineColor('#ffffffd9');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const syncLayer = (id: 'heading' | 'byline', text: string, opts: { fontSize: number; fill: string }) => {
    if (!canvas) return;
    const existing = canvas.getObjects().find((o) => getObjectId(o) === id) as fabric.Textbox | undefined;
    if (existing) {
      if (text) {
        existing.set({ text, fontSize: opts.fontSize, fill: opts.fill });
        canvas.requestRenderAll();
      } else {
        canvas.remove(existing);
        canvas.requestRenderAll();
      }
      return;
    }
    if (!text) return;
    const W = canvas.getWidth(), H = canvas.getHeight();
    const tb = new fabric.Textbox(text, {
      left: W / 2, top: id === 'heading' ? H * 0.10 : H * 0.18,
      width: W * 0.85, originX: 'center',
      fontFamily: 'Arial Black, sans-serif',
      fontSize: opts.fontSize, fill: opts.fill,
      fontWeight: id === 'heading' ? '900' : '400',
      textAlign: 'center', editable: true,
    });
    (tb as any).id = id;
    canvas.add(tb);
    canvas.requestRenderAll();
  };

  return (
    <div className="p-4 space-y-4">
      <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest">Text Layers</p>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-neutral-600">Heading</label>
        <input value={heading} placeholder="Enter heading…"
          onChange={(e) => { setHeading(e.target.value); syncLayer('heading', e.target.value, { fontSize: headingSize, fill: headingColor }); }}
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-orange-400 bg-neutral-50" />
        <div className="flex items-center gap-2">
          <input type="color" value={headingColor}
            onChange={(e) => { setHeadingColor(e.target.value); syncLayer('heading', heading, { fontSize: headingSize, fill: e.target.value }); }}
            className="w-8 h-8 rounded border border-neutral-200 cursor-pointer shrink-0" />
          <input type="range" min={24} max={96} value={headingSize}
            onChange={(e) => { const s=parseInt(e.target.value); setHeadingSize(s); syncLayer('heading', heading, { fontSize: s, fill: headingColor }); }}
            className="flex-1" />
          <span className="text-xs text-neutral-500 w-8 text-right">{headingSize}</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-neutral-600">Byline</label>
        <input value={byline} placeholder="Dealer name, offer…"
          onChange={(e) => { setByline(e.target.value); syncLayer('byline', e.target.value, { fontSize: 22, fill: bylineColor }); }}
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-orange-400 bg-neutral-50" />
        <div className="flex items-center gap-2">
          <input type="color" value={bylineColor}
            onChange={(e) => { setBylineColor(e.target.value); syncLayer('byline', byline, { fontSize: 22, fill: e.target.value }); }}
            className="w-8 h-8 rounded border border-neutral-200 cursor-pointer shrink-0"
            title="Byline color" />
          <span className="text-xs text-neutral-500">Byline color</span>
        </div>
      </div>

      {!canvas && <p className="text-[11px] text-neutral-400">Generate a scene first to add text layers.</p>}
    </div>
  );
}
