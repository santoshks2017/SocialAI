import { useRef, useState, useEffect } from 'react';
import { ImagePlus, X, AlertTriangle } from 'lucide-react';
import { useCanvasStore } from './useCanvasStore';
import type { CarPose, AspectRatio } from './types';

const POSES: { id: CarPose; label: string }[] = [
  { id: 'front',               label: 'Front' },
  { id: 'front-three-quarter', label: '3/4 Front' },
  { id: 'side-profile',        label: 'Side' },
  { id: 'hero-low-angle',      label: 'Hero (Low)' },
];

const RATIOS: { id: AspectRatio; label: string }[] = [
  { id: '3:4',  label: '3:4' },
  { id: '1:1',  label: '1:1' },
  { id: '9:16', label: '9:16' },
  { id: '4:5',  label: '4:5' },
  { id: '16:9', label: '16:9' },
];

export function LeftRail({ brief }: { brief: string }) {
  const carLibrary      = useCanvasStore((s) => s.carLibrary);
  const setCarVariant   = useCanvasStore((s) => s.setCarVariant);
  const removeCarVariant = useCanvasStore((s) => s.removeCarVariant);
  const aspectRatio     = useCanvasStore((s) => s.aspectRatio);
  const setAspectRatio  = useCanvasStore((s) => s.setAspectRatio);
  const fileRefs        = useRef<Partial<Record<CarPose, HTMLInputElement>>>({});

  // Track blob URLs for cleanup
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const [pendingRatio, setPendingRatio] = useState<AspectRatio | null>(null);

  // Revoke all tracked blob URLs on unmount
  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  const onFile = (pose: CarPose) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke the old blob URL for this pose if present
    const existing = carLibrary.find((c) => c.pose === pose);
    if (existing?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(existing.previewUrl);
      blobUrlsRef.current.delete(existing.previewUrl);
    }

    const url = URL.createObjectURL(file);
    blobUrlsRef.current.add(url);
    const img = await new Promise<HTMLImageElement>((res) => {
      const i = new Image(); i.onload = () => res(i); i.src = url;
    });
    setCarVariant({ pose, previewUrl: url, file, width: img.naturalWidth, height: img.naturalHeight });
    e.target.value = '';
  };

  const handleRemove = (pose: CarPose) => {
    const existing = carLibrary.find((c) => c.pose === pose);
    if (existing?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(existing.previewUrl);
      blobUrlsRef.current.delete(existing.previewUrl);
    }
    removeCarVariant(pose);
  };

  const onRatioClick = (ratio: AspectRatio) => {
    if (ratio === aspectRatio) return;
    if (carLibrary.length > 0) {
      setPendingRatio(ratio);
      return;
    }
    setAspectRatio(ratio);
  };

  const confirmRatioChange = () => {
    if (pendingRatio) { setAspectRatio(pendingRatio); setPendingRatio(null); }
  };

  return (
    <aside className="w-60 shrink-0 border-r border-neutral-200 bg-white overflow-y-auto p-4 flex flex-col gap-5">
      <div>
        <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest mb-1">Brief</p>
        <p className="text-xs text-neutral-600 leading-relaxed line-clamp-4">{brief || '—'}</p>
      </div>

      <div>
        <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest mb-2">Car Photos</p>
        <div className="space-y-2">
          {POSES.map(({ id, label }) => {
            const existing = carLibrary.find((c) => c.pose === id);
            return (
              <div key={id}>
                <input ref={(el) => { fileRefs.current[id] = el ?? undefined; }} type="file" accept="image/*" className="hidden" onChange={onFile(id)} />
                {existing ? (
                  <div className="flex items-center gap-2 p-1.5 rounded-lg border border-neutral-200 bg-neutral-50">
                    <img src={existing.previewUrl} alt={label} className="w-10 h-8 object-cover rounded shrink-0" />
                    <span className="text-xs text-neutral-700 font-medium flex-1 truncate">{label}</span>
                    <button onClick={() => handleRemove(id)} className="text-neutral-300 hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRefs.current[id]?.click()}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border-2 border-dashed border-neutral-200 hover:border-orange-400 hover:bg-orange-50 text-neutral-400 hover:text-orange-600 transition-colors text-xs font-medium"
                  >
                    <ImagePlus className="w-3.5 h-3.5 shrink-0" /> {label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {carLibrary.length === 0 && (
          <p className="text-[11px] text-neutral-400 mt-2 text-center">Upload a car to composite it onto the scene</p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest mb-2">Aspect Ratio</p>

        {/* Inline confirmation — replaces window.confirm */}
        {pendingRatio && (
          <div className="mb-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-xs">
            <div className="flex items-start gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
              <span className="text-amber-800 font-medium leading-snug">
                Switching to <strong>{pendingRatio}</strong> resets the canvas.
              </span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={confirmRatioChange}
                className="flex-1 py-1 rounded-lg bg-neutral-900 text-white text-[11px] font-bold hover:bg-neutral-700 transition-colors">
                Confirm
              </button>
              <button onClick={() => setPendingRatio(null)}
                className="flex-1 py-1 rounded-lg border border-neutral-200 text-neutral-600 text-[11px] font-bold hover:bg-neutral-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5">
          {RATIOS.map(({ id, label }) => (
            <button key={id} onClick={() => onRatioClick(id)}
              className={`py-1.5 rounded-lg text-xs font-bold border transition-colors ${aspectRatio===id ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
