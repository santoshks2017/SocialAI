import api from './api';

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
}

export interface ApiConnectionsList {
  items: ApiConnectionView[];
  providers: Array<{ id: string; label: string }>;
  activeKey: { source: 'saved' | 'env' | 'none'; connectionId: string | null };
  envKeyPresent: boolean;
  keyStorageReady: boolean;
}

export interface KeyTestResult {
  ok: boolean;
  detail: string;
  source: 'saved' | 'env';
  canGenerateImages: boolean;
  canGenerateVideo: boolean;
}

const BASE = '/admin/api-connections';

export const apiConnectionService = {
  list: () => api.get<ApiConnectionsList>(BASE),
  create: (body: { name: string; provider: string; notes?: string }) => api.post<ApiConnectionView>(BASE, body),
  update: (id: string, body: { name?: string; notes?: string | null; enabled?: boolean }) => api.patch<ApiConnectionView>(`${BASE}/${id}`, body),
  remove: (id: string) => api.delete<{ success: boolean }>(`${BASE}/${id}`),
  saveKey: (id: string, key: string) => api.put<ApiConnectionView>(`${BASE}/${id}/key`, { key }),
  removeKey: (id: string) => api.delete<ApiConnectionView>(`${BASE}/${id}/key`),
  test: (id: string) => api.post<KeyTestResult>(`${BASE}/${id}/test`),
};
