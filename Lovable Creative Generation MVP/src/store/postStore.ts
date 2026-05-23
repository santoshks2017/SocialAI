// src/store/postStore.ts
// Reference implementation for v5 store with Lovable Cloud AI + procedural fallback.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateSceneImage, generateCopyVariants as generateCopyAI } from '@/api/lovable-ai';
import { generateProceduralScene, pickSceneStyle } from '@/api/procedural-scene';
import { buildScenePrompt } from '@/lib/scene-prompt';
import { extractSceneMetadata, type LightingProfile } from '@/lib/scene-analysis';
import { toast } from 'sonner';

export interface CarPngVariant {
  pose: 'front' | 'front-three-quarter' | 'side-profile' | 'hero-low-angle';
  previewUrl: string;
  fileName: string;
  width: number;
  height: number;
}

export interface SceneVariant {
  sceneUrl: string;
  pose: CarPngVariant['pose'];
  bounds: { x: number; y: number; width: number; height: number };
  lighting: LightingProfile;
  usedAI: boolean;
}

export interface CopyVariant {
  heading: string;
  byline: string;
}

export interface ContextInput {
  model: string;
  brief: string;
}

type Step = 'input' | 'generating' | 'editing' | 'exporting';

export type AspectRatio = '3:4' | '1:1' | '9:16' | '4:5' | '16:9';
const ASPECT_DIMS: Record<AspectRatio, { width: number; height: number }> = {
  '3:4': { width: 1080, height: 1440 },
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
};

interface PostStore {
  carLibrary: CarPngVariant[];
  context: ContextInput;
  sceneVariants: SceneVariant[];
  copyVariants: CopyVariant[];
  selectedSceneIdx: number | null;
  selectedCopyIdx: number | null;
  selectedObject: any;
  canvasState: any;
  currentStep: Step;
  isLoading: boolean;
  loadingMessage: string;
  aspectRatio: AspectRatio;
  autoContrast: boolean;
  matchSceneLighting: boolean;
  contactShadow: boolean;

  setCarVariant: (variant: CarPngVariant) => void;
  removeCarVariant: (pose: CarPngVariant['pose']) => void;
  setContext: (patch: Partial<ContextInput>) => void;
  setSelectedObject: (obj: any) => void;
  setCanvasState: (state: any) => void;
  setAspectRatio: (a: AspectRatio) => void;
  setAutoContrast: (v: boolean) => void;
  setMatchSceneLighting: (v: boolean) => void;
  setContactShadow: (v: boolean) => void;
  getDimensions: () => { width: number; height: number };

  startGeneration: () => Promise<void>;
  regenerateScenes: () => Promise<void>;
  tryAnotherPose: () => Promise<void>;
  regenerateCopy: () => Promise<void>;
  selectScene: (idx: number) => void;
  selectCopy: (idx: number) => void;
  reset: () => void;
}

const initialContext: ContextInput = { model: '', brief: '' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function inferModelClass(modelName: string): string {
  const m = modelName.toLowerCase();
  if (/sierra|creta|brezza|nexon|venue|seltos|sonet|kushaq|taigun|harrier|safari|hector/.test(m)) return 'compact-suv';
  if (/fortuner|endeavour|gloster|alcazar|innova/.test(m)) return 'suv';
  if (/swift|baleno|i20|altroz|polo|tiago|punch/.test(m)) return 'hatchback';
  if (/dzire|amaze|aura|tigor|rapid|virtus|slavia|verna|city/.test(m)) return 'sedan';
  if (/audi|bmw|mercedes|jaguar|volvo/.test(m)) return 'luxury-sedan';
  return 'compact-suv';
}

function pickWeightedPoses(library: CarPngVariant['pose'][]): CarPngVariant['pose'][] {
  const weighted = library.flatMap((p) => p === 'front-three-quarter' ? [p, p, p] : [p]);
  const chosen: CarPngVariant['pose'][] = [];
  for (let i = 0; i < 3; i++) {
    chosen.push(weighted[Math.floor(Math.random() * weighted.length)]);
  }
  return chosen;
}

async function generateOneScene(opts: {
  pose: CarPngVariant['pose'];
  brief: string;
  modelName: string;
  modelClass: string;
}): Promise<SceneVariant> {
  // Try Lovable Cloud AI first
  try {
    const prompt = buildScenePrompt({
      brief: opts.brief,
      modelName: opts.modelName,
      pose: opts.pose,
      modelClass: opts.modelClass,
    });
    const sceneUrl = await generateSceneImage(prompt, { width: 1080, height: 1440 });
    const metadata = await extractSceneMetadata(sceneUrl, opts.pose);
    return { sceneUrl, pose: opts.pose, ...metadata, usedAI: true };
  } catch (err) {
    console.warn('AI scene generation failed, falling back to procedural', err);
    const style = pickSceneStyle(opts.brief);
    const sceneUrl = await generateProceduralScene(opts.pose, style);
    const metadata = await extractSceneMetadata(sceneUrl, opts.pose);
    return { sceneUrl, pose: opts.pose, ...metadata, usedAI: false };
  }
}

function templateCopyFallback(brief: string, model: string): CopyVariant[] {
  const b = brief.toLowerCase();
  const isFestive = /diwali|festive|holi|navratri/.test(b);
  const isOffer = /off|discount|save|₹|rs\b|rupees/.test(b);
  const occasion = isFestive ? 'this Diwali' : 'this season';

  return [
    {
      heading: `The ${model.split(' ').pop()} is here`,
      byline: `Visit Apex Motors and book your ${model} ${occasion}. Limited-period benefits available.`,
    },
    {
      heading: `Book your ${model.split(' ').pop()}`,
      byline: `Walk into Apex Motors today. Special ${occasion} offers on every ${model} variant.`,
    },
    {
      heading: `Yours, ${occasion}`,
      byline: `Bring home the ${model} ${occasion}${isOffer ? ' with on-road benefits' : ''}. Apex Motors.`,
    },
  ];
}

export const usePostStore = create<PostStore>()(
  persist(
    (set, get) => ({
      carLibrary: [],
      context: initialContext,
      sceneVariants: [],
      copyVariants: [],
      selectedSceneIdx: null,
      selectedCopyIdx: null,
      selectedObject: null,
      canvasState: null,
      currentStep: 'input',
      isLoading: false,
      loadingMessage: '',
      aspectRatio: '3:4',
      autoContrast: true,
      matchSceneLighting: true,
      contactShadow: true,

      setCarVariant: (variant) => {
        const current = get().carLibrary.filter((c) => c.pose !== variant.pose);
        set({ carLibrary: [...current, variant] });
      },

      removeCarVariant: (pose) => {
        set({ carLibrary: get().carLibrary.filter((c) => c.pose !== pose) });
      },

      setContext: (patch) => set({ context: { ...get().context, ...patch } }),
      setSelectedObject: (obj) => set({ selectedObject: obj }),
      setCanvasState: (state) => set({ canvasState: state }),
      setAspectRatio: (a) => set({ aspectRatio: a }),
      setAutoContrast: (v) => set({ autoContrast: v }),
      setMatchSceneLighting: (v) => set({ matchSceneLighting: v }),
      setContactShadow: (v) => set({ contactShadow: v }),
      getDimensions: () => ASPECT_DIMS[get().aspectRatio],

      startGeneration: async () => {
        const { carLibrary, context } = get();
        if (carLibrary.length === 0) {
          toast.error('Upload at least one car PNG');
          return;
        }
        if (!context.model || context.brief.length < 20) {
          toast.error('Fill in model and a brief (at least 20 characters)');
          return;
        }

        set({ isLoading: true, currentStep: 'generating', loadingMessage: 'Reading your brief...' });
        await sleep(700);

        set({ loadingMessage: 'Picking scene angles...' });
        const availablePoses = carLibrary.map((c) => c.pose);
        const chosenPoses = pickWeightedPoses(availablePoses);
        const modelClass = inferModelClass(context.model);
        await sleep(500);

        set({ loadingMessage: 'Composing scenes...' });
        const variants: SceneVariant[] = [];
        for (const pose of chosenPoses) {
          variants.push(await generateOneScene({
            pose,
            brief: context.brief,
            modelName: context.model,
            modelClass,
          }));
        }

        set({ loadingMessage: 'Writing copy options...' });
        let copy: CopyVariant[];
        try {
          copy = await generateCopyAI({
            brief: context.brief,
            modelName: context.model,
            dealershipName: 'Apex Motors',
          });
        } catch (err) {
          console.warn('AI copy generation failed, using template', err);
          copy = templateCopyFallback(context.brief, context.model);
        }

        set({
          sceneVariants: variants,
          copyVariants: copy,
          selectedSceneIdx: 0,
          selectedCopyIdx: 0,
          isLoading: false,
          currentStep: 'editing',
        });
      },

      regenerateScenes: async () => {
        const { carLibrary, context } = get();
        if (carLibrary.length === 0) return;

        set({ isLoading: true, loadingMessage: 'Composing new scenes...' });
        const availablePoses = carLibrary.map((c) => c.pose);
        const chosenPoses = pickWeightedPoses(availablePoses);
        const modelClass = inferModelClass(context.model);

        const variants: SceneVariant[] = [];
        for (const pose of chosenPoses) {
          variants.push(await generateOneScene({
            pose,
            brief: context.brief,
            modelName: context.model,
            modelClass,
          }));
        }
        set({ sceneVariants: variants, selectedSceneIdx: 0, isLoading: false });
      },

      tryAnotherPose: async () => {
        const { carLibrary, sceneVariants, selectedSceneIdx, context } = get();
        if (carLibrary.length < 2) {
          toast.error('Upload more car angles to try different poses');
          return;
        }
        const currentPose = sceneVariants[selectedSceneIdx ?? 0]?.pose;
        const otherPoses = carLibrary.filter((c) => c.pose !== currentPose).map((c) => c.pose);
        const newPose = otherPoses[Math.floor(Math.random() * otherPoses.length)];
        const modelClass = inferModelClass(context.model);

        set({ isLoading: true, loadingMessage: `Generating ${newPose.replace('-', ' ')} angle...` });

        const newVariant = await generateOneScene({
          pose: newPose,
          brief: context.brief,
          modelName: context.model,
          modelClass,
        });

        const updated = [...sceneVariants];
        updated[selectedSceneIdx ?? 0] = newVariant;
        set({ sceneVariants: updated, isLoading: false });
      },

      regenerateCopy: async () => {
        const { context } = get();
        set({ isLoading: true, loadingMessage: 'Writing new copy...' });

        let copy: CopyVariant[];
        try {
          copy = await generateCopyAI({
            brief: context.brief,
            modelName: context.model,
            dealershipName: 'Apex Motors',
          });
        } catch (err) {
          copy = templateCopyFallback(context.brief, context.model);
        }
        set({ copyVariants: copy, isLoading: false });
      },

      selectScene: (idx) => set({ selectedSceneIdx: idx }),
      selectCopy: (idx) => set({ selectedCopyIdx: idx }),

      reset: () => set({
        carLibrary: [],
        context: initialContext,
        sceneVariants: [],
        copyVariants: [],
        selectedSceneIdx: null,
        selectedCopyIdx: null,
        canvasState: null,
        currentStep: 'input',
      }),
    }),
    {
      name: 'social-saas-post-store',
      partialize: (state) => ({
        context: state.context,
        carLibrary: state.carLibrary,
        canvasState: state.canvasState,
      }),
    }
  )
);
