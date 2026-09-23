import api from './api';

export interface DashboardStats {
  postsThisMonth: number;
  postsChange: number;
  totalReach: number;
  leadsGenerated: number;
  leadsThisWeek: number;
  inboxPending: number;
  negativeReviews: number;
}

export interface Festival {
  id: string;
  name_en: string;
  date: string;
  category: string | null;
}

export interface DashboardData {
  stats: DashboardStats;
  upcomingFestivals: Festival[];
}

export interface DealerAnalytics {
  engagementByType: Array<{ type: string; engagementRate: number }>;
  followerTrend: Array<{ platform: string; current: number; delta: number | null }>;
  reviewSummary: { avgRating: number | null; responseRate: number; totalReviews: number };
}

export const dashboardService = {
  get: () => api.get<DashboardData>('/dealer/dashboard'),
  analytics: () => api.get<DealerAnalytics>('/dealer/analytics'),
};
