import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeMode } from '../../utils/theme';
import { LANGUAGES, NOTIFICATION_KEYS, PLAN_LABELS, REGIONS } from '../../utils/settings';
import type { ProfileForm } from './useProfileForm';

// Moved unchanged from SettingsPage.tsx; Task 10 ports it to the reference layout.
export function PreferencesTab({ form }: { form: ProfileForm }) {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const {
    selectedLangs, toggleLang, selectedRegion, setSelectedRegion, defaultRadius, setDefaultRadius,
    notifications, setNotifications, billing, saved, handleSave, profileLoaded,
  } = form;

  return (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
            <h3 className="font-semibold text-zinc-900 text-sm mb-1">Appearance</h3>
            <p className="text-xs text-zinc-500 mb-3">Choose how Social AI looks on this device.</p>
            <div className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1">
              {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setThemeMode(m)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all ${themeMode === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                >
                  {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1">Caption Languages</h3>
              <p className="text-xs text-slate-500 mb-3">Select languages for AI caption generation. English is always included.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => toggleLang(lang.code)}
                    disabled={lang.code === 'en'}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-all cursor-pointer ${
                      selectedLangs.includes(lang.code)
                        ? 'bg-orange-50 border-orange-200 text-orange-700 font-bold shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50/50'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <span className="font-medium">{lang.label}</span>
                    <span className="text-[10px] text-slate-500">{lang.script}</span>
                    {selectedLangs.includes(lang.code) && <Check className="w-3.5 h-3.5 text-orange-600" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1">Region</h3>
              <p className="text-xs text-slate-500 mb-2">Controls which festival templates and regional campaigns are shown.</p>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                <option value="" className="bg-white">Select a region</option>
                {REGIONS.map((r) => <option key={r} className="bg-white">{r}</option>)}
              </select>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1">Default Boost Radius</h3>
              <p className="text-xs text-slate-500 mb-2">How far from your dealership boost campaigns target by default.</p>
              <div className="space-y-2">
                <input
                  type="range"
                  min={5}
                  max={50}
                  value={defaultRadius}
                  onChange={(e) => setDefaultRadius(+e.target.value)}
                  className="w-full accent-orange-500 bg-slate-100"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>5 km</span>
                  <span className="font-medium text-orange-600">{defaultRadius} km</span>
                  <span>50 km</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800 text-sm mb-2">Notifications</h3>
              <div className="space-y-1">
                {NOTIFICATION_KEYS.map((n) => (
                  <label key={n.key} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0 cursor-pointer">
                    <span className="text-sm text-slate-700">{n.label}</span>
                    <input
                      type="checkbox"
                      checked={notifications.has(n.key)}
                      onChange={() => setNotifications((prev) => {
                        const next = new Set(prev);
                        if (next.has(n.key)) next.delete(n.key); else next.add(n.key);
                        return next;
                      })}
                      className="w-4 h-4 accent-orange-500 cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800 text-sm mb-2">Subscription Plan</h3>
              <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/[0.02] border border-orange-200/80 rounded-xl p-5 text-slate-805 shadow-sm">
                {billing ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-base text-slate-800">{PLAN_LABELS[billing.plan] ?? billing.plan} Plan</p>
                        <p className="text-orange-900/80 text-xs mt-0.5">
                          {billing.limits.postsLimit >= 999999 ? 'Unlimited posts' : `${billing.limits.postsUsed} of ${billing.limits.postsLimit} posts used this month`}
                          {' · '}{billing.limits.platformsConnected} of {billing.limits.platformsLimit} platforms connected
                        </p>
                      </div>
                      {billing.subscription?.status && (
                        <span className="bg-orange-100 border border-orange-200 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full capitalize">{billing.subscription.status}</span>
                      )}
                    </div>
                    {(billing.subscription?.currentPeriodEnd ?? billing.expiresAt) && (
                      <p className="text-slate-500 text-xs mt-3">
                        Renews on {new Date((billing.subscription?.currentPeriodEnd ?? billing.expiresAt)!).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-600">View your current plan, usage and upgrade options on the Billing page.</p>
                )}
                <Link to="/billing" className="inline-flex items-center mt-3.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-4 py-2 rounded-md shadow-sm shadow-orange-500/20 transition-colors">
                  Manage plan
                </Link>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            {saved && (
              <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                <Check className="w-4 h-4" /> Saved
              </div>
            )}
            <Button onClick={handleSave} disabled={!profileLoaded} className="text-sm bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 cursor-pointer">Save Preferences</Button>
          </div>
        </div>
  );
}
