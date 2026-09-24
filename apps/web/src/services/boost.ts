import api from './api';

export interface BoostCampaign {
  id: string;
  dealerId: string;
  postId: string;
  post?: {
    id: string;
    title: string;
    thumbnail?: string;
  };
  metaCampaignId?: string;
  dailyBudget: number;
  durationDays: number;
  startDate?: string;
  endDate?: string;
  targeting: TargetingSpec;
  status: 'draft' | 'active' | 'paused' | 'completed';
  totalSpent: number;
  metrics?: BoostMetrics;
  createdAt: string;
}

export interface TargetingSpec {
  location: {
    city: string;
    latitude?: number;
    longitude?: number;
    radius: number;
  };
  ageMin: number;
  ageMax: number;
  gender?: 'all' | 'male' | 'female';
  interests?: Array<{ id: string; name: string }>;
}

export interface BoostMetrics {
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  calls?: number;
}

export interface CreateBoostRequest {
  postId: string;
  dailyBudget: number;
  durationDays: number;
  targeting: TargetingSpec;
}

export interface BoostStats {
  totalSpendThisMonth: number;
  totalReachThisMonth: number;
  totalClicksThisMonth: number;
  avgCtr: number;
  campaignsThisMonth: number;
}

export const boostService = {
  list: (params?: { status?: string; page?: number; pageSize?: number }) =>
    api.get<{ items: BoostCampaign[]; total: number; stats: BoostStats }>('/boost', params),
  
  get: (id: string) =>
    api.get<{ item: BoostCampaign }>(`/boost/${id}`),
  
  create: (data: CreateBoostRequest) =>
    api.post<{ item: BoostCampaign }>('/boost', data),
  
  pause: (id: string) =>
    api.post<{ item: BoostCampaign }>(`/boost/${id}/pause`),
  
  resume: (id: string) =>
    api.post<{ item: BoostCampaign }>(`/boost/${id}/resume`),
  
  stop: (id: string) =>
    api.post<{ item: BoostCampaign }>(`/boost/${id}/stop`),
  
  getMetrics: (id: string) =>
    api.get<{ metrics: BoostMetrics }>(`/boost/${id}/metrics`),
  
  // POST /boost/reach-estimate — people per day; the wizard's only reach figure.
  getReachEstimate: (dailyBudget: number) =>
    api.post<{ minReach: number; maxReach: number }>('/boost/reach-estimate', { dailyBudget }),
};
