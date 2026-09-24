import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { AppearanceSync } from '../components/shell/AppearanceSync';

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
  const brandColor = user && profile?.use_brand_theme ? profile.primary_color ?? null : null;

  return (
    <DealerProfileContext.Provider value={{ profile, loading, reload: load }}>
      {children}
      <AppearanceSync brandColor={brandColor} />
    </DealerProfileContext.Provider>
  );
}

export function useDealerProfile() {
  return useContext(DealerProfileContext);
}
