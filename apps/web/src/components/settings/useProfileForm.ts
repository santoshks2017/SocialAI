import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../ui/Toast';
import { useDealerProfile } from '../../contexts/DealerProfileContext';
import {
  EMPTY_PROFILE_FORM, addBrand, profileChanged, profileFormValues, profileUpdateBody, type ProfileFormValues, type StoredDealerProfile,
} from '../../utils/settings';
import { toggleLanguage } from '../../utils/preferences';

// Business Profile and Preferences share one form and one PUT /dealer/profile, as in the reference.
// `active`: a tab that uses the form is open. The profile loads the first time one is (and again after
// a failed load), so Billing or Team never fetch it or report that it failed.
// (DealerProfileContext also holds the profile, but it swallows load errors and reloads after every
// save or logo upload, which would overwrite unsaved edits here; this form keeps its own copy.)
export function useProfileForm(active: boolean) {
  const { addToast } = useToast();
  const { reload: reloadProfile } = useDealerProfile();
  // Empty until GET /dealer/profile answers; Save stays disabled so blanks never overwrite the dealer.
  const [profileLoaded, setProfileLoaded] = useState(false);
  // What the dealer profile holds, as far as this form knows: the loaded or last saved values.
  const [savedValues, setSavedValues] = useState<ProfileFormValues | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(EMPTY_PROFILE_FORM.selectedLangs);
  const [selectedRegion, setSelectedRegion] = useState(EMPTY_PROFILE_FORM.selectedRegion);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(EMPTY_PROFILE_FORM.selectedBrands);
  const [dealerName, setDealerName] = useState(EMPTY_PROFILE_FORM.dealerName);
  const [city, setCity] = useState(EMPTY_PROFILE_FORM.city);
  const [phone, setPhone] = useState(EMPTY_PROFILE_FORM.phone);
  const [whatsapp, setWhatsapp] = useState(EMPTY_PROFILE_FORM.whatsapp);
  const [primaryColor, setPrimaryColor] = useState(EMPTY_PROFILE_FORM.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(EMPTY_PROFILE_FORM.secondaryColor);
  const [useBrandTheme, setUseBrandTheme] = useState(EMPTY_PROFILE_FORM.useBrandTheme);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState(EMPTY_PROFILE_FORM.logoUrl);
  const [font, setFont] = useState(EMPTY_PROFILE_FORM.font);
  const [address, setAddress] = useState(EMPTY_PROFILE_FORM.address);
  const [showroomType, setShowroomType] = useState(EMPTY_PROFILE_FORM.showroomType);

  const requested = useRef(false);
  const activeNow = useRef(active);
  useEffect(() => { activeNow.current = active; }, [active]);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    api.get<{ success: boolean; profile: StoredDealerProfile }>('/dealer/profile').then((res) => {
      const p = res.profile;
      if (!p) throw new Error('Dealer profile not found');
      const v = profileFormValues(p);
      setDealerName(v.dealerName);
      setCity(v.city);
      setPhone(v.phone);
      setWhatsapp(v.whatsapp);
      setPrimaryColor(v.primaryColor);
      setSecondaryColor(v.secondaryColor);
      setUseBrandTheme(v.useBrandTheme);
      setSelectedBrands(v.selectedBrands);
      setSelectedLangs(v.selectedLangs);
      setSelectedRegion(v.selectedRegion);
      setLogoUrl(v.logoUrl);
      setFont(v.font);
      setAddress(v.address);
      setShowroomType(v.showroomType);
      setSavedValues(v);
      setProfileLoaded(true);
    }).catch(() => {
      // Try again the next time a tab that uses the profile opens.
      requested.current = false;
      if (activeNow.current) addToast({ type: 'error', title: 'Could not load your profile', message: 'Refresh the page before saving changes.' });
    });
  }, [active, addToast]);

  const values: ProfileFormValues = {
    dealerName, city, phone, whatsapp, primaryColor, secondaryColor, useBrandTheme,
    selectedBrands, selectedLangs, selectedRegion, logoUrl, font, address, showroomType,
  };
  /** A dealer field differs from what the profile holds, so saving would change it. */
  const dirty = profileChanged(values, savedValues);

  const toggleLang = (code: string) => setSelectedLangs((prev) => toggleLanguage(prev, code));
  const addSelectedBrand = (raw: string) => setSelectedBrands((prev) => addBrand(prev, raw));
  const removeSelectedBrand = (brand: string) => setSelectedBrands((prev) => prev.filter((b) => b !== brand));
  // POST /dealer/logo has already stored it on the profile.
  const setSavedLogoUrl = (url: string) => {
    setLogoUrl(url);
    setSavedValues((prev) => (prev ? { ...prev, logoUrl: url } : prev));
  };

  const handleSave = async (): Promise<boolean> => {
    if (!profileLoaded) return false;
    setSaving(true);
    try {
      await api.put('/dealer/profile', profileUpdateBody(values));
      setSavedValues(values);
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
    profileLoaded, dirty, selectedLangs, selectedRegion, setSelectedRegion, selectedBrands, addSelectedBrand, removeSelectedBrand,
    dealerName, setDealerName, city, setCity, phone, setPhone, whatsapp, setWhatsapp,
    primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, useBrandTheme, setUseBrandTheme,
    saved, saving, logoUrl, setSavedLogoUrl, font, setFont, address, setAddress, showroomType, setShowroomType,
    toggleLang, handleSave,
  };
}

export type ProfileForm = ReturnType<typeof useProfileForm>;
