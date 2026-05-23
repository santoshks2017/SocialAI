import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, RefreshCw, ArrowRight, Sparkles } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/ui/Toast';

interface PlatformConnection {
  id: string;
  platform: string;
  platform_account_name: string | null;
  is_connected: boolean;
}

function FbIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function IgIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="url(#ig-grad-cp)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="ig-grad-cp" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="50%" stopColor="#e6683c" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function TwitterXIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#FF0000">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

const PLATFORM_CONFIG = [
  {
    id: 'facebook',
    label: 'Facebook Page',
    desc: 'Publish posts, manage comments and messages',
    icon: FbIcon,
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    connectPlatform: 'facebook',
  },
  {
    id: 'instagram',
    label: 'Instagram Business',
    desc: 'Post photos, reels, and manage DMs',
    icon: IgIcon,
    bg: 'bg-pink-50',
    border: 'border-pink-100',
    connectPlatform: 'facebook', // Connected via Facebook OAuth
  },
  {
    id: 'gmb',
    label: 'Google Business Profile',
    desc: 'Publish Google posts, respond to reviews',
    icon: GoogleIcon,
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    connectPlatform: 'gmb',
  },
  {
    id: 'twitter',
    label: 'X (Twitter)',
    desc: 'Post tweets, threads and track impressions',
    icon: TwitterXIcon,
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    connectPlatform: 'twitter',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    desc: 'Publish videos, Shorts and grow your channel',
    icon: YouTubeIcon,
    bg: 'bg-red-50',
    border: 'border-red-100',
    connectPlatform: 'youtube',
  },
] as const;

export default function ConnectProfilesPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [loadingConnections, setLoadingConnections] = useState(true);

  useEffect(() => {
    api.get<{ success: boolean; platforms: PlatformConnection[] }>('/platforms')
      .then((res) => setConnections(res.platforms))
      .catch(() => {})
      .finally(() => setLoadingConnections(false));
  }, []);

  const isConnected = (platformId: string) =>
    connections.some((c) => c.platform === platformId && c.is_connected);

  const connectedCount = ['facebook', 'instagram', 'gmb', 'twitter', 'youtube'].filter(isConnected).length;

  const handleConnect = async (platformId: string) => {
    setConnecting(platformId);
    try {
      const res = await api.get<{ success: boolean; redirect_url: string }>(
        `/platforms/connect/${platformId}`
      );
      window.location.href = res.redirect_url;
    } catch {
      addToast({ type: 'error', title: 'Connection failed', message: 'Could not start OAuth. Check API configuration.' });
      setConnecting(null);
    }
  };

  const handleContinue = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100/50 to-slate-100 flex flex-col items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" className="w-16 h-16 rounded-2xl shadow-2xl shadow-orange-500/10 mb-4 object-cover" />
          <h1 className="text-2xl font-extrabold text-slate-900">
            Connect Your Profiles
          </h1>
          <p className="text-slate-500 text-sm mt-1 text-center max-w-xs leading-relaxed">
            Link your social accounts so CarDekho Social AI can publish posts, read comments, and show live previews
          </p>
        </div>

        {/* Connector Card Container */}
        <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm mb-4">
          {/* Progress */}
          <div className="flex items-center justify-between mb-5">
            <span className="text-slate-600 text-sm font-medium">
              {connectedCount} of 5 accounts connected
            </span>
            <div className="flex gap-1.5">
              {['facebook', 'instagram', 'gmb', 'twitter', 'youtube'].map((p) => (
                <div
                  key={p}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${isConnected(p) ? 'bg-emerald-500' : 'bg-slate-200'}`}
                />
              ))}
            </div>
          </div>

          {loadingConnections ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Checking connections…
            </div>
          ) : (
            <div className="space-y-3">
              {PLATFORM_CONFIG.map((platform) => {
                const connected = isConnected(platform.id);
                const conn = connections.find((c) => c.platform === platform.id);
                const Icon = platform.icon;
                const isInProgress = connecting === platform.connectPlatform ||
                  (platform.id === 'instagram' && connecting === 'facebook');

                return (
                  <div
                    key={platform.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                      connected
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/50'
                    }`}
                  >
                    <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Icon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-800 font-semibold text-sm">{platform.label}</p>
                        {connected && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                            Connected
                          </span>
                        )}
                        {platform.id === 'instagram' && !connected && (
                          <span className="text-[10px] bg-slate-200 text-slate-500 font-medium px-2 py-0.5 rounded-full">
                            via Facebook
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {connected && conn?.platform_account_name
                          ? conn.platform_account_name
                          : platform.desc}
                      </p>
                    </div>

                    <div className="flex-shrink-0">
                      {connected ? (
                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-emerald-700" />
                        </div>
                      ) : platform.id === 'instagram' ? (
                        <span className="text-slate-400 text-xs font-medium">Auto-linked</span>
                      ) : (
                        <button
                          onClick={() => handleConnect(platform.connectPlatform)}
                          disabled={connecting !== null}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                          {isInProgress ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            'Connect'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* AI feature teaser */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
          <p className="text-orange-800 text-xs leading-relaxed">
            Once connected, CarDekho Social AI will generate AI captions, branded creatives, and show live previews in your Facebook and Instagram profile — then post everywhere with one click.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleContinue}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-colors shadow-lg shadow-orange-500/25"
          >
            {connectedCount > 0 ? (
              <>Continue to Dashboard <ArrowRight className="w-4 h-4" /></>
            ) : (
              <>Skip for now <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </div>

        <p className="text-center text-slate-400 text-xs font-semibold mt-4">
          You can connect or disconnect platforms anytime from Accounts
        </p>
      </div>
    </div>
  );
}
