import api from './api';
import type { FestivalDate } from '../utils/calendar';

export const dealerService = {
  /** POST /dealer/logo (multipart "logo"): stores the logo and sets it on the dealer. */
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('logo', file, file.name || 'logo.png');
    return api.upload<{ logo_url: string }>('/dealer/logo', form);
  },

  /** GET /dealer/festivals?from&to: festival dates for the dealer's region (YYYY-MM-DD, end exclusive). */
  festivals: (from: string, to: string) =>
    api.get<{ success: boolean; festivals: Array<FestivalDate & { id: string; isRegional: boolean }> }>('/dealer/festivals', { from, to }),
};
