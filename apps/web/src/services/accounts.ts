import api from './api';
import type { ConnectedAccount } from '../utils/accounts';

export const accountsService = {
  list: async (): Promise<ConnectedAccount[]> =>
    (await api.get<{ accounts?: ConnectedAccount[] }>('/platform-accounts')).accounts ?? [],

  remove: (id: string) => api.delete<{ success: boolean }>(`/platform-accounts/${id}`),

  syncInstagram: () => api.post<{ found: number; accountName: string | null }>('/platforms/sync-instagram', {}),
};
