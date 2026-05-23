import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Car, RefreshCw } from 'lucide-react';

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const platform = searchParams.get('platform');
    const pageName = searchParams.get('page_name');

    // Build the message to send to the opener (AccountsPage popup flow)
    const message = success
      ? { type: 'oauth_success', platform, pageName }
      : { type: 'oauth_error', error, platform };

    // Popup mode: post message to the opener window and close
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(message, window.location.origin);
      } catch {
        // opener may be from a cross-origin navigation or already closed
      }
      window.close();
      return;
    }

    // Direct navigation fallback — redirect to /accounts with status params
    const params = new URLSearchParams();
    if (success) {
      params.set('connected', 'true');
      if (platform) params.set('platform', platform);
      if (pageName) params.set('page_name', pageName);
    }
    if (error) {
      params.set('error', error);
      if (platform) params.set('platform', platform);
    }
    window.location.replace(`/accounts?${params}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1117] via-[#141824] to-[#1a1f2e] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-orange-500/30">
          <Car className="w-8 h-8 text-white" />
        </div>
        <div className="flex items-center gap-2 text-white/60 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Completing connection…
        </div>
      </div>
    </div>
  );
}
