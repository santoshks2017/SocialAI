import api from './api';

export interface ApprovalPreview {
  dealer_name: string;
  actionable: boolean;
  post: {
    creative_urls: unknown;
    caption_text: string;
    caption_hashtags: string[];
    platforms: string[];
    media_type?: string;
    video_url?: string | null;
    thumbnail_url?: string | null;
  };
}

export interface ApprovalResult {
  status: 'approved' | 'rejected';
  message: string;
}

// Public approval links: no sign-in needed.
export const approvalService = {
  get: (token: string) => api.get<ApprovalPreview>(`/publisher/approval/${encodeURIComponent(token)}`),
  decide: (token: string, decision: 'approve' | 'reject', comment: string) =>
    api.post<ApprovalResult>(`/publisher/approval/${encodeURIComponent(token)}`, { decision, comment }),
};
