import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Film,
  Globe,
  Image,
  MessageCircle,
  Music2,
  Pin,
  Repeat2,
  Send,
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)
  ?? (import.meta.env.DEV ? 'http://127.0.0.1:3001/v1' : '');

type ConnectorStatus = 'live' | 'auto' | 'planned';

interface ConnectorAction {
  label: string;
  authUrl?: string;
  note?: string;
  status?: ConnectorStatus;
}

interface ConnectorCard {
  id: string;
  label: string;
  color: string;
  icon: ComponentType<{ className?: string }>;
  actions: ConnectorAction[];
  benefits: string[];
}

const CONNECTORS: ConnectorCard[] = [
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    icon: MessageCircle,
    actions: [{ label: 'Connect Page', authUrl: `${API_BASE}/auth/facebook`, status: 'live' }],
    benefits: ['Pages', 'Publishing', 'Engagement', 'Instagram discovery'],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    color: '#E1306C',
    icon: Image,
    actions: [
      { label: 'Connect Personal', note: 'Meta login required', status: 'planned' },
      { label: 'Connect Business or Creator', authUrl: `${API_BASE}/auth/facebook`, status: 'auto' },
    ],
    benefits: ['Reels', 'Carousels', 'Creator workflows'],
  },
  {
    id: 'google',
    label: 'Google Business Profile',
    color: '#4285F4',
    icon: Globe,
    actions: [{ label: 'Connect Profile', authUrl: `${API_BASE}/auth/google`, status: 'live' }],
    benefits: ['Locations', 'Reviews', 'Local updates'],
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    color: '#0A66C2',
    icon: Briefcase,
    actions: [
      { label: 'Connect Profile', status: 'planned' },
      { label: 'Connect Page', status: 'planned' },
    ],
    benefits: ['Professional posts', 'Hiring updates', 'Reports'],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    color: '#FF0000',
    icon: Film,
    actions: [{ label: 'Connect Channel', status: 'planned' }],
    benefits: ['Walkaround videos', 'Shorts', 'Video analytics'],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: '#111827',
    icon: Music2,
    actions: [{ label: 'Connect Business', status: 'planned' }],
    benefits: ['Short videos', 'Trends', 'Inventory clips'],
  },
  {
    id: 'twitter',
    label: 'X',
    color: '#111827',
    icon: MessageCircle,
    actions: [{ label: 'Connect Profile', status: 'planned' }],
    benefits: ['Announcements', 'Mentions', 'Threads'],
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    color: '#E60023',
    icon: Pin,
    actions: [{ label: 'Connect Board', status: 'planned' }],
    benefits: ['Boards', 'Visual discovery', 'Evergreen content'],
  },
  {
    id: 'threads',
    label: 'Threads',
    color: '#111827',
    icon: Repeat2,
    actions: [{ label: 'Connect Profile', status: 'planned' }],
    benefits: ['Conversation posts', 'Replies', 'Community growth'],
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    color: '#0285FF',
    icon: Send,
    actions: [{ label: 'Connect Profile', status: 'planned' }],
    benefits: ['Emerging channel', 'Community', 'Cross-posting'],
  },
  {
    id: 'tumblr',
    label: 'Tumblr',
    color: '#334155',
    icon: Globe,
    actions: [{ label: 'Connect Blog', status: 'planned' }],
    benefits: ['Blog posts', 'Creative archive', 'Campaign stories'],
  },
];

export default function ConnectAccountPage() {
  const { addToast } = useToast();

  const handleConnect = (connector: ConnectorCard, action: ConnectorAction) => {
    if (!action.authUrl) {
      addToast({
        type: 'info',
        title: `${connector.label} connector is queued`,
        message: action.note ?? 'This SocialPilot-style connector is visible in the product and ready for OAuth backend implementation.',
      });
      return;
    }

    const token = localStorage.getItem('access_token');
    window.location.href = token
      ? `${action.authUrl}?access_token=${encodeURIComponent(token)}`
      : action.authUrl;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <NavLink to="/accounts" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700">
              <ArrowLeft className="h-3.5 w-3.5" />
              Accounts
            </NavLink>
            <h1 className="text-2xl font-extrabold text-slate-950">Connect Account</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Choose a network, sign in with the platform, and SocialGenie will save every eligible page, profile, location, or channel returned by the OAuth flow.
            </p>
          </div>
          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-700">
            Live: 2 / Pipeline: {CONNECTORS.length - 2}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {CONNECTORS.map((connector) => {
          const Icon = connector.icon;
          return (
            <article key={connector.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mx-auto -mt-1 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 ring-8 ring-white" style={{ color: connector.color }}>
                <Icon className="h-7 w-7" />
              </div>
              <h2 className="mt-3 text-center text-base font-extrabold text-slate-900">{connector.label}</h2>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap justify-center gap-1.5">
                  {connector.benefits.map((benefit) => (
                    <span key={benefit} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      {benefit}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {connector.actions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleConnect(connector, action)}
                    className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
                      action.authUrl
                        ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                        : 'border-slate-200 bg-white text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    {action.authUrl && <CheckCircle2 className="h-4 w-4" />}
                    {action.label}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
