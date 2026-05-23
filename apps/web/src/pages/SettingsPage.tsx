import { useState, useEffect } from 'react';
import { Check, RefreshCw, Trash2, UserPlus, Shield, ShieldOff, ChevronDown, ChevronUp, Link2, Plus, Search, Database, Car, X } from 'lucide-react';

function FbSvg() {
  return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>;
}
function IgSvg() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="url(#ig-s-settings)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs><linearGradient id="ig-s-settings" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="50%" stopColor="#e6683c"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
}
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/users';
import { CONFIGURABLE_PERMISSIONS, ROLE_LABELS, isAtLeast } from '../lib/permissions';
import type { Permission } from '../lib/permissions';
import type { TeamMember } from '../services/users';
import api from '../services/api';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { creativeService } from '../services/creative';

const LANGUAGES = [
  { code: 'en', label: 'English', script: 'Latin' },
  { code: 'hi', label: 'Hindi', script: 'Devanagari' },
  { code: 'ta', label: 'Tamil', script: 'Tamil' },
  { code: 'te', label: 'Telugu', script: 'Telugu' },
  { code: 'kn', label: 'Kannada', script: 'Kannada' },
  { code: 'ml', label: 'Malayalam', script: 'Malayalam' },
  { code: 'mr', label: 'Marathi', script: 'Devanagari' },
];

const REGIONS = ['North India', 'South India', 'East India', 'West India', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Telangana', 'Gujarat', 'Punjab', 'Rajasthan'];

const BRANDS = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Kia', 'Honda', 'Toyota', 'Mahindra', 'Renault', 'Nissan', 'MG', 'Skoda', 'Volkswagen', 'Jeep', 'Ford', 'Citroën', 'BMW', 'Mercedes-Benz', 'Audi'];

const NOTIFICATION_KEYS = [
  { key: 'post_published', label: 'Post published successfully', defaultOn: true },
  { key: 'post_failed', label: 'Post failed to publish', defaultOn: true },
  { key: 'inbox_message', label: 'New inbox message received', defaultOn: true },
  { key: 'boost_update', label: 'Boost campaign update (every 4h)', defaultOn: false },
  { key: 'festival_suggestion', label: 'Festival campaign suggestions', defaultOn: true },
  { key: 'monthly_report', label: 'Monthly performance report', defaultOn: true },
];

type Tab = 'profile' | 'preferences' | 'inspiration' | 'team' | 'model_library';

interface InspirationHandle {
  id: string;
  platform: string;
  handle_url: string;
  handle_name: string | null;
  posts_cache: string[] | null;
  last_scraped_at: string | null;
  created_at: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Read initial tab from URL and handle OAuth callbacks
  const rawTab = searchParams.get('tab');
  const initialTab = (rawTab && rawTab !== 'platforms' ? rawTab : 'profile') as Tab;
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

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

  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en', 'hi']);
  const [selectedRegion, setSelectedRegion] = useState('South India');
  const [selectedBrands, setSelectedBrands] = useState<string[]>(['Hyundai', 'Kia']);
  const [dealerName, setDealerName] = useState('Cardeko Motors Pvt. Ltd.');
  const [city, setCity] = useState('Bangalore');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [whatsapp, setWhatsapp] = useState('+91 98765 43210');
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

  // Team tab state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, Record<string, boolean>>>({});

  // Inspiration handles state
  const [handles, setHandles] = useState<InspirationHandle[]>([]);
  const [loadingHandles, setLoadingHandles] = useState(false);
  const [handleUrl, setHandleUrl] = useState('');
  const [handlePlatform, setHandlePlatform] = useState<'facebook' | 'instagram'>('facebook');
  const [handleName, setHandleName] = useState('');
  const [addingHandle, setAddingHandle] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Model Library state
  interface SyncedModel {
    id: string;
    brand: string;
    model_name: string;
    canonical_id: string;
    variants: string[];
    colours: Array<{ name: string; hex: string; images: Array<{ angle: string; url: string }> }>;
    images: Array<{ angle: string; url: string }>;
    synced_at: string;
    source: string;
  }
  const [syncedModels, setSyncedModels] = useState<SyncedModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState('');
  const [syncStatus, setSyncStatus] = useState<{
    status: 'idle' | 'in_progress' | 'completed' | 'failed';
    brands: Record<string, 'pending' | 'syncing' | 'completed' | 'failed'>;
    progress: number;
    currentBrand: string;
    isCompleted: boolean;
  }>({
    status: 'idle',
    brands: {},
    progress: 0,
    currentBrand: '',
    isCompleted: false,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedModelDetail, setSelectedModelDetail] = useState<SyncedModel | null>(null);
  const [activeAnglePreview, setActiveAnglePreview] = useState<string>('front_exterior');
  const [activeColorPreview, setActiveColorPreview] = useState<string>('');

  // Manually Add Model form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualBrand, setManualBrand] = useState('Hyundai');
  const [manualModelName, setManualModelName] = useState('');
  const [manualVariants, setManualVariants] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [uploadingManualImage, setUploadingManualImage] = useState(false);

  const fetchModels = () => {
    setLoadingModels(true);
    api.get<{ success: boolean; models: SyncedModel[] }>('/model-library')
      .then((res) => {
        setSyncedModels(res.models || []);
      })
      .catch((err) => {
        console.error(err);
        addToast({ type: 'error', title: 'Error', message: 'Failed to load model library' });
      })
      .finally(() => setLoadingModels(false));
  };

  const checkSyncStatus = async () => {
    try {
      const res = await api.get<{ success: boolean; syncJob: typeof syncStatus }>('/model-library/sync/status');
      if (res.success && res.syncJob) {
        setSyncStatus(res.syncJob);
        if (res.syncJob.status === 'in_progress') {
          setIsSyncing(true);
          setTimeout(checkSyncStatus, 1500);
        } else {
          setIsSyncing(false);
          if (res.syncJob.status === 'completed' && activeTab === 'model_library') {
            fetchModels();
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'model_library') {
      fetchModels();
      checkSyncStatus();
    }
  }, [activeTab]);

  const handleStartSync = async () => {
    if (selectedBrands.length === 0) {
      addToast({ type: 'warning', title: 'Brands Required', message: 'Please select at least one brand to sync.' });
      return;
    }
    setIsSyncing(true);
    try {
      const res = await api.post<{ success: boolean }>('/model-library/sync', { brands: selectedBrands });
      if (res.success) {
        addToast({ type: 'success', title: 'Sync Started', message: 'OEM sync job started in the background.' });
        checkSyncStatus();
      }
    } catch (err) {
      setIsSyncing(false);
      addToast({ type: 'error', title: 'Sync Failed', message: 'Could not start OEM model sync.' });
    }
  };

  const handleAddManualModel = async () => {
    if (!manualModelName.trim()) {
      addToast({ type: 'warning', title: 'Model Name Required', message: 'Please enter a model name.' });
      return;
    }
    if (!manualImageUrl) {
      addToast({ type: 'warning', title: 'Image Required', message: 'Please upload a photo for the model.' });
      return;
    }

    try {
      const res = await api.post<{ success: boolean; model: SyncedModel }>('/model-library', {
        brand: manualBrand,
        model_name: manualModelName.trim(),
        variants: manualVariants.split(',').map((v) => v.trim()).filter(Boolean),
        images: [{ angle: 'front_exterior', url: manualImageUrl }],
        colours: [{ name: 'Default', hex: '#888888', images: [{ angle: 'front_exterior', url: manualImageUrl }] }]
      });

      if (res.success) {
        addToast({ type: 'success', title: 'Model Added', message: 'Custom model added to repository.' });
        setShowAddModal(false);
        setManualModelName('');
        setManualVariants('');
        setManualImageUrl('');
        fetchModels();
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to add custom model.' });
    }
  };

  useEffect(() => {
    api.get<{ success: boolean; profile: {
      name: string; city: string; contact_phone?: string; whatsapp_number?: string;
      primary_color?: string; brands?: string[]; language_preferences?: string[]; region?: string;
      logo_url?: string; font?: string; address?: string;
    } }>('/dealer/profile').then((res) => {
      const p = res.profile;
      setDealerName(p.name);
      setCity(p.city);
      if (p.contact_phone) setPhone(p.contact_phone);
      if (p.whatsapp_number) setWhatsapp(p.whatsapp_number);
      if (p.primary_color) setPrimaryColor(p.primary_color);
      if (p.brands?.length) setSelectedBrands(p.brands as string[]);
      if (p.language_preferences?.length) setSelectedLangs(p.language_preferences);
      if (p.region) setSelectedRegion(p.region);
      if (p.logo_url) setLogoUrl(p.logo_url);
      if (p.font) setFont(p.font);
      if (p.address) setAddress(p.address);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (activeTab === 'team' && isAtLeast(user, 'admin')) {
      setLoadingTeam(true);
      userService.list()
        .then((res) => setTeamMembers(res.users))
        .catch(() => addToast({ type: 'error', title: 'Error', message: 'Failed to load team members' }))
        .finally(() => setLoadingTeam(false));
    }
  }, [activeTab, user, addToast]);

  useEffect(() => {
    if (activeTab !== 'inspiration') return;
    setLoadingHandles(true);
    api.get<{ success: boolean; handles: InspirationHandle[] }>('/dealer/inspiration-handles')
      .then((res) => setHandles(res.handles))
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Failed to load inspiration handles' }))
      .finally(() => setLoadingHandles(false));
  }, [activeTab, addToast]);

  const handleInvite = async () => {
    if (!invitePhone) return;
    setSubmittingInvite(true);
    try {
      const res = await userService.invite({ phone: invitePhone, name: inviteName || undefined, role: inviteRole });
      setTeamMembers((prev) => [...prev, res.user]);
      setShowInviteForm(false);
      setInvitePhone('');
      setInviteName('');
      setInviteRole('user');
      addToast({ type: 'success', title: 'Success', message: 'User invited successfully' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to invite user' });
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleToggleActive = async (member: TeamMember) => {
    try {
      const res = await userService.setActive(member.id, !member.isActive);
      setTeamMembers((prev) => prev.map((m) => m.id === member.id ? res.user : m));
      addToast({ type: 'success', title: 'Success', message: `User ${res.user.isActive ? 'activated' : 'deactivated'}` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update user status' });
    }
  };

  const handleSavePermissions = async (member: TeamMember) => {
    const perms = editingPerms[member.id];
    if (!perms) return;
    try {
      const res = await userService.updatePermissions(member.id, perms);
      setTeamMembers((prev) => prev.map((m) => m.id === member.id ? res.user : m));
      setEditingPerms((prev) => { const next = { ...prev }; delete next[member.id]; return next; });
      addToast({ type: 'success', title: 'Success', message: 'Permissions updated' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update permissions' });
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    try {
      await userService.remove(member.id);
      setTeamMembers((prev) => prev.filter((m) => m.id !== member.id));
      addToast({ type: 'success', title: 'Success', message: 'User removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove user' });
    }
  };

  const handleAddHandle = async () => {
    if (!handleUrl.trim()) return;
    setAddingHandle(true);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle }>('/dealer/inspiration-handles', {
        handle_url: handleUrl.trim(),
        platform: handlePlatform,
        handle_name: handleName.trim() || undefined,
      });
      setHandles((prev) => [res.handle, ...prev]);
      setHandleUrl('');
      setHandleName('');
      addToast({ type: 'success', title: 'Success', message: 'Handle added — scraping posts in background' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to add handle' });
    } finally {
      setAddingHandle(false);
    }
  };

  const handleDeleteHandle = async (id: string) => {
    try {
      await api.delete(`/dealer/inspiration-handles/${id}`);
      setHandles((prev) => prev.filter((h) => h.id !== id));
      addToast({ type: 'success', title: 'Success', message: 'Handle removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove handle' });
    }
  };

  const handleRefreshHandle = async (id: string) => {
    setRefreshingId(id);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle; posts_found: number }>(
        `/dealer/inspiration-handles/${id}/refresh`,
      );
      setHandles((prev) => prev.map((h) => h.id === id ? res.handle : h));
      addToast({ type: 'success', title: 'Success', message: `Scraped ${res.posts_found} posts` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to refresh handle' });
    } finally {
      setRefreshingId(null);
    }
  };

  const toggleLang = (code: string) => {
    if (code === 'en') return; // English always required
    setSelectedLangs((prev) => prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]);
  };

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) => prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]);
  };

  const handleSave = () => {
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
    })
      .then(() => {
        addToast({ type: 'success', title: 'Settings Saved', message: 'Your dealership profile has been updated successfully.' });
      })
      .catch((err) => {
        addToast({ type: 'error', title: 'Error Saving Settings', message: 'Failed to update settings. Please try again.' });
        console.error(err);
      });
    localStorage.setItem('sg_notifications', JSON.stringify([...notifications]));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile', label: 'Dealer Profile' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'model_library', label: 'Model Library' },
    { id: 'inspiration', label: 'Inspiration' },
    ...(isAtLeast(user, 'admin') ? [{ id: 'team' as Tab, label: 'Team' }] : []),
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

      {/* --- PROFILE TAB --- */}
      {activeTab === 'profile' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <h3 className="font-semibold text-slate-800 text-sm">Dealership Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dealership Name</label>
                <input value={dealerName} onChange={(e) => setDealerName(e.target.value)} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contact Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">WhatsApp Number</label>
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Brands Sold</label>
              <div className="flex flex-wrap gap-2">
                {BRANDS.map((b) => (
                  <button
                    key={b}
                    onClick={() => toggleBrand(b)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer font-medium ${
                      selectedBrands.includes(b) 
                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-orange-500 hover:text-orange-600'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Dealer Logo</label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <div className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
                    <img src={logoUrl} alt="Dealer Logo" className="object-contain max-w-full max-h-full" />
                    <button
                      type="button"
                      onClick={() => setLogoUrl("")}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 hover:bg-red-650 rounded-full text-white cursor-pointer animate-none"
                      title="Remove Logo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-50/50 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">
                    No Logo
                  </div>
                )}
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    id="logo-upload-input"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingLogo(true);
                      try {
                        const res = await creativeService.uploadImage(file);
                        setLogoUrl(res.url);
                        addToast({ type: 'success', title: 'Logo Uploaded', message: 'Logo uploaded successfully. Remember to save changes!' });
                      } catch (err) {
                        addToast({ type: 'error', title: 'Upload Failed', message: 'Failed to upload logo image.' });
                        console.error(err);
                      } finally {
                        setUploadingLogo(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                    disabled={uploadingLogo}
                    onClick={() => document.getElementById("logo-upload-input")?.click()}
                  >
                    {uploadingLogo ? "Uploading..." : "Upload Logo"}
                  </Button>
                  <p className="text-[10px] text-slate-500 mt-1">PNG or JPG recommended (transparent background preferred)</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Showroom Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Enter detailed showroom address (e.g. Plot No 12, Outer Ring Road, Bangalore)"
                className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">This address will be rendered at the bottom panel of generated creatives.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Brand Font Family</label>
              <select
                value={font}
                onChange={(e) => setFont(e.target.value)}
                className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                <option value="Arial" className="bg-white">Arial (Standard Clean)</option>
                <option value="Helvetica" className="bg-white">Helvetica (Modern Neue)</option>
                <option value="Georgia" className="bg-white">Georgia (Classic Serif)</option>
                <option value="Impact" className="bg-white">Impact (Heavy Title / Bold)</option>
                <option value="Trebuchet MS" className="bg-white">Trebuchet MS (Friendly Sans)</option>
                <option value="Courier New" className="bg-white">Courier New (Technical Monospace)</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">Used for rendering headings and text overlays on your dealership creatives.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Brand Colors</label>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Primary</p>
                  <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-12 h-10 rounded-lg border border-slate-200 bg-white cursor-pointer" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Secondary</p>
                  <input type="color" defaultValue="#1A1A2E" className="w-12 h-10 rounded-lg border border-slate-200 bg-white cursor-pointer" />
                </div>
                <p className="text-xs text-slate-500">Used on all generated creatives and templates</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            {saved && (
              <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                <Check className="w-4 h-4" /> Saved successfully
              </div>
            )}
            <Button onClick={handleSave} className="text-sm bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 cursor-pointer">Save Changes</Button>
          </div>
        </div>
      )}

      {/* --- PREFERENCES TAB --- */}
      {activeTab === 'preferences' && (
        <div className="space-y-5">
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
                        next.has(n.key) ? next.delete(n.key) : next.add(n.key);
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-base text-slate-800">Growth Plan</p>
                    <p className="text-orange-900/80 text-xs mt-0.5">Unlimited posts · 3 active platforms · Boost campaigns</p>
                  </div>
                  <span className="bg-orange-100 border border-orange-200 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">Active</span>
                </div>
                <p className="text-slate-500 text-xs mt-3">Renews on 15 October 2026</p>
                <Button className="mt-3.5 bg-orange-500 hover:bg-orange-600 text-white border-none text-xs cursor-pointer shadow-sm shadow-orange-500/20">Upgrade to Enterprise</Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            {saved && (
              <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                <Check className="w-4 h-4" /> Saved
              </div>
            )}
            <Button onClick={handleSave} className="text-sm bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 cursor-pointer">Save Preferences</Button>
          </div>
        </div>
      )}

      {activeTab === 'model_library' && (
        <div className="space-y-6">
          {/* Sync Control Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">OEM Model Repository Sync</h3>
                <p className="text-xs text-slate-500 mt-0.5">Sync high-quality brand-approved models and multi-angle imagery for your dealership brands.</p>
              </div>
              <Button
                onClick={handleStartSync}
                disabled={isSyncing}
                className="text-xs bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/10 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>

            {/* Sync Progress Bar */}
            {isSyncing && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-ping" />
                    Syncing Brand: <span className="text-orange-600 font-bold">{syncStatus.currentBrand || 'Initialising'}</span>
                  </span>
                  <span>{syncStatus.progress}% Complete</span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300" style={{ width: `${syncStatus.progress}%` }} />
                </div>
                {/* Brand-by-brand status indicator */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/60">
                  {Object.entries(syncStatus.brands).map(([brand, status]) => (
                    <div key={brand} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className={`w-2 h-2 rounded-full ${
                        status === 'completed' ? 'bg-green-500' :
                        status === 'syncing' ? 'bg-orange-500 animate-pulse' : 'bg-slate-300'
                      }`} />
                      <span className="truncate">{brand}</span>
                      {status === 'completed' && <Check className="w-3 h-3 text-green-600 shrink-0" />}
                      {status === 'syncing' && <RefreshCw className="w-3 h-3 text-orange-500 animate-spin shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Last Synced Brands */}
            {!isSyncing && syncedModels.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs items-center">
                <span className="text-slate-500 font-medium">Synced Brands:</span>
                {Array.from(new Set(syncedModels.filter(m => m.source === 'cardekho_oem_db').map(m => m.brand))).map(brand => {
                  const maxSynced = syncedModels
                    .filter(m => m.brand === brand)
                    .map(m => new Date(m.synced_at).getTime());
                  const lastDate = maxSynced.length > 0 ? new Date(Math.max(...maxSynced)).toLocaleDateString('en-IN') : 'N/A';
                  return (
                    <span key={brand} className="bg-slate-150 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-semibold">
                      {brand} <span className="text-[10px] text-slate-500 font-normal ml-1">Synced: {lastDate}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Repository Browser card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">Model Repository Browser</h3>
                <p className="text-xs text-slate-500 mt-0.5">Browse synced model specifications, color variants, and angle imagery.</p>
              </div>
              <Button
                onClick={() => setShowAddModal(true)}
                className="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-350 flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
              >
                <Plus className="w-3.5 h-3.5" />
                Manually Add Model
              </Button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search model name..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Brand Filter */}
              <div className="w-full sm:w-48">
                <select
                  value={selectedBrandFilter}
                  onChange={(e) => setSelectedBrandFilter(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium"
                >
                  <option value="" className="bg-white">All Brands</option>
                  {Array.from(new Set(syncedModels.map(m => m.brand))).map(brand => (
                    <option key={brand} value={brand} className="bg-white">{brand}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Model Card Grid */}
            {loadingModels ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-500" />
                Loading repository models...
              </div>
            ) : syncedModels.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-250 rounded-xl text-slate-500 text-sm">
                <Database className="w-8 h-8 mx-auto mb-2 text-slate-450 opacity-60" />
                No models in library. Please trigger a sync to load brand-approved vehicles.
              </div>
            ) : (
              (() => {
                const filtered = syncedModels.filter(m => {
                  const matchesSearch = searchQuery.trim() === '' || 
                    m.model_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.brand.toLowerCase().includes(searchQuery.toLowerCase());
                  const matchesBrand = selectedBrandFilter === '' || m.brand === selectedBrandFilter;
                  return matchesSearch && matchesBrand;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      No models matched your filters.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {filtered.map(model => {
                      const defaultImg = model.images.find(img => img.angle === 'front_exterior')?.url || model.images[0]?.url;
                      return (
                        <div
                          key={model.id}
                          onClick={() => {
                            setSelectedModelDetail(model);
                            setActiveAnglePreview('front_exterior');
                            setActiveColorPreview(model.colours?.[0]?.name || '');
                          }}
                          className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md hover:border-orange-300 transition-all duration-200 cursor-pointer flex flex-col group"
                        >
                          <div className="aspect-[4/3] bg-slate-100 border-b border-slate-100 overflow-hidden relative">
                            {defaultImg ? (
                              <img src={defaultImg} alt={model.model_name} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400"><Car className="w-10 h-10" /></div>
                            )}
                            <span className={`absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              model.source === 'manual_upload' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                              {model.source === 'manual_upload' ? 'Manual' : 'Synced'}
                            </span>
                          </div>
                          <div className="p-4 flex-1 flex flex-col justify-between">
                            <div>
                              <p className="text-[10px] text-slate-500 font-semibold uppercase">{model.brand}</p>
                              <p className="font-bold text-slate-800 text-sm mt-0.5">{model.model_name}</p>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                              <span>{model.variants.length} Variants</span>
                              <span>{model.colours.length} Colors</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>

          {/* Model Detail Modal */}
          {selectedModelDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl w-full shadow-2xl space-y-5 overflow-y-auto max-h-[90vh] relative">
                <button
                  onClick={() => setSelectedModelDetail(null)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{selectedModelDetail.brand}</span>
                  <h3 className="text-xl font-bold text-slate-900 mt-0.5">{selectedModelDetail.model_name}</h3>
                </div>

                {/* Main Preview */}
                <div className="aspect-video bg-slate-100 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative">
                  {(() => {
                    const selColor = selectedModelDetail.colours.find(c => c.name === activeColorPreview);
                    const selImg = (selColor?.images || selectedModelDetail.images).find(img => img.angle === activeAnglePreview)?.url
                      || selectedModelDetail.images[0]?.url;
                    return selImg ? (
                      <img src={selImg} alt="Vehicle Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Car className="w-16 h-16 text-slate-300" />
                    );
                  })()}
                </div>

                {/* Angle Selector Tabs */}
                <div className="grid grid-cols-4 gap-2">
                  {(['front_exterior', 'rear_exterior', 'side_exterior', 'interior_dashboard'] as const).map(angle => (
                    <button
                      key={angle}
                      onClick={() => setActiveAnglePreview(angle)}
                      className={`text-[10px] font-bold py-2 rounded-lg border text-center transition-colors cursor-pointer capitalize ${
                        activeAnglePreview === angle
                          ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                          : 'bg-white text-slate-650 border-slate-200 hover:border-slate-350 hover:bg-slate-50'
                      }`}
                    >
                      {angle.replace('_', ' ').replace('exterior', '').trim()}
                    </button>
                  ))}
                </div>

                {/* Color Swatch Selectors */}
                {selectedModelDetail.colours.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600">Available Colors: <span className="text-slate-800 font-bold">{activeColorPreview}</span></p>
                    <div className="flex flex-wrap gap-2.5">
                      {selectedModelDetail.colours.map(color => (
                        <button
                          key={color.name}
                          onClick={() => setActiveColorPreview(color.name)}
                          className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer relative ${
                            activeColorPreview === color.name ? 'border-orange-500 scale-[1.12] shadow-sm' : 'border-slate-200 hover:border-slate-400'
                          }`}
                          style={{ backgroundColor: color.hex }}
                          title={color.name}
                        >
                          {activeColorPreview === color.name && (
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white mix-blend-difference font-bold">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Variant list & Metadata */}
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold block mb-1">VARIANTS</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedModelDetail.variants.map(v => (
                        <span key={v} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">{v}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block mb-1">METADATA</span>
                    <p className="text-slate-600 font-medium">Source: <span className="capitalize">{selectedModelDetail.source.replace(/_/g, ' ')}</span></p>
                    <p className="text-slate-600 font-medium mt-0.5">Synced At: {new Date(selectedModelDetail.synced_at).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manually Add Model Modal */}
          {showAddModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4 relative">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-650 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <h3 className="text-base font-bold text-slate-900">Manually Add Model</h3>

                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Brand</label>
                    <select
                      value={manualBrand}
                      onChange={(e) => setManualBrand(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-805 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    >
                      {BRANDS.map(brand => (
                        <option key={brand} value={brand} className="bg-white">{brand}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Model Name</label>
                    <input
                      type="text"
                      value={manualModelName}
                      onChange={(e) => setManualModelName(e.target.value)}
                      placeholder="e.g. Creta"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Variants (comma-separated)</label>
                    <input
                      type="text"
                      value={manualVariants}
                      onChange={(e) => setManualVariants(e.target.value)}
                      placeholder="e.g. S, SX, SX(O)"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Model Photo (Front View)</label>
                    <div className="flex items-center gap-3">
                      {manualImageUrl ? (
                        <img src={manualImageUrl} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">No Photo</div>
                      )}
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          id="manual-car-photo-upload"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingManualImage(true);
                            try {
                              const res = await creativeService.uploadImage(file);
                              setManualImageUrl(res.url);
                              addToast({ type: 'success', title: 'Image Uploaded', message: 'Model photo uploaded successfully!' });
                            } catch {
                              addToast({ type: 'error', title: 'Upload Failed', message: 'Failed to upload photo.' });
                            } finally {
                              setUploadingManualImage(false);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          className="text-xs border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                          disabled={uploadingManualImage}
                          onClick={() => document.getElementById("manual-car-photo-upload")?.click()}
                        >
                          {uploadingManualImage ? "Uploading..." : "Upload Photo"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <Button
                    onClick={handleAddManualModel}
                    disabled={!manualModelName.trim() || !manualImageUrl}
                    className="text-xs bg-orange-500 hover:bg-orange-600 text-white cursor-pointer shadow-sm shadow-orange-500/10"
                  >
                    Add Model
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => { setShowAddModal(false); setManualImageUrl(''); setManualModelName(''); setManualVariants(''); }}
                    className="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- INSPIRATION TAB --- */}
      {activeTab === 'inspiration' && (
        <div className="space-y-5">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-900 font-medium">
            <p className="font-bold mb-1 text-orange-950">AI Inspiration from Reference Pages</p>
            <p className="text-orange-900/90 leading-relaxed">Add Facebook or Instagram page URLs of dealers or brands you admire. The AI will study their posts and use them as inspiration when generating captions and creatives — tailored to Indian automotive context.</p>
          </div>

          {/* Add handle form */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4 text-orange-500" />
              Add Reference Handle
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-600 mb-1 block">Platform</label>
                <select
                  value={handlePlatform}
                  onChange={(e) => setHandlePlatform(e.target.value as 'facebook' | 'instagram')}
                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  <option value="facebook" className="bg-white">Facebook</option>
                  <option value="instagram" className="bg-white">Instagram</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-600 mb-1 block">Page / Profile URL</label>
                <input
                  value={handleUrl}
                  onChange={(e) => setHandleUrl(e.target.value)}
                  placeholder={handlePlatform === 'facebook' ? 'https://www.facebook.com/MarutiSuzukiIndia' : 'https://www.instagram.com/hyundaiindia'}
                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Display Name (optional)</label>
              <input
                value={handleName}
                onChange={(e) => setHandleName(e.target.value)}
                placeholder="e.g. Maruti Suzuki India"
                className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <Button
              onClick={handleAddHandle}
              disabled={!handleUrl.trim() || addingHandle}
              className="flex items-center gap-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {addingHandle ? 'Adding...' : 'Add Handle'}
            </Button>
          </div>

          {/* Handles list */}
          {loadingHandles ? (
            <div className="text-center py-8 text-slate-500 text-sm">Loading handles...</div>
          ) : handles.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm bg-slate-50/50 rounded-xl border border-dashed border-slate-300">
              No reference handles added yet. Add a Facebook or Instagram page above.
            </div>
          ) : (
            <div className="space-y-3">
              {handles.map((h) => (
                <div key={h.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-50 border border-slate-200">
                      {h.platform === 'facebook' ? <FbSvg /> : <IgSvg />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{h.handle_name ?? h.handle_url}</p>
                      <a
                        href={h.handle_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-orange-600 hover:underline truncate block font-medium"
                      >
                        {h.handle_url}
                      </a>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${h.platform === 'facebook' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-pink-50 text-pink-700 border border-pink-200'}`}>
                          {h.platform === 'facebook' ? 'Facebook' : 'Instagram'}
                        </span>
                        {h.posts_cache && Array.isArray(h.posts_cache) && h.posts_cache.length > 0 ? (
                          <span className="text-xs text-emerald-600 font-semibold">{h.posts_cache.length} posts cached</span>
                        ) : (
                          <span className="text-xs text-slate-500">No posts cached yet</span>
                        )}
                        {h.last_scraped_at && (
                          <span className="text-xs text-slate-500">
                            Last scraped {new Date(h.last_scraped_at).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleRefreshHandle(h.id)}
                        disabled={refreshingId === h.id}
                        title="Re-scrape posts"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-4 h-4 ${refreshingId === h.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleDeleteHandle(h.id)}
                        title="Remove handle"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-650 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- TEAM TAB --- */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Team Members</h3>
              <p className="text-xs text-slate-500 mt-0.5">Manage your team's access and permissions</p>
            </div>
            <Button onClick={() => setShowInviteForm((v) => !v)} className="flex items-center gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 cursor-pointer">
              <UserPlus className="w-4 h-4" /> Invite User
            </Button>
          </div>

          {/* Invite Form */}
          {showInviteForm && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
              <h4 className="font-bold text-slate-800 text-sm">Invite New Member</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Phone Number *</label>
                  <input
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Name (optional)</label>
                  <input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
              {isAtLeast(user, 'owner') && (
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'user')}
                    className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="user" className="bg-white">User</option>
                    <option value="admin" className="bg-white">Admin</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button onClick={handleInvite} disabled={!invitePhone || submittingInvite} className="text-sm bg-orange-500 hover:bg-orange-600 text-white cursor-pointer shadow-sm shadow-orange-500/20">
                  {submittingInvite ? 'Sending...' : 'Send Invite'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setShowInviteForm(false); setInvitePhone(''); setInviteName(''); }}
                  className="text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Team List */}
          {loadingTeam ? (
            <div className="text-center py-10 text-slate-500 text-sm">Loading team members...</div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm bg-slate-50/50 rounded-xl border border-dashed border-slate-350">
              No team members yet. Invite someone to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {teamMembers.map((member) => (
                <div key={member.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  {/* Member row */}
                  <div className="flex items-center gap-4 p-4">
                    <div className="w-9 h-9 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-700 font-bold text-sm flex-shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">{member.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          member.role === 'owner' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                          member.role === 'admin' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          'bg-slate-50 text-slate-600 border border-slate-200'
                        }`}>
                          {ROLE_LABELS[member.role]}
                        </span>
                        {!member.isActive && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 font-bold uppercase">Inactive</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{member.phone}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {member.id !== user?.id && (
                        <button
                          onClick={() => handleToggleActive(member)}
                          title={member.isActive ? 'Deactivate user' : 'Activate user'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${member.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                          {member.isActive ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                        </button>
                      )}
                      {member.role === 'user' && (
                        <button
                          onClick={() => setExpandedUser(expandedUser === member.id ? null : member.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
                          title="Edit permissions"
                        >
                          {expandedUser === member.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                      {member.id !== user?.id && member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-slate-100 hover:text-red-650 transition-colors cursor-pointer"
                          title="Remove user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Permission editor */}
                  {expandedUser === member.id && member.role === 'user' && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50/30">
                      <p className="text-xs font-semibold text-slate-500 mb-3">Custom Permissions</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {CONFIGURABLE_PERMISSIONS.map((perm) => (
                          <label key={perm.key} className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingPerms[member.id]?.[perm.key] ?? member.permissions[perm.key as Permission] ?? false}
                              onChange={(e) => setEditingPerms((prev) => ({
                                ...prev,
                                [member.id]: { ...(prev[member.id] ?? member.permissions), [perm.key]: e.target.checked },
                              }))}
                              className="w-4 h-4 accent-orange-500 mt-0.5 flex-shrink-0 cursor-pointer"
                            />
                            <div>
                              <p className="text-sm text-slate-800 font-semibold">{perm.label}</p>
                              <p className="text-xs text-slate-500">{perm.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <Button
                        className="mt-4 text-sm bg-orange-500 hover:bg-orange-600 text-white cursor-pointer shadow-sm"
                        disabled={!editingPerms[member.id]}
                        onClick={() => handleSavePermissions(member)}
                      >
                        Save Permissions
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
