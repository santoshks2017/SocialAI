import { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Search,
  ArrowLeft,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import api from '../services/api';

const Facebook = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const Instagram = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)
  ?? (import.meta.env.DEV ? 'http://127.0.0.1:3001/v1' : '');

interface FacebookPageInfo {
  id: string;
  name: string;
  access_token: string;
}

interface InstagramInfo {
  id: string;
  username: string;
  page_id: string;
  page_access_token: string;
}

interface OAuthData {
  pages: FacebookPageInfo[];
  instagrams: InstagramInfo[];
  tokenExpiry: string;
}

interface AccountConnectionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPlatform?: 'facebook' | 'instagram';
}

type WizardStep = 'intro' | 'authenticating' | 'select' | 'success';

export default function AccountConnectionWizard({
  isOpen,
  onClose,
  onSuccess,
  initialPlatform = 'facebook',
}: AccountConnectionWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<WizardStep>('intro');
  const [platform, setPlatform] = useState<'facebook' | 'instagram'>(initialPlatform);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data from OAuth Callback
  const [oauthData, setOauthData] = useState<OAuthData | null>(null);
  
  // Selection states
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [selectedInstagramId, setSelectedInstagramId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle Dialog Open/Close
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setError(null);
      setOauthData(null);
      setSelectedPageId('');
      setSelectedInstagramId('');
      setSearchQuery('');
      setStep('intro');
      setPlatform(initialPlatform);
      
      // Native showModal traps focus, enables Esc to close
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen, initialPlatform]);

  // Fallback for click-outside light-dismiss (since Safari lacks closedby="any")
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (e.target !== dialog) return;

      const rect = dialog.getBoundingClientRect();
      const isInside = (
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width
      );

      if (!isInside) {
        onClose();
      }
    };

    dialog.addEventListener('click', handleOutsideClick);
    return () => {
      dialog.removeEventListener('click', handleOutsideClick);
    };
  }, [onClose]);

  // Handle OAuth Communication from Popup
  useEffect(() => {
    if (step !== 'authenticating') return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'oauth_success') {
        const payloadStr = event.data?.data as string | undefined;
        if (payloadStr) {
          try {
            const data = JSON.parse(payloadStr) as OAuthData;
            setOauthData(data);
            
            // Pre-select first option if available
            if (platform === 'facebook' && data.pages.length > 0) {
              setSelectedPageId(data.pages[0].id);
            } else if (platform === 'instagram' && data.instagrams.length > 0) {
              setSelectedInstagramId(data.instagrams[0].id);
            }
            
            setStep('select');
          } catch (err) {
            console.error('Failed to parse OAuth data payload:', err);
            setError('Received invalid data from Meta authorization.');
            setStep('intro');
          }
        } else {
          setError('Authorization succeeded, but no pages list was returned.');
          setStep('intro');
        }
      } else if (event.data?.type === 'oauth_error') {
        const errorMsg = event.data?.error as string;
        const messages: Record<string, string> = {
          server_config: 'OAuth credentials are not configured on the server.',
          token_exchange_failed: 'Failed to negotiate token with Meta APIs.',
          no_code: 'Facebook Authorization was cancelled.',
          access_denied: 'You must grant all required permissions to link pages.',
        };
        setError(messages[errorMsg] ?? `Connection failed: ${errorMsg}`);
        setStep('intro');
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [step, platform]);

  const startOAuthFlow = () => {
    setError(null);
    setStep('authenticating');

    const token = localStorage.getItem('access_token');
    const authUrl = `${API_BASE}/auth/facebook${token ? `?access_token=${encodeURIComponent(token)}` : ''}`;

    const popup = window.open(
      authUrl,
      'sg_oauth_wizard',
      'width=620,height=720,scrollbars=yes,resizable=yes'
    );

    if (!popup || popup.closed) {
      setError('Popup blocked! Please allow popups for this site to complete Meta authentication.');
      setStep('intro');
      return;
    }

    // Monitor popup close as fallback
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        // If we didn't advance to 'select', reset step
        setStep((currentStep) => {
          if (currentStep === 'authenticating') {
            setError('Authorization window was closed.');
            return 'intro';
          }
          return currentStep;
        });
      }
    }, 1000);
  };

  const handleSaveConnection = async () => {
    if (!oauthData) return;
    setLoading(true);
    setError(null);

    try {
      if (platform === 'facebook') {
        const page = oauthData.pages.find((p) => p.id === selectedPageId);
        if (!page) {
          setError('Please select a Facebook page.');
          setLoading(false);
          return;
        }

        await api.post('/platform-accounts', {
          platform: 'facebook',
          accountId: page.id,
          accountName: page.name,
          accessToken: page.access_token,
          tokenExpiry: oauthData.tokenExpiry,
        });
      } else {
        const ig = oauthData.instagrams.find((i) => i.id === selectedInstagramId);
        if (!ig) {
          setError('Please select an Instagram account.');
          setLoading(false);
          return;
        }

        await api.post('/platform-accounts', {
          platform: 'instagram',
          accountId: ig.id,
          accountName: ig.username,
          accessToken: ig.page_access_token,
          tokenExpiry: oauthData.tokenExpiry,
        });
      }

      setStep('success');
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Failed to link account to dealership.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Filters
  const filteredPages = oauthData?.pages.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  const filteredInstagrams = oauthData?.instagrams.filter((i) =>
    i.username.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  return (
    <dialog
      ref={dialogRef}
      className="rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-md outline-none max-w-md w-full overflow-hidden transition-all duration-300"
      aria-labelledby="wizard-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2">
          {platform === 'facebook' ? (
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Facebook className="w-4.5 h-4.5" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center">
              <Instagram className="w-4.5 h-4.5" />
            </div>
          )}
          <h2 id="wizard-title" className="font-extrabold text-slate-900 text-sm">
            {platform === 'facebook' ? 'Connect Facebook Page' : 'Connect Instagram Business'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content wrapper */}
      <div className="p-6">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 p-3.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Something went wrong</p>
              <p className="mt-0.5 text-red-600/90 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Step 1: Intro / Switch Platform */}
        {step === 'intro' && (
          <div className="space-y-5">
            {platform === 'facebook' ? (
              <div className="space-y-4">
                <div className="text-center py-2">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Facebook className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">Link your Facebook Page</h3>
                  <p className="text-xs text-slate-500 mt-1 px-4 leading-relaxed">
                    Automate posts directly to your showroom Page, track reach metrics, and manage customer reviews.
                  </p>
                </div>

                <div className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Features unlocked:</h4>
                  <ul className="space-y-2 text-xs text-slate-600">
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                      Automatic post scheduling & AI draft approval
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                      Boost campaigns and budget tracking
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-2">
                  <div className="w-14 h-14 bg-pink-50 text-pink-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Instagram className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">Link your Instagram Handle</h3>
                  <p className="text-xs text-slate-500 mt-1 px-4 leading-relaxed">
                    Meta requires an active **Facebook Business Page** linked to your Instagram Creator or Business handle to enable direct publishing.
                  </p>
                </div>

                <div className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Required Checklist:</h4>
                  <ul className="space-y-2 text-xs text-slate-600">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      An Instagram **Business** or **Creator** account
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      Linked to a Facebook Page you manage
                    </li>
                  </ul>
                </div>
              </div>
            )}

            <button
              onClick={startOAuthFlow}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white hover:bg-black font-extrabold text-sm transition-all shadow-md"
            >
              Connect with Meta OAuth
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 text-center font-medium">
              <Lock className="w-3 h-3" /> Secure connection powered by official Meta Graph APIs
            </div>
          </div>
        )}

        {/* Step 2: Authenticating Popup */}
        {step === 'authenticating' && (
          <div className="text-center py-8 space-y-4">
            <div className="relative w-12 h-12 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-slate-100" />
              <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
              <Facebook className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Authorizing with Facebook</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                Please complete the login in the pop-up window. Once finished, this wizard will show your accounts.
              </p>
            </div>
            <button
              onClick={startOAuthFlow}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 transition-colors mx-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Re-open popup
            </button>
          </div>
        )}

        {/* Step 3: Asset Selector */}
        {step === 'select' && oauthData && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Select your {platform === 'facebook' ? 'Facebook Page' : 'Instagram Handle'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                We found the following eligible accounts under your Meta profile.
              </p>
            </div>

            {/* Search filter */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={platform === 'facebook' ? 'Search managed pages' : 'Search handles'}
                className="w-full h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
              />
            </div>

            {/* List */}
            <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
              {platform === 'facebook' ? (
                filteredPages.length > 0 ? (
                  filteredPages.map((page) => {
                    const isSelected = selectedPageId === page.id;
                    return (
                      <button
                        key={page.id}
                        onClick={() => setSelectedPageId(page.id)}
                        className={`w-full flex items-center justify-between p-3.5 text-left transition-all ${
                          isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-slate-800 text-xs">{page.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">ID: {page.id}</p>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400">No matching pages found</div>
                )
              ) : (
                filteredInstagrams.length > 0 ? (
                  filteredInstagrams.map((ig) => {
                    const isSelected = selectedInstagramId === ig.id;
                    return (
                      <button
                        key={ig.id}
                        onClick={() => setSelectedInstagramId(ig.id)}
                        className={`w-full flex items-center justify-between p-3.5 text-left transition-all ${
                          isSelected ? 'bg-pink-50/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-slate-800 text-xs">@{ig.username}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">via page ID: {ig.page_id}</p>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                            isSelected
                              ? 'border-pink-600 bg-pink-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No connected Instagram Business accounts found. Ensure your Instagram account is linked to your Facebook page.
                  </div>
                )
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setStep('intro')}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={handleSaveConnection}
                disabled={loading || (platform === 'facebook' ? !selectedPageId : !selectedInstagramId)}
                className={`flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white font-extrabold text-xs transition-all shadow-md ${
                  platform === 'facebook'
                    ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300'
                    : 'bg-pink-600 hover:bg-pink-700 disabled:bg-pink-300'
                } disabled:cursor-not-allowed disabled:shadow-none`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Linking...
                  </>
                ) : (
                  <>Link Selected Account</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success state */}
        {step === 'success' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-sm animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Account Linked Successfully!</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                Your {platform === 'facebook' ? 'Facebook Page' : 'Instagram handle'} is connected to CarDekho Social AI. You can now publish and schedule posts from the central dashboard.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-extrabold text-sm transition-all shadow-md"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
