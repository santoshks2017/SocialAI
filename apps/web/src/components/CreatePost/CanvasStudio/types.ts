export type CarPose = 'front' | 'front-three-quarter' | 'side-profile' | 'hero-low-angle';

export interface CarPngVariant {
  pose: CarPose;
  previewUrl: string;
  file: File;
  width: number;
  height: number;
}

export interface LightingProfile {
  direction: 'left' | 'right' | 'front' | 'behind' | 'top';
  warmth: number;     // -1 cool … 1 warm
  brightness: number; // 0 … 1
  contrast: number;   // 0 … 1
  primaryHex: string;
}

export interface SceneVariant {
  sceneUrl: string;
  pose: CarPose;
  bounds: { x: number; y: number; width: number; height: number };
  lighting: LightingProfile;
  usedAI: boolean;
}

export type AspectRatio = '3:4' | '1:1' | '9:16' | '4:5' | '16:9';

export const ASPECT_DIMS: Record<AspectRatio, { width: number; height: number }> = {
  '3:4':  { width: 1080, height: 1440 },
  '1:1':  { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '4:5':  { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
};

/**
 * Typed accessor for the `id` custom property set on Fabric.js canvas objects.
 * Avoids scattering `(o as any).id` across callsites.
 */
export function getObjectId(obj: object): string {
  return (obj as Record<string, unknown>)['id'] as string ?? '';
}
