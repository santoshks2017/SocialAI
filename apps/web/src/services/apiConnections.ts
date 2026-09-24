import api from './api';

export interface ModelOption { id: string; label: string }
export interface ModelChoices { text: string | null; image: string | null; video: string | null; videoResolution: string | null; reelEngine: 'ai' | 'quick' | null }
export interface ModelOptions { text: ModelOption[]; image: ModelOption[]; video: ModelOption[]; videoResolutions: string[] }
export interface ModelDefaults { text: string; image: string; video: string; videoResolution: string; reelEngine: 'ai' | 'quick' }
export interface KeyTestModel { kind: 'text' | 'image' | 'video'; id: string; label: string; available: boolean }

export interface ApiConnectionView {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  notes: string | null;
  enabled: boolean;
  hasKey: boolean;
  keyLast4: string | null;
  keyUpdatedAt: string | null;
  keyUpdatedBy: string | null;
  inUse: boolean;
  models: ModelChoices;
}

export interface ApiConnectionsList {
  items: ApiConnectionView[];
  providers: Array<{ id: string; label: string }>;
  activeKey: { source: 'saved' | 'env' | 'none'; connectionId: string | null };
  envKeyPresent: boolean;
  keyStorageReady: boolean;
  modelOptions: ModelOptions;
  modelDefaults: ModelDefaults;
}

export interface KeyTestResult {
  ok: boolean;
  detail: string;
  source: 'saved' | 'env';
  canGenerateImages: boolean;
  canGenerateVideo: boolean;
  models: KeyTestModel[];
}

const BASE = '/admin/api-connections';

export const apiConnectionService = {
  list: () => api.get<ApiConnectionsList>(BASE),
  create: (body: { name: string; provider: string; notes?: string }) => api.post<ApiConnectionView>(BASE, body),
  update: (
    id: string,
    body: {
      name?: string;
      notes?: string | null;
      enabled?: boolean;
      textModel?: string | null;
      imageModel?: string | null;
      videoModel?: string | null;
      videoResolution?: string | null;
      reelEngine?: 'ai' | 'quick' | null;
    },
  ) => api.patch<ApiConnectionView>(`${BASE}/${id}`, body),
  remove: (id: string) => api.delete<{ success: boolean }>(`${BASE}/${id}`),
  saveKey: (id: string, key: string) => api.put<ApiConnectionView>(`${BASE}/${id}/key`, { key }),
  removeKey: (id: string) => api.delete<ApiConnectionView>(`${BASE}/${id}/key`),
  test: (id: string) => api.post<KeyTestResult>(`${BASE}/${id}/test`),
};
