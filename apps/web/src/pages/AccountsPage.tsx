import { useState, useEffect, useCallback, useRef, type ComponentType } from 'react';
import {
  RefreshCw,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Zap,
  Shield,
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/ui/Toast';

// ─── Brand SVG Icons ─────────────────────────────────────────────────────────

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

// ─── Types and Setup ────────────────────────────────────────────────────────

interface ConnectedAccount {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  tokenExpiry: string | null;
  createdAt: string;
}

interface PlatformDefinition {
  id: string;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  hoverBg: string;
  icon: ComponentType<{ className?: string }>;
  connectPlatform: string; // The platform param to send to the API
  features: string[];
}

const PLATFORMS: PlatformDefinition[] = [
  {
    id: 'facebook',
    label: 'Facebook Page',
    description: 'Publish posts, manage comments, and track page analytics',
    color: '#1877F2',
    bgColor: 'rgba(24, 119, 242, 0.08)',
    hoverBg: 'rgba(24, 119, 242, 0.12)',
    icon: FacebookIcon,
    connectPlatform: 'facebook',
    features: ['Auto-publish posts', 'Comment management', 'Page insights'],
  },
  {
    id: 'instagram',
    label: 'Instagram Business',
    description: 'Post photos, reels, and manage DMs via Meta Business Suite',
    color: '#E1306C',
    bgColor: 'rgba(225, 48, 108, 0.08)',
    hoverBg: 'rgba(225, 48, 108, 0.12)',
    icon: InstagramIcon,
    connectPlatform: 'instagram',
    features: ['Auto-publish media', 'Story scheduling', 'DM management'],
  },
  {
    id: 'google',
    label: 'Google Business Profile',
    description: 'Publish Google posts, respond to reviews, and manage your listing',
    color: '#4285F4',
    bgColor: 'rgba(66, 133, 244, 0.08)',
    hoverBg: 'rgba(66, 133, 244, 0.12)',
    icon: GoogleIcon,
    connectPlatform: 'gmb',
    features: ['Auto-publish posts', 'Review responses', 'Listing management'],
  },
];

const FRIENDLY_OAUTH_ERRORS: Record<string, string> = {
  server_config: 'OAuth is not configured on the server. Please ask your admin to set up API keys.',
  token_exchange_failed: 'Failed to exchange tokens with the platform. Please try again.',
  no_code: 'Authorization was cancelled.',
  access_denied: 'You must grant all required permissions to connect your account.',
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [useSandbox, setUseSandbox] = useState(false);
  const { addToast } = useToast();

  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch connected accounts ───────────────────────────────────────────────
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; accounts: ConnectedAccount[] }>('/platform-accounts');
      setAccounts(res.accounts ?? []);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // ─── Listen for OAuth callback messages from popup ──────────────────────────
  // Only our own /oauth/callback page (same origin) may report results.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const data = event.data as { type?: string; platform?: string; pageName?: string; error?: string } | null;
      if (!data || (data.type !== 'oauth_success' && data.type !== 'oauth_error')) return;

      if (data.type === 'oauth_success') {
        addToast({
          type: 'success',
          title: 'Account Connected!',
          message: data.pageName
            ? `Successfully connected ${data.pageName}`
            : `Your ${data.platform ?? ''} account has been linked successfully.`,
        });
        setConnecting(null);
        fetchAccounts();
      } else {
        const errorMsg = data.error ?? '';
        addToast({
          type: 'error',
          title: 'Connection Failed',
          message: FRIENDLY_OAUTH_ERRORS[errorMsg] ?? `Could not connect ${data.platform || 'platform'}${errorMsg ? `: ${errorMsg}` : ''}`,
        });
        setConnecting(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [addToast, fetchAccounts]);

  // ─── Handle URL params (for direct navigation fallback) ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      const platform = params.get('platform') || 'your';
      const pageName = params.get('page_name');
      addToast({
        type: 'success',
        title: 'Account Connected!',
        message: pageName
          ? `Successfully connected ${pageName}`
          : `Your ${platform} account has been linked.`,
      });
      fetchAccounts();
      window.history.replaceState({}, '', '/accounts');
    }
    const urlError = params.get('error');
    if (urlError) {
      addToast({
        type: 'error',
        title: 'Connection Failed',
        message: FRIENDLY_OAUTH_ERRORS[urlError] ?? urlError,
      });
      window.history.replaceState({}, '', '/accounts');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Cleanup popup poll on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── OAuth Connect Flow ─────────────────────────────────────────────────────
  const handleConnect = async (platform: PlatformDefinition) => {
    setConnecting(platform.id);

    try {
      // Dev-only sandbox skips the real Meta dialog (the API ignores ?mock in production).
      const queryParams = useSandbox && import.meta.env.DEV && platform.id !== 'google' ? '?mock=true' : '';
      const res = await api.get<{ success: boolean; redirect_url: string }>(
        `/platforms/connect/${platform.connectPlatform}${queryParams}`
      );
      const oauthUrl = res.redirect_url;

      // Open OAuth in a popup window
      const popup = window.open(
        oauthUrl,
        `oauth_${platform.id}`,
        'width=620,height=720,scrollbars=yes,resizable=yes,left=200,top=100'
      );

      if (!popup || popup.closed) {
        addToast({
          type: 'error',
          title: 'Popup Blocked',
          message: 'Your browser blocked the login popup. Please allow popups for this site and try again.',
        });
        setConnecting(null);
        return;
      }

      popupRef.current = popup;

      // Poll for popup closure
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (popup.closed) {
          if (pollRef.current) clearInterval(pollRef.current);
          setConnecting((current) => {
            if (current === platform.id) {
              setTimeout(() => {
                setConnecting((still) => {
                  if (still === platform.id) {
                    fetchAccounts();
                    return null;
                  }
                  return still;
                });
              }, 1000);
            }
            return current;
          });
        }
      }, 1000);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Connection Error',
        message: err instanceof Error && err.message && err.message !== 'Network error'
          ? err.message
          : `Could not start ${platform.label} connection. Please check your network and try again.`,
      });
      setConnecting(null);
    }
  };

  // ─── Disconnect ─────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const conn = accounts.find((a) => a.id === id);
    if (!conn) return;
    const platformLabel = conn.platform === 'gmb' || conn.platform === 'google' 
      ? 'Google Business Profile'
      : conn.platform === 'facebook'
      ? 'Facebook Page'
      : 'Instagram Business';

    if (!window.confirm(`Disconnecting will stop auto-publishing to ${platformLabel}. Are you sure?`)) {
      return;
    }

    setDeleting(id);
    try {
      await api.delete(`/platform-accounts/${id}`);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      addToast({ type: 'success', title: 'Disconnected', message: 'Account removed successfully.' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not remove account. Please try again.' });
    }
    setDeleting(null);
  };

  const getConnectedForPlatform = (platformId: string) =>
    accounts.find((a) => a.platform === platformId || (platformId === 'google' && a.platform === 'gmb'));

  const connectedCount = PLATFORMS.filter((p) => getConnectedForPlatform(p.id)).length;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Connected Accounts</h1>
          <p className="text-sm text-slate-500 mt-1">
            Connect your social profiles to auto-publish posts and track analytics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-3 py-1.5">
            <div className={`w-2 h-2 rounded-full ${connectedCount > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-xs font-bold text-slate-605">
              {connectedCount} of {PLATFORMS.length} connected
            </span>
          </div>
        </div>
      </div>

      {/* Sandbox Mock Mode Toggle (Dev only) */}
      {import.meta.env.DEV && (
        <div className="mb-6 p-4 bg-amber-50/60 border border-amber-200 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" /> Sandbox / Mock Mode
            </h3>
            <p className="text-xs text-amber-700/80 mt-1 leading-relaxed">
              Enable sandbox mode to connect simulated Facebook and Instagram accounts instantly without requiring real social login credentials.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useSandbox}
              onChange={(e) => setUseSandbox(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>
      )}

      {/* Auto-Post Info Banner */}
      {connectedCount > 0 && (
        <div className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <Zap className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-emerald-900">Auto-Post Active</h3>
            <p className="text-xs text-emerald-700/80 mt-0.5 leading-relaxed">
              When you publish a post, it will automatically be posted to all your connected social media accounts.
              You can select specific platforms during post creation.
            </p>
          </div>
        </div>
      )}

      {loading && accounts.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mb-3" />
          <p className="text-sm text-slate-500 font-semibold">Retrieving platform accounts...</p>
        </div>
      ) : (
        /* 3x1 Grid of Social Media Connectors */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PLATFORMS.map((platform) => {
            const connectedAccount = getConnectedForPlatform(platform.id);
            const isConnected = !!connectedAccount;
            const isConnecting = connecting === platform.id;
            const Icon = platform.icon;

            // Compute token expiry warning (P1)
            let warning: { type: 'warning' | 'error'; message: string } | null = null;
            if (isConnected && connectedAccount.tokenExpiry) {
              const expiry = new Date(connectedAccount.tokenExpiry);
              const diffTime = expiry.getTime() - Date.now();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (diffDays <= 0) {
                warning = { type: 'error', message: 'Connection expired. Reconnect now.' };
              } else if (diffDays === 1) {
                warning = { type: 'error', message: 'Connection expiring today. Reconnect now.' };
              } else if (diffDays <= 7) {
                warning = { type: 'warning', message: `Connection expires in ${diffDays} days. Reconnect to avoid interruption.` };
              }
            }

            return (
              <div
                key={platform.id}
                className={`bg-white border rounded-2xl shadow-sm flex flex-col transition-all duration-300 overflow-hidden ${
                  isConnected
                    ? warning?.type === 'error'
                      ? 'border-red-200'
                      : warning?.type === 'warning'
                      ? 'border-amber-200'
                      : 'border-emerald-200'
                    : 'border-slate-200 hover:border-slate-350 hover:shadow-md'
                }`}
              >
                {/* Connected status bar */}
                {isConnected && (
                  <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Connected — Auto-Post Enabled</span>
                  </div>
                )}

                {/* Expiry Warning Banner (P1) */}
                {warning && (
                  <div className={`px-4 py-2 text-[10px] font-bold flex items-center gap-1.5 border-b uppercase tracking-wide ${
                    warning.type === 'error' 
                      ? 'bg-red-50 text-red-700 border-red-100' 
                      : 'bg-amber-50 text-amber-700 border-amber-100'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${warning.type === 'error' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
                    {warning.message}
                  </div>
                )}

                <div className="p-6 flex flex-col flex-1">
                  {/* Brand Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        backgroundColor: isConnected ? `${platform.color}15` : platform.bgColor,
                        color: platform.color,
                      }}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 leading-tight">
                        {platform.label}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {platform.description}
                      </p>
                    </div>
                  </div>

                  {/* Connection Status */}
                  <div className="mb-4 flex-1">
                    {isConnected ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15 shrink-0" />
                          <span className="text-sm font-bold text-slate-800 truncate" title={connectedAccount.accountName}>
                            {connectedAccount.accountName}
                          </span>
                        </div>

                        {/* Features list */}
                        <div className="space-y-1.5">
                          {platform.features.map((feature) => (
                            <div key={feature} className="flex items-center gap-2 text-xs text-slate-500">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                              {feature}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <p className="text-sm text-slate-400 font-medium">No account connected</p>
                        <div className="space-y-1.5">
                          {platform.features.map((feature) => (
                            <div key={feature} className="flex items-center gap-2 text-xs text-slate-400">
                              <div className="w-3 h-3 rounded-full border border-slate-200 shrink-0" />
                              {feature}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {isConnected ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(connectedAccount.id)}
                        disabled={deleting === connectedAccount.id}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-100/55 text-red-600 font-extrabold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {deleting === connectedAccount.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            Disconnect
                          </>
                        )}
                      </button>

                      {warning && (
                        <button
                          onClick={() => handleConnect(platform)}
                          disabled={isConnecting || connecting !== null}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-100/55 text-amber-700 font-extrabold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isConnecting ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" />
                              Reconnect
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleConnect(platform)}
                      disabled={isConnecting || connecting !== null}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-extrabold text-sm transition-all cursor-pointer shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: isConnecting ? '#94a3b8' : platform.color,
                        boxShadow: isConnecting ? 'none' : `0 8px 24px ${platform.color}30`,
                      }}
                    >
                      {isConnecting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Signing in…
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4" />
                          Connect Account
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Security note */}
      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400 font-medium">
        <Shield className="w-3.5 h-3.5" />
        <span>Secure OAuth 2.0 — we never see or store your password</span>
      </div>
    </div>
  );
}
