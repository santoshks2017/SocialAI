// Settings constants and shared types (moved from pages/SettingsPage.tsx).

export const PLAN_LABELS: Record<string, string> = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' };

export const LANGUAGES = [
  { code: 'en', label: 'English', script: 'Latin' },
  { code: 'hi', label: 'Hindi', script: 'Devanagari' },
  { code: 'ta', label: 'Tamil', script: 'Tamil' },
  { code: 'te', label: 'Telugu', script: 'Telugu' },
  { code: 'kn', label: 'Kannada', script: 'Kannada' },
  { code: 'ml', label: 'Malayalam', script: 'Malayalam' },
  { code: 'mr', label: 'Marathi', script: 'Devanagari' },
];

export const REGIONS = ['North India', 'South India', 'East India', 'West India', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Telangana', 'Gujarat', 'Punjab', 'Rajasthan'];

export const BRANDS = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Kia', 'Honda', 'Toyota', 'Mahindra', 'Renault', 'Nissan', 'MG', 'Skoda', 'Volkswagen', 'Jeep', 'Ford', 'Citroën', 'BMW', 'Mercedes-Benz', 'Audi'];

export const NOTIFICATION_KEYS = [
  { key: 'post_published', label: 'Post published successfully', defaultOn: true },
  { key: 'post_failed', label: 'Post failed to publish', defaultOn: true },
  { key: 'inbox_message', label: 'New inbox message received', defaultOn: true },
  { key: 'boost_update', label: 'Boost campaign update (every 4h)', defaultOn: false },
  { key: 'festival_suggestion', label: 'Festival campaign suggestions', defaultOn: true },
  { key: 'monthly_report', label: 'Monthly performance report', defaultOn: true },
];

export type SettingsTab = 'profile' | 'preferences' | 'inspiration' | 'team' | 'model_library';

export interface InspirationHandle {
  id: string;
  platform: string;
  handle_url: string;
  handle_name: string | null;
  posts_cache: string[] | null;
  last_scraped_at: string | null;
  created_at: string;
}

export interface SyncedModel {
  id: string;
  brand: string;
  model_name: string;
  canonical_id: string;
  variants: string[];
  colours: Array<{ name: string; hex: string; images: Array<{ angle: string; url: string }> }>;
  images: Array<{ angle: string; url: string }>;
  synced_at: string;
  source: string;
}

export interface SyncJobStatus {
  status: 'idle' | 'in_progress' | 'completed' | 'failed';
  brands: Record<string, 'pending' | 'syncing' | 'completed' | 'failed'>;
  progress: number;
  currentBrand: string;
  isCompleted: boolean;
}

export const IDLE_SYNC: SyncJobStatus = { status: 'idle', brands: {}, progress: 0, currentBrand: '', isCompleted: false };
