import api from './api';

export interface AdminMetrics {
  mrr: number;
  wadp: number;
  activeDealers: number;
  totalPosts: number;
  totalUsers: number;
}

export interface AdminDealer {
  id: string;
  name: string;
  city: string;
  state: string;
  phone: string;
  plan: string;
  expiresAt: string | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  postCount: number;
  userCount: number;
  connectedHandles: string[];
  subscriptionStatus: string;
}

export interface ImpersonateResponse {
  success: boolean;
  token: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    role: string;
    dealerId: string;
    dealerName: string;
  };
}

export const adminService = {
  getDashboard: () => api.get<{ success: boolean; metrics: AdminMetrics }>('/admin/dashboard'),
  
  getDealers: () => api.get<{ success: boolean; items: AdminDealer[] }>('/admin/dealers'),
  
  impersonateDealer: (dealerId: string) => 
    api.post<ImpersonateResponse>(`/admin/dealers/${dealerId}/impersonate`),
};
