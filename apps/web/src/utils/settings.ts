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

export type SettingsTabId = 'profile' | 'platforms' | 'preferences' | 'billing' | 'inspiration' | 'team' | 'model_library';

export interface SettingsAccess {
  /** manage_users: Managers and Owners (isAtLeast(user, 'admin')). */
  manageTeam: boolean;
  /** view_billing: the billing API answers 403 without it. */
  viewBilling: boolean;
}

export interface SettingsTabDef {
  id: SettingsTabId;
  label: string;
  /** Hidden unless the viewer has this access. */
  requires?: keyof SettingsAccess;
}

// Reference order, with our Model Library last.
export const SETTINGS_TABS: readonly SettingsTabDef[] = [
  { id: 'profile', label: 'Business Profile' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'billing', label: 'Billing', requires: 'viewBilling' },
  { id: 'inspiration', label: 'Inspiration' },
  { id: 'team', label: 'Team', requires: 'manageTeam' },
  { id: 'model_library', label: 'Model Library' },
];

export function visibleSettingsTabs(access: SettingsAccess): SettingsTabDef[] {
  return SETTINGS_TABS.filter((tab) => !tab.requires || access[tab.requires]);
}

/** The tab named in ?tab= when this viewer can see it; otherwise Business Profile. */
export function resolveSettingsTab(raw: string | null, tabs: readonly SettingsTabDef[]): SettingsTabId {
  return tabs.find((tab) => tab.id === raw)?.id ?? 'profile';
}

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

export const SHOWROOM_TYPES: Array<{ value: string; label: string }> = [
  { value: 'new', label: 'New Cars Showroom' },
  { value: 'pre-owned', label: 'True Value / Certified Used Cars' },
  { value: 'multi-brand', label: 'Multi-brand Car Dealership' },
];

export const FONT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Arial', label: 'Arial (Standard Clean)' },
  { value: 'Helvetica', label: 'Helvetica (Modern Neue)' },
  { value: 'Georgia', label: 'Georgia (Classic Serif)' },
  { value: 'Impact', label: 'Impact (Heavy Title / Bold)' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS (Friendly Sans)' },
  { value: 'Courier New', label: 'Courier New (Technical Monospace)' },
];

/** Brands & categories: trimmed, single-spaced, and a case-insensitive duplicate is ignored. */
export function addBrand(brands: readonly string[], raw: string): string[] {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name || brands.some((b) => b.toLowerCase() === name.toLowerCase())) return [...brands];
  return [...brands, name];
}
