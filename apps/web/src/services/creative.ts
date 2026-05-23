import api from './api';

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
  platforms: string[];
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  scheduled_at?: string;
  published_at?: string;
  metrics?: {
    reach?: number;
    likes?: number;
    comments?: number;
  };
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

  uploadVideo: (file: File) => {
    const form = new FormData();
    const filename = file.name || `pasted-video-${Date.now()}.mp4`;
    form.append('file', file, filename);
    return api.upload<{ id: string; url: string }>('/upload/video', form);
  },
};

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
  }) =>
    api.post<{ item: Post }>('/publisher', data),
  
  update: (id: string, data: Partial<Post>) =>
    api.patch<{ item: Post }>(`/publisher/posts/${id}`, data),
  
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/publisher/${id}`),
  
  publish: (id: string, platforms: string[]) =>
    api.post<{ item: Post, job_ids: string[] }>('/publisher/publish', { post_id: id, platforms }),
  
  schedule: (id: string, platforms: string[], scheduled_at: string) =>
    api.post<{ item: Post, job_ids: string[] }>('/publisher/publish', { post_id: id, platforms, scheduled_at }),

  reschedule: (id: string, scheduled_at: string) =>
    api.patch<{ success: boolean; item: Post }>(`/publisher/posts/${id}/reschedule`, { scheduled_at }),
  
  getCalendar: (startDate: string, endDate: string) =>
    api.get<{ data: Post[] }>('/publisher/calendar', { from: startDate, to: endDate }),
  
  getMetrics: (id: string) =>
    api.get<{ metrics: Post['metrics'] }>(`/publisher/posts/${id}/metrics`),
};

export const inventoryService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    make?: string;
    model?: string;
    condition?: string;
    status?: string;
  }) =>
    api.get<{ items: InventoryItem[]; total: number }>('/inventory', params),
  
  get: (id: string) =>
    api.get<{ item: InventoryItem }>(`/inventory/${id}`),
  
  create: (data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<{ item: InventoryItem }>('/inventory', data),
  
  update: (id: string, data: Partial<InventoryItem>) =>
    api.patch<{ item: InventoryItem }>(`/inventory/${id}`, data),
  
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/inventory/${id}`),
  
  markSold: (id: string) =>
    api.patch<{ item: InventoryItem }>(`/inventory/${id}`, { status: 'sold' }),
  
  bulkMarkSold: (ids: string[]) =>
    api.post<{ success: boolean }>('/inventory/bulk-sold', { ids }),

  batch: (items: any[]) =>
    api.post<{ success: boolean; count: number }>('/inventory/batch', { items }),
  
  upload: async (file: File, mapping: Record<string, string>, mode: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    formData.append('mode', mode);
    return api.upload<{ result: InventoryImportResult }>('/inventory/upload', formData);
  },
};

export interface InventoryItem {
  id: string;
  dealerId: string;
  make: string;
  model: string;
  variant?: string;
  year: number;
  price: number;
  condition: 'new' | 'used';
  color?: string;
  fuelType?: string;
  transmission?: string;
  mileageKm?: number;
  stockCount: number;
  imageUrls: string[];
  status: 'in_stock' | 'sold' | 'reserved';
  source: 'manual' | 'csv' | 'api';
  createdAt: string;
}

export interface InventoryImportResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; field: string; message: string }>;
}
