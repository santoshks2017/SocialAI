import { usePostStore } from '@/store/postStore';
import { Button } from '@/components/ui/button';
import { RefreshCw, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const VariantPicker = () => {
  const sceneVariants = usePostStore((s) => s.sceneVariants);
  const copyVariants = usePostStore((s) => s.copyVariants);
  const selectedSceneIdx = usePostStore((s) => s.selectedSceneIdx);
  const selectedCopyIdx = usePostStore((s) => s.selectedCopyIdx);
  const selectScene = usePostStore((s) => s.selectScene);
  const selectCopy = usePostStore((s) => s.selectCopy);
  const regenerateScenes = usePostStore((s) => s.regenerateScenes);
  const regenerateCopy = usePostStore((s) => s.regenerateCopy);
  const tryAnotherPose = usePostStore((s) => s.tryAnotherPose);
  const isLoading = usePostStore((s) => s.isLoading);

  if (sceneVariants.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Generate a post to see variants here.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Scenes</h3>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={tryAnotherPose} disabled={isLoading}>
              <Shuffle className="w-3 h-3 mr-1" /> Pose
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={regenerateScenes} disabled={isLoading}>
              <RefreshCw className="w-3 h-3 mr-1" /> New
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {sceneVariants.map((v, i) => (
            <button
              key={i}
              onClick={() => selectScene(i)}
              className={cn(
                'relative rounded-md overflow-hidden border-2 aspect-[3/4] bg-neutral-100',
                selectedSceneIdx === i ? 'border-orange-500 ring-2 ring-orange-200' : 'border-transparent hover:border-neutral-300'
              )}
            >
              <img src={v.sceneUrl} className="w-full h-full object-cover" alt="" />
              {!v.usedAI && (
                <span className="absolute bottom-1 left-1 px-1 py-0.5 text-[8px] bg-black/60 text-white rounded">FALLBACK</span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Copy</h3>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={regenerateCopy} disabled={isLoading}>
            <RefreshCw className="w-3 h-3 mr-1" /> Rewrite
          </Button>
        </div>
        <div className="space-y-2">
          {copyVariants.map((c, i) => (
            <button
              key={i}
              onClick={() => selectCopy(i)}
              className={cn(
                'w-full text-left p-3 rounded-md border-2 transition',
                selectedCopyIdx === i ? 'border-orange-500 bg-orange-50' : 'border-neutral-200 hover:border-neutral-300 bg-white'
              )}
            >
              <div className="font-semibold text-sm text-neutral-900">{c.heading}</div>
              <div className="text-xs text-neutral-600 mt-1 leading-snug">{c.byline}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};