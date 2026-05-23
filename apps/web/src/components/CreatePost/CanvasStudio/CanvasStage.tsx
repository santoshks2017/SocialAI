import { useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from './useCanvasStore';
import { composeSceneWithCar, applyAutoContrastScrims } from './sceneComposer';
import { getObjectId } from './types';

interface Props {
  width: number;
  height: number;
  onCanvasReady: (canvas: fabric.Canvas) => void;
}

export function CanvasStage({ width, height, onCanvasReady }: Props) {
  const elRef     = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  const sceneVariants      = useCanvasStore((s) => s.sceneVariants);
  const selectedSceneIdx   = useCanvasStore((s) => s.selectedSceneIdx);
  const carLibrary         = useCanvasStore((s) => s.carLibrary);
  const setSelectedObject  = useCanvasStore((s) => s.setSelectedObject);
  const autoContrast       = useCanvasStore((s) => s.autoContrast);
  const matchSceneLighting = useCanvasStore((s) => s.matchSceneLighting);
  const contactShadow      = useCanvasStore((s) => s.contactShadow);

  useEffect(() => {
    if (!elRef.current) return;
    const canvas = new fabric.Canvas(elRef.current, { width, height, backgroundColor: '#18181b' });
    fabricRef.current = canvas;
    onCanvasReady(canvas);
    canvas.on('selection:created', (e) => setSelectedObject(e.selected?.[0] ?? null));
    canvas.on('selection:updated', (e) => setSelectedObject(e.selected?.[0] ?? null));
    canvas.on('selection:cleared', ()  => setSelectedObject(null));
    return () => { canvas.dispose(); fabricRef.current = null; };
  // Run only on mount — width/height changes are handled by key prop on the parent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compose = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || selectedSceneIdx === null) return;
    const scene = sceneVariants[selectedSceneIdx];
    if (!scene) return;

    const car = carLibrary[0]; // first uploaded car
    if (!car) {
      // Scene-only: just swap the background
      canvas.getObjects().forEach((o) => {
        const id = getObjectId(o);
        if (['scene','scrim-top','scrim-bottom','contact-shadow','car'].includes(id)) { o.off(); canvas.remove(o); }
      });
      const img = await fabric.FabricImage.fromURL(scene.sceneUrl, { crossOrigin: 'anonymous' });
      const sc = Math.max(width/img.width!, height/img.height!);
      img.set({ scaleX:sc, scaleY:sc, left:width/2, top:height/2, originX:'center', originY:'center', selectable:false, evented:false });
      (img as any).id = 'scene';
      canvas.add(img); canvas.sendObjectToBack(img);
      if (autoContrast) applyAutoContrastScrims(canvas, width, height, scene.lighting.brightness);
      canvas.requestRenderAll();
      return;
    }

    await composeSceneWithCar(canvas, scene, car, { matchSceneLighting, contactShadow, autoContrast });
  }, [sceneVariants, selectedSceneIdx, carLibrary, width, height, autoContrast, matchSceneLighting, contactShadow]);

  useEffect(() => { void compose(); }, [compose]);

  // Scale canvas to fit the available viewport without distortion
  const displayScale = Math.min(1, 540 / Math.max(width, height));

  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-300 overflow-hidden">
      <div style={{ transform: `scale(${displayScale})`, transformOrigin: 'center center' }}>
        <canvas ref={elRef} />
      </div>
    </div>
  );
}
