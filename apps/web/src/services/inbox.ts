import api from './api';

export interface InboxMessage {
  id: string;
  dealerId: string;
  platform: 'facebook' | 'instagram' | 'gmb' | 'email';
  messageType: 'comment' | 'dm' | 'review' | 'email';
  platformMessageId: string;
  postId?: string;
  customerName: string;
  customerAvatarUrl?: string;
  customerPlatformId?: string;
  emailSubject?: string;
  messageText: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  tag?: 'lead' | 'complaint' | 'general' | 'spam';
  aiSuggestedReply?: string;
  replyText?: string;
  repliedAt?: string;
  isRead: boolean;
  requiresApproval: boolean;
  receivedAt: string;
}

export interface AutoReplyTemplate {
  id: string;
  dealer_id: string;
  name: string;
  text: string;
  created_at: string;
  updated_at: string;
}

export interface AutoReplyRule {
  id: string;
  dealer_id: string;
  platform: string;
  message_type: string;
  condition_type: string;
  condition_value: string;
  action_type: string;
  ai_tone: string | null;
  template_id: string | null;
  template?: AutoReplyTemplate | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  dealerId: string;
  customerName?: string;
  customerPhone?: string;
  sourcePlatform?: 'facebook' | 'instagram' | 'gmb' | 'email';
  sourceType?: 'post' | 'campaign' | 'inbox';
  sourcePostId?: string;
  sourceCampaignId?: string;
  sourceMessageId?: string;
  vehicleInterest?: string;
  notes?: string;
  createdAt: string;
}

export interface CreateLeadRequest {
  customerName: string;
  customerPhone?: string;
  sourcePlatform: 'facebook' | 'instagram' | 'gmb' | 'email';
  sourceMessageId?: string;
  vehicleInterest?: string;
  notes?: string;
}

export const inboxService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    platform?: string;
    tag?: string;
    isRead?: boolean;
    search?: string;
  }) =>
    api.get<{ items: InboxMessage[]; total: number; unreadCount: number }>('/inbox', params),
  
  get: (id: string) =>
    api.get<{ item: InboxMessage }>(`/inbox/${id}`),
  
  markRead: (id: string) =>
    api.patch<{ item: InboxMessage }>(`/inbox/${id}`, { isRead: true }),
  
  markAllRead: () =>
    api.post<{ success: boolean }>('/inbox/mark-all-read'),
  
  updateTag: (id: string, tag: InboxMessage['tag']) =>
    api.patch<{ item: InboxMessage }>(`/inbox/${id}`, { tag }),
  
  sendReply: (id: string, replyText: string) =>
    api.post<{ item: InboxMessage }>(`/inbox/${id}/reply`, { replyText }),
  
  generateReply: (id: string, tone?: string) =>
    api.post<{ suggestedReply: string }>(`/inbox/${id}/suggest-reply`, { tone }),

  getSettings: () =>
    api.get<{ autoReplyEnabled: boolean }>('/inbox/settings'),

  updateSettings: (autoReplyEnabled: boolean) =>
    api.post<{ autoReplyEnabled: boolean }>('/inbox/settings', { autoReplyEnabled }),

  listRules: () =>
    api.get<{ items: AutoReplyRule[] }>('/inbox/rules'),

  createRule: (data: Partial<AutoReplyRule>) =>
    api.post<{ item: AutoReplyRule }>('/inbox/rules', data),

  updateRule: (id: string, data: Partial<AutoReplyRule>) =>
    api.put<{ item: AutoReplyRule }>(`/inbox/rules/${id}`, data),

  deleteRule: (id: string) =>
    api.delete<{ success: boolean }>(`/inbox/rules/${id}`),

  listTemplates: () =>
    api.get<{ items: AutoReplyTemplate[] }>('/inbox/templates'),

  createTemplate: (data: { name: string; text: string }) =>
    api.post<{ item: AutoReplyTemplate }>('/inbox/templates', data),

  updateTemplate: (id: string, data: { name?: string; text?: string }) =>
    api.put<{ item: AutoReplyTemplate }>(`/inbox/templates/${id}`, data),

  deleteTemplate: (id: string) =>
    api.delete<{ success: boolean }>(`/inbox/templates/${id}`),

  generatePostDraft: (id: string) =>
    api.post<{ post: any }>(`/inbox/${id}/generate-post-draft`),

  seedMockEmails: () =>
    api.post<{ items: InboxMessage[] }>('/inbox/mock/seed'),
};

export const leadService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    sourcePlatform?: string;
    dateFrom?: string;
    dateTo?: string;
  }) =>
    api.get<{ items: Lead[]; total: number }>('/leads', params),
  
  get: (id: string) =>
    api.get<{ item: Lead }>(`/leads/${id}`),
  
  create: (data: CreateLeadRequest) =>
    api.post<{ item: Lead }>('/leads', data),
  
  update: (id: string, data: Partial<Lead>) =>
    api.patch<{ item: Lead }>(`/leads/${id}`, data),
  
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/leads/${id}`),
};
