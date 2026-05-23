import api from './api';

// Local type stubs — avoids workspace package resolution issues on Vercel
interface Dealer { id: string; name: string; phone: string; city: string; [key: string]: unknown }
interface DealerFormData { name?: string; city?: string; [key: string]: unknown }
interface PlatformConnection { id: string; platform: string; [key: string]: unknown }
interface ApiResponse<T = unknown> { success: boolean; data?: T; message?: string }

export interface LoginRequest {
  phone: string;
  otp: string;
}

export interface LoginResponse {
  dealer: Dealer;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterRequest {
  phone: string;
  name: string;
  city: string;
  brands: string[];
}

interface DemoLoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    role: string;
    dealer_id: string | null;
    permissions: Record<string, boolean>;
    onboarding_completed: boolean;
    onboarding_step: number;
  };
}

export const authService = {
  sendOtp: (phone: string) =>
    api.post<{ success: boolean; message: string }>('/auth/otp/send', { phone }),

  verifyOtp: (phone: string, otp: string) =>
    api.post<DemoLoginResponse>('/auth/otp/verify', { phone, otp }),

  sendEmailOtp: (email: string) =>
    api.post<{ success: boolean; message: string }>('/auth/email-otp/send', { email }),

  verifyEmailOtp: (email: string, otp: string) =>
    api.post<DemoLoginResponse>('/auth/email-otp/verify', { email, otp }),

  loginDemo: () =>
    api.post<DemoLoginResponse>('/auth/demo'),

  refreshToken: (refreshToken: string) =>
    api.post<{ token: string }>('/auth/refresh', { refreshToken }),
};

export const dealerService = {
  getProfile: () =>
    api.get<ApiResponse<Dealer>>('/dealer/profile'),
  
  updateProfile: (data: Partial<DealerFormData>) =>
    api.patch<ApiResponse<Dealer>>('/dealer/profile', data),
  
  uploadLogo: async (file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    return api.upload<ApiResponse<{ logoUrl: string }>>('/dealer/logo', formData);
  },
  
  getDashboardStats: () =>
    api.get<ApiResponse<{
      postsThisMonth: number;
      postsChange: number;
      totalReach: number;
      reachChange: number;
      leadsGenerated: number;
      leadsChange: number;
      inboxPending: number;
      negativeReviews: number;
    }>>('/dealer/stats'),
};

export const platformService = {
  getConnections: () =>
    api.get<ApiResponse<PlatformConnection[]>>('/platforms'),
  
  connect: (platform: string) =>
    api.post<ApiResponse<{ authUrl: string }>>(`/platforms/${platform}/connect`),
  
  disconnect: (platform: string) =>
    api.delete<ApiResponse<void>>(`/platforms/${platform}`),
  
  refreshToken: (platform: string) =>
    api.post<ApiResponse<PlatformConnection>>(`/platforms/${platform}/refresh`),
  
  getOAuthUrl: (platform: string) =>
    api.get<ApiResponse<{ url: string }>>(`/platforms/${platform}/oauth-url`),
  
  handleCallback: (platform: string, code: string) =>
    api.post<ApiResponse<PlatformConnection>>(`/platforms/${platform}/callback`, { code }),
};
