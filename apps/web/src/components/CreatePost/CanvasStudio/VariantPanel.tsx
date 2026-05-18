import { Check, RefreshCw } from 'lucide-react';
import { useCanvasStore } from './useCanvasStore';

export function VariantPanel() {
  const variants         = useCanvasStore((s) => s.sceneVariants);
  const selectedIdx      = useCanvasStore((s) => s.selectedSceneIdx);
  const selectScene      = useCanvasStore((s) => s.selectScene);
  const isLoading        = useCanvasStore((s) => s.isLoading);
  const loadingMessage   = useCanvasStore((s) => s.loadingMessage);

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-400 p-4">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <p className="text-xs font-medium text-center">{loadingMessage || 'Generating scenes…'}</p>
    </div>
  );

  if (variants.length === 0) return (
    <div className="flex items-center justify-center h-full p-4 text-center">
      <p className="text-xs text-neutral-400">Click "Generate Scenes" to create scene variants</p>
    </div>
  );

  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest">Scene Variants</p>
      {variants.map((v, i) => (
        <button key={i} onClick={() => selectScene(i)}
          className={`relative w-full rounded-xl overflow-hidden border-2 transition-all text-left ${selectedIdx===i ? 'border-orange-500 shadow-md' : 'border-neutral-200 hover:border-neutral-300'}`}>
          <img src={v.sceneUrl} alt={`Scene ${i+1}`} className="w-full aspect-video object-cover" />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
            <p className="text-white text-[10px] font-bold capitalize">{v.pose.replace(/-/g,' ')}</p>
          </div>
          {selectedIdx===i && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
