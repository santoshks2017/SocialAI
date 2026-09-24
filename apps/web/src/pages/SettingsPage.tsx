import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isAtLeast } from '../lib/permissions';
import type { SettingsTab } from '../utils/settings';
import { useProfileForm } from '../components/settings/useProfileForm';
import { ProfileTab } from '../components/settings/ProfileTab';
import { PreferencesTab } from '../components/settings/PreferencesTab';
import { ModelLibraryTab } from '../components/settings/ModelLibraryTab';
import { InspirationTab } from '../components/settings/InspirationTab';
import { TeamTab } from '../components/settings/TeamTab';

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const form = useProfileForm();

  // Read initial tab from URL and handle OAuth callbacks
  const rawTab = searchParams.get('tab');
  const initialTab = (rawTab && rawTab !== 'platforms' ? rawTab : 'profile') as SettingsTab;
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Redirect legacy ?tab=platforms or OAuth redirects to /accounts
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

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'profile', label: 'Dealer Profile' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'model_library', label: 'Model Library' },
    { id: 'inspiration', label: 'Inspiration' },
    ...(isAtLeast(user, 'admin') ? [{ id: 'team' as SettingsTab, label: 'Team' }] : []),
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500 mt-0.5">Manage your dealership profile and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 -mb-px cursor-pointer ${
              activeTab === t.id
                ? 'border-orange-500 text-orange-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileTab form={form} />}
      {activeTab === 'preferences' && <PreferencesTab form={form} />}
      {activeTab === 'model_library' && <ModelLibraryTab brands={form.selectedBrands} />}
      {activeTab === 'inspiration' && <InspirationTab />}
      {activeTab === 'team' && <TeamTab />}
    </div>
  );
}
