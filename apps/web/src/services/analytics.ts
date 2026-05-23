import api from './api';

export interface TimeseriesDataPoint {
  date: string;
  reach: number;
  leads: number;
}

export interface PlatformMetrics {
  reach: number;
  engagement: number;
  leads: number;
}

export interface SentimentMetrics {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
}

export interface ResponseMetrics {
  responseRate: number;
  avgResponseTimeMinutes: number;
}

export interface AnalyticsSummary {
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalEngagement: number;
  engagementRate: number;
  totalLeads: number;
  totalSpent: number;
  costPerLead: number;
}

export interface AnalyticsOverviewResponse {
  success: boolean;
  useMockData: boolean;
  summary: AnalyticsSummary;
  platforms: Record<string, PlatformMetrics>;
  sentiment: SentimentMetrics;
  responses: ResponseMetrics;
  timeseries: TimeseriesDataPoint[];
}

export interface MockComment {
  id: string;
  customer_name: string;
  message_text: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  received_at: string;
  reply_text?: string;
}

export interface PostAnalyticsItem {
  id: string;
  prompt_text: string;
  caption_text?: string;
  creative_urls?: Record<string, string>;
  platforms: string[];
  published_at?: string;
  reach: number;
  likes: number;
  comments: number;
  clicks: number;
  details: Record<string, any>;
  mockComments?: MockComment[];
}

export interface AnalyticsPostsResponse {
  success: boolean;
  useMockData: boolean;
  data: PostAnalyticsItem[];
}

export const analyticsService = {
  getOverview: (range = '30d') =>
    api.get<AnalyticsOverviewResponse>('/analytics/overview', { range }),

  getPosts: (params?: { range?: string; platform?: string; sortBy?: string }) =>
    api.get<AnalyticsPostsResponse>('/analytics/posts', params),
};

export default analyticsService;
