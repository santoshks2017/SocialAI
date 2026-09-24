import api from './api';

export const dealerService = {
  /** POST /dealer/logo (multipart "logo"): stores the logo and sets it on the dealer. */
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('logo', file, file.name || 'logo.png');
    return api.upload<{ logo_url: string }>('/dealer/logo', form);
  },
};
