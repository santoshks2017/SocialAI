import { useEffect, useState } from 'react';
import { Bell, Check, ChevronDown, CreditCard, Languages, MapPin, SunMoon } from 'lucide-react';
import { cn } from '../ui/Button';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useToast } from '../ui/Toast';
import { useTheme } from '../../contexts/ThemeContext';
import { preferencesService } from '../../services/preferences';
import { CONTENT_LANGUAGES, NOTIFICATION_OPTIONS, allNotificationsOn, type NotificationPrefs } from '../../utils/preferences';
import { REGIONS } from '../../utils/settings';
import type { ThemeMode } from '../../utils/theme';
import { SaveBar, SectionHeader, SettingsCard, Toggle } from './SettingsParts';
import type { ProfileForm } from './useProfileForm';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function PreferencesTab({ form, onOpenBilling }: { form: ProfileForm; onOpenBilling?: () => void }) {
  const { addToast } = useToast();
  const { mode, setMode } = useTheme();
  const { selectedLangs, toggleLang, selectedRegion, setSelectedRegion, saved, saving, handleSave, profileLoaded, dirty } = form;
  const [prefs, setPrefs] = useState<NotificationPrefs>(allNotificationsOn);
  const [notificationsSaved, setNotificationsSaved] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState<NotificationPrefs>(allNotificationsOn);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    preferencesService.get()
      .then((p) => {
        if (cancelled) return;
        setPrefs(p.notification_prefs);
        setSavedPrefs(p.notification_prefs);
        setPrefsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) addToast({ type: 'error', title: 'Could not load your notification settings', message: 'Refresh the page before saving changes.' });
      });
    return () => { cancelled = true; };
  }, [addToast]);

  // The theme is yours, not the dealership's: it applies at once and is saved to your account.
  const chooseTheme = (next: ThemeMode) => {
    const previous = mode;
    setMode(next);
    preferencesService.update({ theme_mode: next }).catch(() => {
      setMode(previous);
      addToast({ type: 'error', title: 'Could not save your theme', message: 'Please try again.' });
    });
  };

  const saveNotifications = async () => {
    const changed = NOTIFICATION_OPTIONS.map((o) => o.type).filter((type) => prefs[type] !== savedPrefs[type]);
    if (!prefsLoaded || changed.length === 0) return;
    try {
      const change = Object.fromEntries(changed.map((type) => [type, prefs[type]])) as Partial<NotificationPrefs>;
      const next = await preferencesService.update({ notification_prefs: change });
      setPrefs(next.notification_prefs);
      setSavedPrefs(next.notification_prefs);
      setNotificationsSaved(true);
      setTimeout(() => setNotificationsSaved(false), 3000);
    } catch {
      setPrefs(savedPrefs);
      addToast({ type: 'error', title: 'Could not save notifications', message: 'Please try again.' });
    }
  };

  // Languages and region belong to the dealership (PUT /dealer/profile, only when a dealer field
  // changed); notifications to you.
  const save = () => {
    void Promise.all([dirty ? handleSave() : Promise.resolve(true), saveNotifications()]);
  };

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SectionHeader icon={<SunMoon className="w-4 h-4" />} title="Appearance" description="Saved to your account, so it follows you to every device you sign in on." />
        <div role="group" aria-label="Theme" className="inline-flex gap-1 bg-zinc-100 p-1 rounded-xl">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={mode === o.value}
              onClick={() => chooseTheme(o.value)}
              className={cn('px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all', mode === o.value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-400 mt-2">“System” follows your device's light/dark setting.</p>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader
          icon={<Languages className="w-4 h-4" />}
          title="Content languages"
          description="Used for AI captions, hashtags & on-image text. The first one is your account default; you can switch language per post."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {CONTENT_LANGUAGES.map((lang) => {
            const selected = selectedLangs.includes(lang.code);
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => toggleLang(lang.code)}
                disabled={lang.code === 'en'}
                aria-pressed={selected}
                className={cn(
                  'flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed',
                  selected ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50',
                )}
              >
                <span className="font-medium">{lang.label}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-400">{lang.script}</span>
                  {selectedLangs[0] === lang.code && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-orange-600 bg-white/70 ring-1 ring-orange-200 rounded px-1 py-0.5">Default</span>
                  )}
                  {selected && <Check className="w-3.5 h-3.5 text-orange-600" />}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader icon={<MapPin className="w-4 h-4" />} title="Region" description="Controls which festival templates and regional campaigns are shown." />
        <ThemedSelect
          value={selectedRegion}
          onChange={setSelectedRegion}
          options={REGIONS.map((r) => ({ value: r, label: r }))}
          placeholder="Select a region"
          className="sm:max-w-xs"
          ariaLabel="Region"
        />
      </SettingsCard>

      <SettingsCard>
        <SectionHeader icon={<Bell className="w-4 h-4" />} title="Notifications" description="Choose which events trigger in-app notifications." />
        <div className="divide-y divide-zinc-100">
          {NOTIFICATION_OPTIONS.map((o) => (
            <div key={o.type} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <span className="text-sm text-zinc-700">{o.label}</span>
              <Toggle checked={prefs[o.type]} onChange={(on) => setPrefs((prev) => ({ ...prev, [o.type]: on }))} label={o.label} disabled={!prefsLoaded} />
            </div>
          ))}
        </div>
      </SettingsCard>

      {onOpenBilling && (
        <button
          type="button"
          onClick={onOpenBilling}
          className="w-full bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 flex items-center justify-between gap-3 text-left transition-all hover:shadow-md hover:border-zinc-300"
        >
          <span className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
              <CreditCard className="w-4 h-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900">Subscription & billing</span>
              <span className="block text-xs text-zinc-500 mt-0.5">Manage your plan and billing cycle.</span>
            </span>
          </span>
          <ChevronDown className="w-4 h-4 text-zinc-400 -rotate-90" />
        </button>
      )}

      <SaveBar saved={saved || notificationsSaved} label="Save preferences" onSave={save} disabled={!profileLoaded} busy={saving} />
    </div>
  );
}
