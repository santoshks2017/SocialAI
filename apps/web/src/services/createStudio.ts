import api from './api';
import type { PlatformSpecs, VisualSource } from '../utils/createStudio';
import type { VideoJobState } from '../utils/videoJobPolling';

export type VideoEngineName = 'kenburns' | 'veo';

export interface CarModelMatch {
  id: string;
  brand: string;
  model_name: string;
  color: string | null;
  image_url: string;
}

export interface GeneratedPost {
  creatives: string[];
  copies: Array<{ caption: string; hashtags: string[] }>;
}

export interface VideoJobView extends VideoJobState {
  job_id: string;
  engine: VideoEngineName;
  thumbnail_url: string | null;
  caption: string | null;
  hashtags: string[];
}

export interface StartVideoInput {
  prompt: string;
  language: string;
  aspect_ratio: string;
  duration_seconds?: number;
  image_url?: string;
  engine?: VideoEngineName;
}

// The brief /creatives/elaborate-prompt returns; generate-detailed-post takes the same fields.
interface PromptBrief {
  brand: string;
  model_name: string;
  car_angle: string;
  background_theme: string;
  background_details: string;
  background_details_option2?: string;
  background_details_option3?: string;
  lighting_mood: string;
  headline: string;
  caption: string;
  caption_option2?: string;
  caption_option3?: string;
  hashtags: string[];
  hashtags_option2?: string[];
  hashtags_option3?: string[];
}

const withHash = (tags: string[] | undefined): string[] =>
  (tags ?? []).map((t) => t.trim().replace(/^#+/, '')).filter(Boolean).map((t) => `#${t}`);

export const createStudioService = {
  platformSpecs: async (): Promise<PlatformSpecs> =>
    (await api.get<{ success: boolean; data: PlatformSpecs }>('/platform-specs')).data,

  searchCarModels: async (q: string): Promise<CarModelMatch[]> =>
    (await api.get<{ success: boolean; models: CarModelMatch[] }>('/creatives/car-models', { q })).models,

  /**
   * Image post: the prompt becomes a creative brief, then three designs with three caption options.
   * Scratch AI uses the attached car photo (or the matched car's photo) as the car reference;
   * Inspiration and Branded send the upload as `uploaded_image_url`.
   */
  generatePost: async (input: { prompt: string; language: string; source: VisualSource; uploadUrl: string | null; car: CarModelMatch | null }): Promise<GeneratedPost> => {
    const { brief } = await api.post<{ success: boolean; brief: PromptBrief }>('/creatives/elaborate-prompt', { prompt: input.prompt, language: input.language });
    const scratch = input.source === 'generate_scratch';
    const carPhoto = scratch ? (input.uploadUrl ?? (input.car?.image_url || null)) : null;
    const res = await api.post<{ success: boolean; creatives: Array<{ creativeUrl: string }>; captions: Array<{ caption?: string; hashtags?: string[] }> }>(
      '/creatives/generate-detailed-post',
      {
        ...brief,
        prompt: input.prompt,
        ...(input.car ? { brand: input.car.brand, model_name: input.car.model_name } : {}),
        image_mode: input.source,
        ...(!scratch && input.uploadUrl ? { uploaded_image_url: input.uploadUrl } : {}),
        ...(carPhoto ? { model_image_url: carPhoto } : {}),
      },
    );
    return {
      creatives: res.creatives.map((c) => c.creativeUrl).filter(Boolean),
      copies: res.captions.map((c) => ({ caption: c.caption ?? '', hashtags: withHash(c.hashtags) })),
    };
  },

  suggestHashtags: async (caption: string, city: string, language: string): Promise<string[]> =>
    withHash((await api.post<{ success: boolean; hashtags: string[] }>('/creatives/hashtags', { caption, city, language })).hashtags),

  startVideo: (input: StartVideoInput) =>
    api.post<{ success: boolean; job_id: string; status: string; engine: VideoEngineName }>('/creatives/generate-video', input),

  videoStatus: (jobId: string) =>
    api.get<{ success: boolean } & VideoJobView>('/creatives/generate-video/status', { job: jobId }),
};
