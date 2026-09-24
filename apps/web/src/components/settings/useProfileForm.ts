import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../ui/Toast';
import { billingService, type BillingStatus } from '../../services/billing';
import { NOTIFICATION_KEYS } from '../../utils/settings';

interface ProfileResponse {
  success: boolean;
  profile: {
    name: string; city: string; contact_phone?: string; whatsapp_number?: string;
    primary_color?: string; brands?: string[]; language_preferences?: string[]; region?: string;
    logo_url?: string; font?: string; address?: string;
    showroom_type?: string[];
  };
}

// Profile and Preferences share one form and one PUT /dealer/profile (moved from SettingsPage).
export function useProfileForm() {
  const { addToast } = useToast();
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
  const [defaultRadius, setDefaultRadius] = useState(25);
  const [notifications, setNotifications] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sg_notifications');
    if (saved) return new Set(JSON.parse(saved) as string[]);
    return new Set(NOTIFICATION_KEYS.filter((n) => n.defaultOn).map((n) => n.key));
  });
  const [saved, setSaved] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [font, setFont] = useState('Arial');
  const [address, setAddress] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
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
      if (p.brands?.length) setSelectedBrands(p.brands as string[]);
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

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) => prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]);
  };

  const handleSave = () => {
    if (!profileLoaded) return;
    api.put('/dealer/profile', {
      name: dealerName,
      city,
      contact_phone: phone,
      whatsapp_number: whatsapp,
      primary_color: primaryColor,
      brands: selectedBrands,
      language_preferences: selectedLangs,
      region: selectedRegion,
      logo_url: logoUrl,
      font,
      address,
      showroom_type: [showroomType],
    })
      .then(() => {
        addToast({ type: 'success', title: 'Settings Saved', message: 'Your dealership profile has been updated successfully.' });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      })
      .catch((err) => {
        addToast({ type: 'error', title: 'Error Saving Settings', message: 'Failed to update settings. Please try again.' });
        console.error(err);
      });
    localStorage.setItem('sg_notifications', JSON.stringify([...notifications]));
  };

  return {
    profileLoaded, billing, selectedLangs, setSelectedLangs, selectedRegion, setSelectedRegion, selectedBrands, setSelectedBrands,
    dealerName, setDealerName, city, setCity, phone, setPhone, whatsapp, setWhatsapp, primaryColor, setPrimaryColor,
    defaultRadius, setDefaultRadius, notifications, setNotifications, saved, logoUrl, setLogoUrl, font, setFont,
    address, setAddress, uploadingLogo, setUploadingLogo, showroomType, setShowroomType, toggleLang, toggleBrand, handleSave,
  };
}

export type ProfileForm = ReturnType<typeof useProfileForm>;
