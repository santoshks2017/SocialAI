import { create } from 'zustand';
import type { CarPngVariant, SceneVariant, AspectRatio } from './types';
import { ASPECT_DIMS } from './types';

interface CanvasStore {
  carLibrary: CarPngVariant[];
  sceneVariants: SceneVariant[];
  selectedSceneIdx: number | null;
  selectedObject: unknown;
  aspectRatio: AspectRatio;
  isLoading: boolean;
  loadingMessage: string;
  autoContrast: boolean;
  matchSceneLighting: boolean;
  contactShadow: boolean;

  setCarVariant: (v: CarPngVariant) => void;
  removeCarVariant: (pose: CarPngVariant['pose']) => void;
  setSceneVariants: (vs: SceneVariant[]) => void;
  selectScene: (idx: number) => void;
  setSelectedObject: (o: unknown) => void;
  setAspectRatio: (a: AspectRatio) => void;
  setLoading: (loading: boolean, msg?: string) => void;
  setAutoContrast: (v: boolean) => void;
  setMatchSceneLighting: (v: boolean) => void;
  setContactShadow: (v: boolean) => void;
  getDimensions: () => { width: number; height: number };
  reset: () => void;
}

const DEFAULTS = {
  carLibrary: [] as CarPngVariant[],
  sceneVariants: [] as SceneVariant[],
  selectedSceneIdx: null as number | null,
  selectedObject: null as unknown,
  aspectRatio: '3:4' as AspectRatio,
  isLoading: false,
  loadingMessage: '',
  autoContrast: true,
  matchSceneLighting: true,
  contactShadow: true,
};

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  ...DEFAULTS,

  setCarVariant:   (v) => set({ carLibrary: [...get().carLibrary.filter((c)=>c.pose!==v.pose), v] }),
  removeCarVariant:(pose) => set({ carLibrary: get().carLibrary.filter((c)=>c.pose!==pose) }),
  setSceneVariants:(vs) => set({ sceneVariants:vs, selectedSceneIdx: vs.length>0?0:null }),
  selectScene:     (idx) => set({ selectedSceneIdx:idx }),
  setSelectedObject:(o) => set({ selectedObject:o }),
  setAspectRatio:  (a) => set({ aspectRatio:a }),
  setLoading:      (loading,msg='') => set({ isLoading:loading, loadingMessage:msg }),
  setAutoContrast: (v) => set({ autoContrast:v }),
  setMatchSceneLighting:(v) => set({ matchSceneLighting:v }),
  setContactShadow:(v) => set({ contactShadow:v }),
  getDimensions:   () => ASPECT_DIMS[get().aspectRatio],
  reset:           () => set(DEFAULTS),
}));
