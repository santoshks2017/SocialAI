import { useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { X, Wand2, RefreshCw, Download } from 'lucide-react';
import { useCanvasStore } from './useCanvasStore';
import { CanvasStage } from './CanvasStage';
import { LeftRail } from './LeftRail';
import { RightRail } from './RightRail';
import { generateSceneBackgrounds } from '../../../services/imageGeneration';
import type { CarPose } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  brief: string;
  model: string;
  initialHeading?: string;
  onExport: (dataUrl: string) => void;
}

export function CanvasStudio({ open, onClose, brief, model, initialHeading, onExport }: Props) {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const rightRailCanvasRef = useRef<fabric.Canvas | null>(null);

  const carLibrary      = useCanvasStore((s) => s.carLibrary);
  const aspectRatio     = useCanvasStore((s) => s.aspectRatio);
  const isLoading       = useCanvasStore((s) => s.isLoading);
  const getDimensions   = useCanvasStore((s) => s.getDimensions);
  const setLoading      = useCanvasStore((s) => s.setLoading);
  const setSceneVariants = useCanvasStore((s) => s.setSceneVariants);
  const reset           = useCanvasStore((s) => s.reset);

  const dims = getDimensions();

  const handleGenerate = useCallback(async () => {
    setLoading(true, 'Generating scenes…');
    try {
      const poses: CarPose[] = carLibrary.length > 0
        ? ([...new Set(carLibrary.map((c) => c.pose))] as CarPose[]).slice(0, 3)
        : ['front-three-quarter', 'side-profile', 'hero-low-angle'];
      const variants = await generateSceneBackgrounds(brief, model, poses);
      setSceneVariants(variants);
    } catch (e) {
      console.error('[CanvasStudio] Scene generation failed:', e);
    } finally {
      setLoading(false);
    }
  }, [brief, model, carLibrary, setLoading, setSceneVariants]);

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.92, multiplier: 1 });
    if (!dataUrl || dataUrl === 'data:,') {
      console.error('[CanvasStudio] Export produced empty data URL');
      return;
    }
    onExport(dataUrl);
    handleClose();
  };

  const handleClose = () => { reset(); onClose(); };

  const handleCanvasReady = (c: fabric.Canvas) => {
    canvasRef.current = c;
    rightRailCanvasRef.current = c;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-100">
      {/* Top bar */}
      <header className="h-12 px-5 border-b border-neutral-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={handleClose} className="text-neutral-400 hover:text-neutral-700 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
          <span className="font-bold text-neutral-900 text-sm">Canvas Studio</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 uppercase tracking-wide">{aspectRatio}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleGenerate} disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors">
            {isLoading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Wand2 className="w-4 h-4" /> Generate Scenes</>}
          </button>
          <button onClick={handleExport} disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold transition-colors shadow-sm">
            <Download className="w-4 h-4" /> Use This Creative
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <LeftRail brief={brief} />
        <CanvasStage
          key={aspectRatio}
          width={dims.width}
          height={dims.height}
          onCanvasReady={handleCanvasReady}
        />
        <RightRail canvas={rightRailCanvasRef.current} initialHeading={initialHeading} />
      </div>
    </div>
  );
}
