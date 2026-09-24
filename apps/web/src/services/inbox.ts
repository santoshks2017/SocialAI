import api from './api';
import type { ApiInboxMessage, ApiPlatform, InboxTag } from '../utils/inbox';

export type InboxMessage = ApiInboxMessage;

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
  sourcePlatform?: ApiPlatform;
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
  sourcePlatform: ApiPlatform;
  sourceMessageId?: string;
  vehicleInterest?: string;
  notes?: string;
}

/** Editable fields of an auto-reply rule, as the page holds them (snake_case, like the rules the API returns). */
export interface RuleInput {
  platform: string;
  message_type: string;
  condition_type: string;
  condition_value: string;
  action_type: string;
  ai_tone: string | null;
  template_id: string | null;
  is_active: boolean;
}

// The rules API reads camelCase fields.
const ruleBody = (r: Partial<RuleInput>) => ({
  platform: r.platform,
  messageType: r.message_type,
  conditionType: r.condition_type,
  conditionValue: r.condition_value,
  actionType: r.action_type,
  aiTone: r.ai_tone ?? undefined,
  templateId: r.template_id ?? undefined,
  isActive: r.is_active,
});

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

  pendingCount: () =>
    api.get<{ pending: number }>('/inbox/pending-count'),

  get: (id: string) =>
    api.get<{ item: InboxMessage }>(`/inbox/${id}`),

  markRead: (id: string) =>
    api.patch<{ item: InboxMessage }>(`/inbox/${id}`, { isRead: true }),

  markAllRead: () =>
    api.post<{ success: boolean }>('/inbox/mark-all-read'),

  updateTag: (id: string, tag: InboxTag | null) =>
    api.patch<{ item: InboxMessage }>(`/inbox/${id}`, { tag }),

  sendReply: (id: string, replyText: string) =>
    api.post<{ item: InboxMessage; delivered?: boolean }>(`/inbox/${id}/reply`, { replyText }),

  generateReply: (id: string, tone?: string) =>
    api.post<{ suggestedReply: string; suggestions?: string[] }>(`/inbox/${id}/suggest-reply`, tone ? { tone } : {}),

  getSettings: () =>
    api.get<{ autoReplyEnabled: boolean }>('/inbox/settings'),

  updateSettings: (autoReplyEnabled: boolean) =>
    api.post<{ autoReplyEnabled: boolean }>('/inbox/settings', { autoReplyEnabled }),

  listRules: () =>
    api.get<{ items: AutoReplyRule[] }>('/inbox/rules'),

  createRule: (data: RuleInput) =>
    api.post<{ item: AutoReplyRule }>('/inbox/rules', ruleBody(data)),

  updateRule: (id: string, data: Partial<RuleInput>) =>
    api.put<{ item: AutoReplyRule }>(`/inbox/rules/${id}`, ruleBody(data)),

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

  // "Turn into post" only needs the new draft's id (it opens /create?edit=<id>).
  generatePostDraft: (id: string) =>
    api.post<{ post: { id: string } }>(`/inbox/${id}/generate-post-draft`),

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
