import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Building2, Loader2, MapPin, MessageCircle, Palette, Phone, Tag, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useToast } from '../ui/Toast';
import { useDealerProfile } from '../../contexts/DealerProfileContext';
import { ApiError } from '../../services/api';
import { dealerService } from '../../services/dealer';
import { applyBrandTheme, brandThemeCss, parseHex } from '../../utils/brandPalette';
import { BRANDS, FONT_OPTIONS, SHOWROOM_TYPES } from '../../utils/settings';
import { FieldLabel, SaveBar, SectionHeader, SettingsCard, Toggle } from './SettingsParts';
import type { ProfileForm } from './useProfileForm';

function ColourSwatch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5 cursor-pointer hover:border-zinc-300 transition-colors">
      <input
        type="color"
        value={parseHex(value) ?? '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} colour`}
        className="w-10 h-10 rounded-lg border border-zinc-200 cursor-pointer p-0.5 flex-shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-zinc-700">{label}</span>
        <span className="block text-[11px] text-zinc-400 font-mono truncate">{value || 'Not set'}</span>
      </span>
    </label>
  );
}

export function ProfileTab({ form }: { form: ProfileForm }) {
  const { addToast } = useToast();
  const { profile, reload } = useDealerProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [brandDraft, setBrandDraft] = useState('');
  const {
    dealerName, setDealerName, city, setCity, phone, setPhone, whatsapp, setWhatsapp, showroomType, setShowroomType,
    address, setAddress, selectedBrands, addSelectedBrand, removeSelectedBrand, logoUrl, setLogoUrl, font, setFont,
    primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, useBrandTheme, setUseBrandTheme,
    saved, saving, handleSave, profileLoaded,
  } = form;

  // Live preview while choosing colours; leaving the tab puts the saved theme back.
  const savedBrandColor = profile?.use_brand_theme ? profile.primary_color ?? null : null;
  useEffect(() => {
    if (!profileLoaded) return;
    applyBrandTheme(brandThemeCss(useBrandTheme ? primaryColor : null));
    return () => applyBrandTheme(brandThemeCss(savedBrandColor));
  }, [profileLoaded, useBrandTheme, primaryColor, savedBrandColor]);

  const addDraftBrand = () => {
    addSelectedBrand(brandDraft);
    setBrandDraft('');
  };
  const onBrandKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDraftBrand();
    }
  };

  const onLogoChosen = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { logo_url } = await dealerService.uploadLogo(file);
      setLogoUrl(logo_url);
      reload();
      addToast({ type: 'success', title: 'Logo updated' });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Upload failed',
        message: err instanceof ApiError && err.status >= 400 && err.status < 500 ? err.message : 'Could not upload the logo. Please try a PNG, JPG or WebP.',
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SectionHeader icon={<Building2 className="w-4 h-4" />} title="Business details" description="Basic details shown across your social profiles and creatives." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="business-name">Business name</FieldLabel>
            <Input id="business-name" value={dealerName} onChange={(e) => setDealerName(e.target.value)} placeholder="Your business name" />
          </div>
          <div>
            <FieldLabel htmlFor="business-city" icon={<MapPin className="w-3.5 h-3.5" />}>City</FieldLabel>
            <Input id="business-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          </div>
          <div>
            <FieldLabel htmlFor="contact-phone" icon={<Phone className="w-3.5 h-3.5" />}>Contact Phone</FieldLabel>
            <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <FieldLabel htmlFor="whatsapp-number" icon={<MessageCircle className="w-3.5 h-3.5" />}>WhatsApp Number</FieldLabel>
            <Input id="whatsapp-number" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <FieldLabel>Showroom type</FieldLabel>
            <ThemedSelect value={showroomType} onChange={setShowroomType} options={SHOWROOM_TYPES} ariaLabel="Showroom type" />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="showroom-address">Showroom address</FieldLabel>
            <textarea
              id="showroom-address"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter detailed showroom address (e.g. Plot No 12, Outer Ring Road, Bangalore)"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors resize-none focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30"
            />
            <p className="text-[11px] text-zinc-400 mt-1">This address will be rendered at the bottom panel of generated creatives.</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader
          icon={<Tag className="w-4 h-4" />}
          title="Brands & categories"
          description="What you sell or represent — used to make AI captions and creatives relevant. Add your own."
        />
        {selectedBrands.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedBrands.map((brand) => (
              <span key={brand} className="inline-flex items-center gap-1 rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-100 pl-3 pr-1.5 py-1 text-sm font-medium">
                {brand}
                <button
                  type="button"
                  onClick={() => removeSelectedBrand(brand)}
                  aria-label={`Remove ${brand}`}
                  className="grid place-items-center w-4 h-4 rounded-full hover:bg-orange-200/60 text-orange-500 hover:text-orange-800 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            className="flex-1"
            list="brand-suggestions"
            value={brandDraft}
            onChange={(e) => setBrandDraft(e.target.value)}
            onKeyDown={onBrandKey}
            placeholder="e.g. a brand, product line, or service you offer"
            aria-label="Add a brand or category"
          />
          <datalist id="brand-suggestions">
            {BRANDS.map((b) => <option key={b} value={b} />)}
          </datalist>
          <Button variant="secondary" onClick={addDraftBrand} disabled={!brandDraft.trim()}>Add</Button>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader icon={<Palette className="w-4 h-4" />} title="Brand kit" description="Logo and colours applied to all generated creatives." />
        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium text-zinc-600 mb-2">Logo</p>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onLogoChosen(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="group flex items-center gap-4 w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-3 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/40 disabled:opacity-60"
            >
              <div className="w-16 h-16 rounded-xl bg-white ring-1 ring-zinc-200 flex items-center justify-center text-zinc-300 overflow-hidden flex-shrink-0">
                {logoUrl ? <img src={logoUrl} alt="Dealer logo" className="w-full h-full object-contain" /> : <Palette className="w-6 h-6" />}
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-800">
                  {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {logoUrl ? 'Replace logo' : 'Upload logo'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">PNG, JPG or WebP · at least 200 × 200 px · up to 2 MB</p>
              </div>
            </button>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-600 mb-2">Brand colours</p>
            <div className="grid grid-cols-2 gap-2.5">
              <ColourSwatch label="Primary" value={primaryColor} onChange={setPrimaryColor} />
              <ColourSwatch label="Secondary" value={secondaryColor} onChange={setSecondaryColor} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-800">Use my brand colours as the app theme</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Recolours buttons, highlights and accents across the app. Off uses the default theme.</p>
            </div>
            <Toggle checked={useBrandTheme} onChange={setUseBrandTheme} label="Use my brand colours as the app theme" />
          </div>

          <div>
            <FieldLabel>Brand font</FieldLabel>
            <ThemedSelect value={font} onChange={setFont} options={FONT_OPTIONS} className="sm:max-w-xs" ariaLabel="Brand font" />
            <p className="text-[11px] text-zinc-400 mt-1">Used for rendering headings and text overlays on your dealership creatives.</p>
          </div>
        </div>
      </SettingsCard>

      <SaveBar saved={saved} label="Save changes" onSave={() => void handleSave()} disabled={!profileLoaded} busy={saving} />
    </div>
  );
}
