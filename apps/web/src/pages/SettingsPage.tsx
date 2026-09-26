import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS, can, isAtLeast } from '../lib/permissions';
import { cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { resolveSettingsTab, usesProfile, visibleSettingsTabs, type SettingsTabId } from '../utils/settings';
import { useProfileForm } from '../components/settings/useProfileForm';
import { ProfileTab } from '../components/settings/ProfileTab';
import { PlatformsTab } from '../components/settings/PlatformsTab';
import { PreferencesTab } from '../components/settings/PreferencesTab';
import { BillingTab } from '../components/settings/BillingTab';
import { ModelLibraryTab } from '../components/settings/ModelLibraryTab';
import { InspirationTab } from '../components/settings/InspirationTab';
import { TeamTab } from '../components/settings/TeamTab';

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = visibleSettingsTabs({ manageTeam: isAtLeast(user, 'admin'), viewBilling: can(user, PERMISSIONS.VIEW_BILLING) });
  // The tab lives in the URL (/settings?tab=billing), so links and refreshes land on it.
  const activeTab = resolveSettingsTab(searchParams.get('tab'), tabs);
  const form = useProfileForm(usesProfile(activeTab));
  const selectTab = (id: SettingsTabId) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('tab', id);
    return next;
  }, { replace: true });

  return (
    <PageCard>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Settings</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Manage your dealership profile and connected platforms</p>
        </div>
      </div>

      <div className="flex mb-6 overflow-x-auto">
        <div role="tablist" aria-label="Settings sections" className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => selectTab(t.id)}
              className={cn(
                'inline-flex items-center px-3.5 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0',
                activeTab === t.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'profile' && <ProfileTab form={form} />}
      {activeTab === 'platforms' && <PlatformsTab />}
      {activeTab === 'preferences' && (
        <PreferencesTab form={form} onOpenBilling={tabs.some((t) => t.id === 'billing') ? () => selectTab('billing') : undefined} />
      )}
      {activeTab === 'billing' && <BillingTab />}
      {activeTab === 'inspiration' && <InspirationTab />}
      {activeTab === 'team' && <TeamTab />}
      {activeTab === 'model_library' && <ModelLibraryTab brands={form.selectedBrands} />}
    </PageCard>
  );
}
