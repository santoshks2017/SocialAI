import api from './api';

export interface BillingStatus {
  success: boolean;
  plan: string;
  expiresAt: string | null;
  subscription: {
    id: string;
    status: string;
    planId: string;
    currentPeriodEnd: string | null;
  } | null;
  limits: {
    postsLimit: number;
    postsUsed: number;
    platformsLimit: number;
    platformsConnected: number;
    featuresBlocked: string[];
  };
}

export interface SubscribeResponse {
  success: boolean;
  subscriptionId: string;
  paymentLink: string;
}

export const billingService = {
  getStatus: () => api.get<BillingStatus>('/billing/status'),
  
  subscribe: (planId: string) => api.post<SubscribeResponse>('/billing/subscribe', { planId }),
  
  simulateWebhook: (subscriptionId: string, planId: string) => {
    const payload = {
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: subscriptionId,
            plan_id: planId,
            status: 'active',
            current_start: Math.floor(Date.now() / 1000),
            current_end: Math.floor((Date.now() + 30 * 24 * 3600 * 1000) / 1000),
          },
        },
      },
    };
    return api.post<{ success: boolean }>('/billing/webhook', payload);
  },
};
