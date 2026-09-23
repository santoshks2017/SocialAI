import api from './api';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string;
}

export const notificationService = {
  list: (pageSize = 15) =>
    api.get<{ items: AppNotification[]; unreadCount: number }>('/notifications', { pageSize }),
  markRead: (id: string) => api.post<{ success: boolean }>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ success: boolean; count: number }>('/notifications/read-all'),
};
