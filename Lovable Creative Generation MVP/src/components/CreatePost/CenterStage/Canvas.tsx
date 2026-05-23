import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { usePostStore } from '@/store/postStore';
import { useBrandStore } from '@/store/brandStore';
import { applyAutoContrastScrims, applySceneMatch, clearSceneMatch, composeSceneWithCar, createContactShadow, restackSceneLayers } from '@/lib/scene-composer';
import { enforceLayerOrder } from '@/lib/layer-order';
import { toast } from 'sonner';

interface Props {
  width: number;
  height: number;
  onCanvasReady: (canvas: fabric.Canvas) => void;
}

export const Canvas = ({ width, height, onCanvasReady }: Props) => {
  const elRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const [maxW, setMaxW] = useState(720);
  const containerRef = useRef<HTMLDivElement>(null);

  const sceneVariants = usePostStore((s) => s.sceneVariants);
  const selectedSceneIdx = usePostStore((s) => s.selectedSceneIdx);
  const carLibrary = usePostStore((s) => s.carLibrary);
  const copyVariants = usePostStore((s) => s.copyVariants);
  const selectedCopyIdx = usePostStore((s) => s.selectedCopyIdx);
  const autoContrast = usePostStore((s) => s.autoContrast);
  const matchSceneLighting = usePostStore((s) => s.matchSceneLighting);
  const contactShadow = usePostStore((s) => s.contactShadow);
  const setSelectedObject = usePostStore((s) => s.setSelectedObject);
  const brandKit = useBrandStore((s) => s.brandKit);

  // Initialize canvas
  useEffect(() => {
    if (!elRef.current) return;
    const c = new fabric.Canvas(elRef.current, {
      width,
      height,
      backgroundColor: '#1B1B2F',
      preserveObjectStacking: true,
    });
    canvasRef.current = c;
    onCanvasReady(c);
    (window as any).__fabricCanvas = c;

    c.on('selection:created', (e) => setSelectedObject(e.selected?.[0] ?? null));
    c.on('selection:updated', (e) => setSelectedObject(e.selected?.[0] ?? null));
    c.on('selection:cleared', () => setSelectedObject(null));
    const syncCurrentShadow = (target?: fabric.Object) => {
      if ((target as any)?.id !== 'car') return;
      const shadow = c.getObjects().find((o) => (o as any).id === 'contact-shadow') as fabric.Ellipse | undefined;
      if (!shadow) return;
      const r = target.getBoundingRect();
      shadow.set({ left: r.left + r.width / 2, top: r.top + r.height - 4, rx: r.width * 0.46, ry: r.height * 0.05 });
      shadow.setCoords();
    };
    c.on('object:moving', (e) => syncCurrentShadow(e.target));
    c.on('object:scaling', (e) => syncCurrentShadow(e.target));
    c.on('object:rotating', (e) => syncCurrentShadow(e.target));

    return () => { c.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setMaxW(Math.min(720, w - 16));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Update canvas dims
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.setDimensions({ width, height });
    c.renderAll();
  }, [width, height]);

  // Compose when scene/car changes
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || selectedSceneIdx == null) return;
    const scene = sceneVariants[selectedSceneIdx];
    if (!scene) return;
    let dealerCar = carLibrary.find((cc) => cc.pose === scene.pose);
    let isFallback = false;
    if (!dealerCar) {
      dealerCar = carLibrary.find((cc) => cc.pose === 'front-three-quarter') ?? carLibrary[0];
      isFallback = true;
    }
    if (!dealerCar) return;
    const effects = usePostStore.getState();
    composeSceneWithCar(c, scene, dealerCar, isFallback, {
      autoContrast: effects.autoContrast,
      matchSceneLighting: effects.matchSceneLighting,
      contactShadow: effects.contactShadow,
    }).catch((e) => {
      console.error(e);
      toast.error('Failed to compose scene');
    });
  }, [sceneVariants, selectedSceneIdx, carLibrary]);

  // Apply toolbar effects to the live canvas without regenerating the scene.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || selectedSceneIdx == null) return;
    const scene = sceneVariants[selectedSceneIdx];
    const car = c.getObjects().find((o) => (o as any).id === 'car') as fabric.FabricImage | undefined;
    if (!scene || !car) return;

    if (matchSceneLighting) applySceneMatch(car, scene.lighting);
    else clearSceneMatch(car);
    c.requestRenderAll();
  }, [matchSceneLighting, sceneVariants, selectedSceneIdx]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || selectedSceneIdx == null) return;
    const scene = sceneVariants[selectedSceneIdx];
    const car = c.getObjects().find((o) => (o as any).id === 'car') as fabric.FabricImage | undefined;
    const shadow = c.getObjects().find((o) => (o as any).id === 'contact-shadow') as fabric.Ellipse | undefined;
    if (!scene || !car) return;

    if (!contactShadow) {
      if (shadow) c.remove(shadow);
      c.requestRenderAll();
      return;
    }
    if (!shadow) {
      const r = car.getBoundingRect();
      const next = createContactShadow({ x: r.left, y: r.top, width: r.width, height: r.height }, scene.lighting.direction);
      (next as any).id = 'contact-shadow';
      c.add(next);
      enforceLayerOrder(c);
    }
    c.requestRenderAll();
  }, [contactShadow, sceneVariants, selectedSceneIdx]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || selectedSceneIdx == null) return;
    const scene = sceneVariants[selectedSceneIdx];
    if (!scene) return;

    if (autoContrast) {
      applyAutoContrastScrims(c, width, height, scene.lighting.brightness);
      enforceLayerOrder(c);
    } else {
      c.getObjects().forEach((obj) => {
        const id = (obj as any).id;
        if (id === 'scrim-top' || id === 'scrim-bottom') c.remove(obj);
      });
    }
    c.requestRenderAll();
  }, [autoContrast, sceneVariants, selectedSceneIdx, width, height]);

  // Update text + brand pins when copy/brand changes
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || selectedCopyIdx == null) return;
    const copy = copyVariants[selectedCopyIdx];
    if (!copy) return;
    upsertText(c, 'heading', copy.heading, {
      left: width / 2, top: height * 0.10,
      fontSize: 72, fontFamily: brandKit.displayFont, fill: '#FFFFFF',
      fontWeight: 'bold', textAlign: 'center', shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.7)', blur: 14, offsetX: 0, offsetY: 3 }),
    } as any);
    upsertText(c, 'byline', copy.byline, {
      left: width / 2, top: height * 0.10 + 90,
      fontSize: 24, fontFamily: brandKit.bodyFont, fill: '#FFFFFF',
      textAlign: 'center', shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.7)', blur: 8, offsetX: 0, offsetY: 2 }),
    } as any);
    upsertBrandPins(c, brandKit, width, height);
    enforceLayerOrder(c);
    c.requestRenderAll();
  }, [copyVariants, selectedCopyIdx, brandKit, width, height]);

  const displayScale = Math.min(maxW / width, (window.innerHeight - 220) / height);

  return (
    <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden p-4">
      <div
        className="shadow-2xl rounded-lg overflow-hidden bg-[#1B1B2F]"
        style={{ width: width * displayScale, height: height * displayScale }}
      >
        <div style={{ width, height, transform: `scale(${displayScale})`, transformOrigin: 'top left' }}>
          <canvas ref={elRef} />
        </div>
      </div>
    </div>
  );
};

function upsertText(canvas: fabric.Canvas, id: string, text: string, props: Partial<fabric.Textbox>) {
  const existing = canvas.getObjects().find((o) => (o as any).id === id) as fabric.Textbox | undefined;
  if (existing) {
    // Only update the text content; preserve user formatting (font, color, shadow, etc.)
    if (existing.text !== text) {
      existing.set({ text });
    }
    existing.setCoords();
    return;
  }
  const tb = new fabric.Textbox(text, {
    width: (props as any).fontSize > 40 ? 800 : 700,
    originX: 'center',
    ...props,
  } as any);
  (tb as any).id = id;
  canvas.add(tb);
}

function upsertBrandPins(canvas: fabric.Canvas, brandKit: any, w: number, h: number) {
  // Remove existing pins
  canvas.getObjects().forEach((o) => {
    const id = (o as any).id;
    if (id === 'brand-logo' || id === 'brand-logo-oem' || id === 'brand-name' ||
        id === 'footer-strip' || id === 'footer-text') {
      canvas.remove(o);
    }
  });

  // Dealer logo — top-left
  if (brandKit.logo) {
    fabric.FabricImage.fromURL(brandKit.logo).then((img) => {
      const scale = 110 / (img.height || 1);
      img.set({ left: 32, top: 32, originX: 'left', originY: 'top', scaleX: scale, scaleY: scale, lockScalingFlip: true });
      (img as any).id = 'brand-logo';
      canvas.add(img);
      enforceLayerOrder(canvas);
      canvas.requestRenderAll();
    });
  }

  // OEM logo — top-right (optional)
  if (brandKit.oemLogo) {
    fabric.FabricImage.fromURL(brandKit.oemLogo).then((img) => {
      const scale = 90 / (img.height || 1);
      img.set({ left: w - 32, top: 32, originX: 'right', originY: 'top', scaleX: scale, scaleY: scale, lockScalingFlip: true });
      (img as any).id = 'brand-logo-oem';
      canvas.add(img);
      enforceLayerOrder(canvas);
      canvas.requestRenderAll();
    });
  }

  // Footer
  if (brandKit.footerEnabled !== false) {
    const parts: string[] = [];
    if (brandKit.dealershipName) parts.push(brandKit.dealershipName);
    if (brandKit.locations) parts.push(brandKit.locations);
    if (brandKit.phoneNumber || brandKit.phone) parts.push(`📞 ${brandKit.phoneNumber || brandKit.phone}`);
    if (brandKit.socialHandle) parts.push(brandKit.socialHandle);
    const footerText = parts.join('   •   ');
    if (footerText) {
      const stripHeight = 56;
      const strip = new fabric.Rect({
        left: 0, top: h - stripHeight, width: w, height: stripHeight,
        fill: 'rgba(15, 15, 25, 0.85)', selectable: false, evented: false,
      });
      (strip as any).id = 'footer-strip';
      canvas.add(strip);

      const text = new fabric.Textbox(footerText, {
        fontFamily: brandKit.bodyFont || 'Inter',
        fontSize: 16, fontWeight: '500', fill: '#FFFFFF', textAlign: 'center',
        width: w - 80, left: w / 2, top: h - stripHeight / 2,
        originX: 'center', originY: 'center',
      });
      (text as any).id = 'footer-text';
      canvas.add(text);
    }
  } else if (brandKit.dealershipName) {
    const name = new fabric.Textbox(brandKit.dealershipName, {
      fontFamily: brandKit.bodyFont || 'Inter',
      fontSize: 28, fontWeight: '500', fill: '#FFFFFF', textAlign: 'center',
      width: 600, left: w / 2, top: h - 32,
      originX: 'center', originY: 'bottom',
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 6, offsetX: 0, offsetY: 2 }),
    });
    (name as any).id = 'brand-name';
    canvas.add(name);
  }
}