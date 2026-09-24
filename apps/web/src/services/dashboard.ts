import api from './api';
import type { AnalyticsPlatform, DealerAnalytics, PostPerformance } from '../utils/analytics';

export type { DealerAnalytics } from '../utils/analytics';

export interface DashboardStats {
  postsThisMonth: number;
  postsChange: number;
  /** Posts published this month (Analytics "Posts Published", the Report). */
  publishedThisMonth: number;
  publishedChange: number;
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

export const dashboardService = {
  get: () => api.get<DashboardData>('/dealer/dashboard'),
  analytics: () => api.get<DealerAnalytics>('/dealer/analytics'),
  postPerformance: (days: number, platform?: AnalyticsPlatform) =>
    api.get<PostPerformance>('/dealer/analytics/posts', { days, platform }),
};
