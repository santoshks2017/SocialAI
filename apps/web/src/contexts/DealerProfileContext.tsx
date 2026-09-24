import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { AppearanceSync } from '../components/shell/AppearanceSync';
import { resolveBrandColor } from '../utils/brandPalette';

export interface DealerProfile {
  id: string;
  name: string;
  city: string;
  state?: string;
  region?: string;
  brands: string[];
  contact_phone?: string;
  phone?: string;
  whatsapp_number?: string;
  logo_url?: string;
  font?: string;
  address?: string;
  use_brand_theme?: boolean;
  primary_color?: string;
  secondary_color?: string;
  language_preferences: string[];
  showroom_type?: string[];
  onboarding_completed?: boolean;
}

interface DealerProfileContextValue {
  profile: DealerProfile | null;
  loading: boolean;
  reload: () => void;
}

const DealerProfileContext = createContext<DealerProfileContextValue>({
  profile: null,
  loading: false,
  reload: () => {},
});

export function DealerProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<DealerProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api.get<{ success: boolean; profile: DealerProfile }>('/dealer/profile')
      .then((r) => { if (r.success && r.profile) setProfile(r.profile); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Business Profile → "Use my brand colours as the app theme" recolours the app for the whole dealership.
  // resolveBrandColor ignores a profile left over from a previous dealer's session (e.g. sign-out/sign-in
  // without a full reload, where `user` resolves before the fresh GET /dealer/profile lands) so its
  // brand colours never leak into the next one.
  const brandColor = resolveBrandColor(profile, user?.dealer_id);

  return (
    <DealerProfileContext.Provider value={{ profile, loading, reload: load }}>
      {children}
      <AppearanceSync userId={user?.id ?? null} brandColor={brandColor} />
    </DealerProfileContext.Provider>
  );
}

export function useDealerProfile() {
  return useContext(DealerProfileContext);
}
