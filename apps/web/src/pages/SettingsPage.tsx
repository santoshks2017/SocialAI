import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS, can, isAtLeast } from '../lib/permissions';
import { cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { resolveSettingsTab, visibleSettingsTabs, type SettingsTabId } from '../utils/settings';
import { useProfileForm } from '../components/settings/useProfileForm';
import { ProfileTab } from '../components/settings/ProfileTab';
import { PreferencesTab } from '../components/settings/PreferencesTab';
import { ModelLibraryTab } from '../components/settings/ModelLibraryTab';
import { InspirationTab } from '../components/settings/InspirationTab';
import { TeamTab } from '../components/settings/TeamTab';

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const form = useProfileForm();

  const tabs = visibleSettingsTabs({ manageTeam: isAtLeast(user, 'admin'), viewBilling: can(user, PERMISSIONS.VIEW_BILLING) });
  // The tab lives in the URL (/settings?tab=billing), so links and refreshes land on it.
  const activeTab = resolveSettingsTab(searchParams.get('tab'), tabs);
  const selectTab = (id: SettingsTabId) => setSearchParams({ tab: id }, { replace: true });

  // Legacy links: ?tab=platforms and old OAuth returns still go to /accounts.
  useEffect(() => {
    const tab = searchParams.get('tab');
    const success = searchParams.get('oauth_success') || searchParams.get('success');
    const error = searchParams.get('oauth_error') || searchParams.get('error');
    if (tab === 'platforms' || success || error) {
      const targetParams = new URLSearchParams(searchParams);
      targetParams.delete('tab');
      navigate(`/accounts?${targetParams.toString()}`, { replace: true });
    }
  }, [searchParams, navigate]);

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
      {activeTab === 'preferences' && <PreferencesTab form={form} />}
      {activeTab === 'inspiration' && <InspirationTab />}
      {activeTab === 'team' && <TeamTab />}
      {activeTab === 'model_library' && <ModelLibraryTab brands={form.selectedBrands} />}
    </PageCard>
  );
}
