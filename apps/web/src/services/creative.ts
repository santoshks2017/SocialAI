import api from './api';
import type { PublishResponse } from '../utils/publishResult';
import type { PostStatus } from '../utils/posts';

export interface Prompt {
  id: string;
  category: string;
  text_en: string;
  text_hi?: string;
  is_active: boolean;
  usage_count: number;
}

export interface CaptionVariant {
  caption_text: string;
  hashtags: string[];
  suggested_emoji: string[];
  platform_notes?: string;
  style?: string;
}

export interface CreativeBackend {
  id: string;
  template_name: string;
  thumbnail_url: string | null;
  platform_urls: Record<string, string | null>;
}

export interface AIGenerationResponse {
  captions: CaptionVariant[];
  hindi_captions: CaptionVariant[] | null;
  creatives: CreativeBackend[];
  inventory_matched: Record<string, unknown> | null;
  platforms_requested: string[];
}

export interface Post {
  id: string;
  dealer_id: string;
  prompt_text: string;
  caption_text?: string;
  caption_hashtags: string[];
  creative_urls?: Record<string, string>;
  media_type?: 'image' | 'video';
  video_url?: string | null;
  thumbnail_url?: string | null;
  platforms: string[];
  status: PostStatus;
  scheduled_at?: string;
  published_at?: string;
  created_by?: string | null;
  approver_note?: string | null;
  approval_decision?: 'approved' | 'rejected' | null;
  approved_by?: string | null;
  publish_results?: Record<string, unknown> | null;
  metrics?: { reach?: number; likes?: number; comments?: number };
  created_at: string;
}

function mockCaptions(prompt: string, platforms: string[]): AIGenerationResponse {
  const slug = prompt.slice(0, 80).replace(/['"]/g, '');
  return {
    captions: [
      {
        caption_text: `⚡ LIMITED TIME OFFER!\n\n${slug}\n\nDon't miss out — visit our showroom TODAY. Stock is limited!\n📞 Call now!`,
        hashtags: ['#CarDeal', '#SpecialOffer', '#AutoDealer', '#DreamCar'],
        suggested_emoji: ['⚡', '🚗', '📞'],
        platform_notes: 'Best for Instagram Stories/Reels',
        style: 'punchy',
      },
      {
        caption_text: `Here's why our customers choose us:\n\n✅ ${slug}\n✅ Easy finance & EMI options\n✅ Trusted dealership with expert support\n✅ Test drive at your convenience\n\nVisit our showroom or call us to know more!`,
        hashtags: ['#CarBuying', '#TestDrive', '#AutoFinance', '#TrustedDealer'],
        suggested_emoji: ['✅', '🚗', '💰'],
        platform_notes: 'Best for Facebook',
        style: 'detailed',
      },
      {
        caption_text: `Some journeys change everything.\n\n${slug}.\n\nWe believe every family deserves the car of their dreams. Let us make yours happen. 💫`,
        hashtags: ['#DreamCar', '#FamilyFirst', '#NewBeginnings'],
        suggested_emoji: ['❤️', '🌟', '🚗'],
        platform_notes: 'Best for Instagram Feed',
        style: 'emotional',
      },
    ] as AIGenerationResponse['captions'],
    hindi_captions: null,
    creatives: [
      { id: 'tpl_bold_banner',  template_name: 'Bold Banner',      thumbnail_url: null, platform_urls: { facebook: null, instagram: null, instagram_story: null, gmb: null } },
      { id: 'tpl_minimal',      template_name: 'Minimal Showcase', thumbnail_url: null, platform_urls: { facebook: null, instagram: null, instagram_story: null, gmb: null } },
      { id: 'tpl_offer_card',   template_name: 'Offer Card',       thumbnail_url: null, platform_urls: { facebook: null, instagram: null, instagram_story: null, gmb: null } },
    ],
    inventory_matched: null,
    platforms_requested: platforms,
  };
}

export const creativeService = {
  getPrompts: (category?: string) =>
    api.get<{ data: Prompt[] }>('/creatives/prompts', { category }),

  generateCaptions: async (prompt: string, platforms: string[], imageId?: string, force?: boolean): Promise<AIGenerationResponse> => {
    try {
      return await api.post<AIGenerationResponse>('/creatives/generate', { prompt, platforms, image_id: imageId, force });
    } catch {
      // API unreachable or auth not yet ready — return client-side mock captions
      return mockCaptions(prompt, platforms);
    }
  },

  generateFromUrl: async (data: { url: string; dealerId: string; car: string; offer: string; festival: string; city: string }) => {
    return api.post<{ success: boolean; data: { content: { caption: string; headline: string; cta: string; }; template: unknown; image: string; } }>('/generate-from-url', data);
  },

  getTemplates: (category?: string) =>
    api.get<{ items: unknown[] }>('/creatives/templates', { category }),

  renderCreative: (templateId: string, data: Record<string, unknown>) =>
    api.post<{ urls: Record<string, string> }>('/creatives/render', { templateId, data }),

  uploadImage: (file: File) => {
    const form = new FormData();
    // Clipboard files often have empty or generic names; ensure we provide one
    const filename = file.name || `pasted-image-${Date.now()}.png`;
    form.append('file', file, filename);
    return api.upload<{ id: string; url: string }>('/upload/image', form);
  },
};

// PATCH /publisher/posts/:id takes camelCase fields (the API maps them to the stored snake_case).
export interface PostUpdate {
  promptText?: string;
  captionText?: string;
  captionHashtags?: string[];
  creativeUrls?: Record<string, string>;
  platforms?: string[];
  mediaType?: 'image' | 'video';
  videoUrl?: string;
  thumbnailUrl?: string;
}

export const postService = {
  list: (params?: { page?: number; pageSize?: number; status?: string }) =>
    api.get<{ data: Post[]; total: number; page: number; pageSize: number }>('/publisher/posts', params),
  
  get: (id: string) =>
    api.get<{ data: Post }>(`/publisher/posts/${id}`),
  
  create: (data: {
    promptText: string;
    platforms: string[];
    captionText?: string;
    captionHashtags?: string[];
    creativeUrls?: Record<string, string>;
    mediaType?: 'image' | 'video';
    videoUrl?: string;
    thumbnailUrl?: string;
  }) =>
    api.post<{ item: Post }>('/publisher', data),

  update: (id: string, data: PostUpdate) =>
    api.patch<{ item: Post }>(`/publisher/posts/${id}`, data),
  
  // Permanently deletes the post (API answers 409 while it is publishing).
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/publisher/posts/${id}`),

  // Cancels a schedule; the post goes back to draft.
  cancelSchedule: (id: string) =>
    api.delete<{ success: boolean }>(`/publisher/${id}`),
  
  publish: (id: string, platforms: string[]) =>
    api.post<PublishResponse>('/publisher/publish', { post_id: id, platforms }),
  
  schedule: (id: string, platforms: string[], scheduled_at: string) =>
    api.post<PublishResponse>('/publisher/publish', { post_id: id, platforms, scheduled_at }),

  reschedule: (id: string, scheduled_at: string) =>
    api.patch<{ success: boolean; item: Post }>(`/publisher/posts/${id}/reschedule`, { scheduled_at }),
  
  getCalendar: (startDate: string, endDate: string) =>
    api.get<{ data: Post[] }>('/publisher/calendar', { from: startDate, to: endDate }),
  
  getMetrics: (id: string) =>
    api.get<{ metrics: Post['metrics'] }>(`/publisher/posts/${id}/metrics`),

  counts: () => api.get<{ counts: Partial<Record<PostStatus, number>>; total: number }>('/publisher/posts/counts'),
  activity: (days: number) =>
    api.get<{ days: number; posts: Array<{ created_at: string; status: string }> }>('/publisher/posts/activity', { days }),
  submitForApproval: (id: string, platforms?: string[]) =>
    api.post<{ item: Post; approvalUrl: string; whatsappShare: string }>(`/publisher/posts/${id}/submit-for-approval`, platforms ? { platforms } : {}),
  approve: (id: string) => api.post<{ item: Post }>(`/publisher/posts/${id}/approve`),
  reject: (id: string, reason: string) => api.post<{ item: Post }>(`/publisher/posts/${id}/reject`, { reason }),
};

type InventoryItemInput = Partial<Omit<InventoryItem, 'id' | 'dealer_id' | 'created_at' | 'updated_at'>>;

export const inventoryService = {
  list: (params?: {
    page?: number;
    limit?: number;
    condition?: string;
    status?: string;
    search?: string;
  }) =>
    api.get<{ success: boolean; items: InventoryItem[]; pagination: { page: number; limit: number; total: number } }>('/inventory', params),
  
  get: (id: string) =>
    api.get<{ success: boolean; item: InventoryItem }>(`/inventory/${id}`),
  
  create: (data: InventoryItemInput) =>
    api.post<{ success: boolean; item: InventoryItem }>('/inventory', data),
  
  update: (id: string, data: InventoryItemInput) =>
    api.put<{ success: boolean; item: InventoryItem }>(`/inventory/${id}`, data),
  
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/inventory/${id}`),

  setStatus: (id: string, status: InventoryItem['status']) =>
    api.patch<{ success: boolean; item: InventoryItem }>(`/inventory/${id}/status`, { status }),
  
  markSold: (id: string) =>
    api.patch<{ success: boolean; item: InventoryItem }>(`/inventory/${id}/status`, { status: 'sold' }),
  
  // API accepts 1–500 ids per request.
  bulkMarkSold: (ids: string[]) =>
    api.post<{ success: boolean; count: number }>('/inventory/bulk-sold', { ids }),

  batch: (items: InventoryItemInput[]) =>
    api.post<{ success: boolean; count: number }>('/inventory/batch', { items }),
  
  upload: async (file: File, mapping: Record<string, string>, mode: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    formData.append('mode', mode);
    return api.upload<{ result: InventoryImportResult }>('/inventory/upload', formData);
  },
};

// Mirrors the API's InventoryItem row (snake_case).
export interface InventoryItem {
  id: string;
  dealer_id: string;
  make: string;
  model: string;
  variant: string | null;
  year: number;
  price: number;
  condition: 'new' | 'used';
  color: string | null;
  fuel_type: string | null;
  transmission: string | null;
  mileage_km: number | null;
  stock_count: number;
  image_urls: string[];
  status: 'in_stock' | 'sold' | 'reserved';
  source: 'manual' | 'csv' | 'api';
  created_at: string;
  updated_at?: string;
}

export interface InventoryImportResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; field: string; message: string }>;
}
