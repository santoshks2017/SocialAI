// Settings constants and shared types (moved from pages/SettingsPage.tsx).
import { normaliseLanguages } from './preferences.js';

// Shared by the Team and Inspiration lists: a small status pill and a bare icon button.
export const PILL = 'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';
export const ICON = 'grid place-items-center w-8 h-8 rounded-lg transition-colors';

export const REGIONS = ['North India', 'South India', 'East India', 'West India', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Telangana', 'Gujarat', 'Punjab', 'Rajasthan'];

export const BRANDS = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Kia', 'Honda', 'Toyota', 'Mahindra', 'Renault', 'Nissan', 'MG', 'Skoda', 'Volkswagen', 'Jeep', 'Ford', 'Citroën', 'BMW', 'Mercedes-Benz', 'Audi'];

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

/** The tabs that read or edit the dealer profile form: only these load GET /dealer/profile or report its failure. */
export function usesProfile(tab: SettingsTabId): boolean {
  return tab === 'profile' || tab === 'preferences' || tab === 'model_library';
}

/** GET /dealer/profile: the fields Business Profile and Preferences edit. */
export interface StoredDealerProfile {
  name: string; city: string; contact_phone?: string; whatsapp_number?: string;
  primary_color?: string; secondary_color?: string; use_brand_theme?: boolean;
  brands?: string[]; language_preferences?: string[]; region?: string;
  logo_url?: string; font?: string; address?: string; showroom_type?: string[];
}

/** The shared Business Profile / Preferences form. */
export interface ProfileFormValues {
  dealerName: string; city: string; phone: string; whatsapp: string;
  primaryColor: string; secondaryColor: string; useBrandTheme: boolean;
  selectedBrands: string[]; selectedLangs: string[]; selectedRegion: string;
  logoUrl: string; font: string; address: string; showroomType: string;
}

/** The form before GET /dealer/profile answers, and the fallback for any field the profile lacks. */
export const EMPTY_PROFILE_FORM: ProfileFormValues = {
  dealerName: '', city: '', phone: '', whatsapp: '', primaryColor: '#1877F2', secondaryColor: '', useBrandTheme: false,
  selectedBrands: [], selectedLangs: ['en'], selectedRegion: '', logoUrl: '', font: 'Arial', address: '', showroomType: 'new',
};

export function profileFormValues(p: StoredDealerProfile): ProfileFormValues {
  const d = EMPTY_PROFILE_FORM;
  return {
    dealerName: p.name ?? '',
    city: p.city ?? '',
    phone: p.contact_phone || d.phone,
    whatsapp: p.whatsapp_number || d.whatsapp,
    primaryColor: p.primary_color || d.primaryColor,
    secondaryColor: p.secondary_color || d.secondaryColor,
    useBrandTheme: p.use_brand_theme === true,
    selectedBrands: p.brands?.length ? p.brands : d.selectedBrands,
    selectedLangs: normaliseLanguages(p.language_preferences),
    selectedRegion: p.region || d.selectedRegion,
    logoUrl: p.logo_url || d.logoUrl,
    font: p.font || d.font,
    address: p.address || d.address,
    showroomType: p.showroom_type?.[0] || d.showroomType,
  };
}

/** The PUT /dealer/profile body for the form. */
export function profileUpdateBody(v: ProfileFormValues): Record<string, unknown> {
  return {
    name: v.dealerName,
    city: v.city,
    contact_phone: v.phone,
    whatsapp_number: v.whatsapp,
    primary_color: v.primaryColor,
    ...(v.secondaryColor ? { secondary_color: v.secondaryColor } : {}),
    use_brand_theme: v.useBrandTheme,
    brands: v.selectedBrands,
    language_preferences: normaliseLanguages(v.selectedLangs),
    region: v.selectedRegion,
    logo_url: v.logoUrl,
    font: v.font,
    address: v.address,
    showroom_type: [v.showroomType],
  };
}

/** Whether the form would change the dealer profile; false until it has loaded. */
export function profileChanged(current: ProfileFormValues, saved: ProfileFormValues | null): boolean {
  return saved !== null && JSON.stringify(profileUpdateBody(current)) !== JSON.stringify(profileUpdateBody(saved));
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
