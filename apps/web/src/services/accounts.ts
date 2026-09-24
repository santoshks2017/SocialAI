import api from './api';
import type { ConnectedAccount } from '../utils/accounts';

export const accountsService = {
  // The API checks each Meta token live unless `verify` is false: pickers that only need the list skip it.
  list: async (options: { verify?: boolean } = {}): Promise<ConnectedAccount[]> =>
    (await api.get<{ accounts?: ConnectedAccount[] }>('/platform-accounts', options.verify === false ? { verify: 0 } : undefined)).accounts ?? [],

  remove: (id: string) => api.delete<{ success: boolean }>(`/platform-accounts/${id}`),

  syncInstagram: () => api.post<{ found: number; accountName: string | null }>('/platforms/sync-instagram', {}),
};
