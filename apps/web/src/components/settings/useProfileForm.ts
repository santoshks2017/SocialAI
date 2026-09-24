import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../ui/Toast';
import { useDealerProfile } from '../../contexts/DealerProfileContext';
import { billingService, type BillingStatus } from '../../services/billing';
import { NOTIFICATION_KEYS, addBrand } from '../../utils/settings';

interface ProfileResponse {
  success: boolean;
  profile: {
    name: string; city: string; contact_phone?: string; whatsapp_number?: string;
    primary_color?: string; secondary_color?: string; use_brand_theme?: boolean;
    brands?: string[]; language_preferences?: string[]; region?: string;
    logo_url?: string; font?: string; address?: string; showroom_type?: string[];
  };
}

// Business Profile and Preferences share one form and one PUT /dealer/profile, as in the reference.
export function useProfileForm() {
  const { addToast } = useToast();
  const { reload: reloadProfile } = useDealerProfile();
  // Empty until GET /dealer/profile answers; Save stays disabled so blanks never overwrite the dealer.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en', 'hi']);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [dealerName, setDealerName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1877F2');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [useBrandTheme, setUseBrandTheme] = useState(false);
  const [defaultRadius, setDefaultRadius] = useState(25);
  const [notifications, setNotifications] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sg_notifications');
    if (saved) return new Set(JSON.parse(saved) as string[]);
    return new Set(NOTIFICATION_KEYS.filter((n) => n.defaultOn).map((n) => n.key));
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [font, setFont] = useState('Arial');
  const [address, setAddress] = useState('');
  const [showroomType, setShowroomType] = useState('new');

  useEffect(() => {
    api.get<ProfileResponse>('/dealer/profile').then((res) => {
      const p = res.profile;
      if (!p) throw new Error('Dealer profile not found');
      setDealerName(p.name ?? '');
      setCity(p.city ?? '');
      if (p.contact_phone) setPhone(p.contact_phone);
      if (p.whatsapp_number) setWhatsapp(p.whatsapp_number);
      if (p.primary_color) setPrimaryColor(p.primary_color);
      if (p.secondary_color) setSecondaryColor(p.secondary_color);
      setUseBrandTheme(p.use_brand_theme === true);
      if (p.brands?.length) setSelectedBrands(p.brands);
      if (p.language_preferences?.length) setSelectedLangs(p.language_preferences);
      if (p.region) setSelectedRegion(p.region);
      if (p.logo_url) setLogoUrl(p.logo_url);
      if (p.font) setFont(p.font);
      if (p.address) setAddress(p.address);
      if (p.showroom_type?.length) setShowroomType(p.showroom_type[0]);
      setProfileLoaded(true);
    }).catch(() => {
      addToast({ type: 'error', title: 'Could not load your profile', message: 'Refresh the page before saving changes.' });
    });
    billingService.getStatus()
      .then((res) => { if (res.success) setBilling(res); })
      .catch(() => setBilling(null));
  }, [addToast]);

  const toggleLang = (code: string) => {
    if (code === 'en') return; // English always required
    setSelectedLangs((prev) => prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]);
  };

  const addSelectedBrand = (raw: string) => setSelectedBrands((prev) => addBrand(prev, raw));
  const removeSelectedBrand = (brand: string) => setSelectedBrands((prev) => prev.filter((b) => b !== brand));

  const handleSave = async (): Promise<boolean> => {
    if (!profileLoaded) return false;
    setSaving(true);
    localStorage.setItem('sg_notifications', JSON.stringify([...notifications]));
    try {
      await api.put('/dealer/profile', {
        name: dealerName,
        city,
        contact_phone: phone,
        whatsapp_number: whatsapp,
        primary_color: primaryColor,
        ...(secondaryColor ? { secondary_color: secondaryColor } : {}),
        use_brand_theme: useBrandTheme,
        brands: selectedBrands,
        language_preferences: selectedLangs,
        region: selectedRegion,
        logo_url: logoUrl,
        font,
        address,
        showroom_type: [showroomType],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // The brand theme and every page that reads the profile pick up the change.
      reloadProfile();
      return true;
    } catch {
      addToast({ type: 'error', title: 'Error Saving Settings', message: 'Failed to update settings. Please try again.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    profileLoaded, billing, selectedLangs, setSelectedLangs, selectedRegion, setSelectedRegion, selectedBrands,
    addSelectedBrand, removeSelectedBrand, dealerName, setDealerName, city, setCity, phone, setPhone, whatsapp, setWhatsapp,
    primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, useBrandTheme, setUseBrandTheme,
    defaultRadius, setDefaultRadius, notifications, setNotifications, saved, saving, logoUrl, setLogoUrl, font, setFont,
    address, setAddress, showroomType, setShowroomType, toggleLang, handleSave,
  };
}

export type ProfileForm = ReturnType<typeof useProfileForm>;
