import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ui/Toast';
import { oauthToast, readOAuthReturn } from '../utils/connectPlatform';

// Where Meta and Google send the browser after a connect: shows the outcome, then returns to the page that
// started it (Accounts, Onboarding or Settings, stored by startConnect before the redirect).
export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return; // StrictMode runs effects twice in development
    handled.current = true;
    const toast = oauthToast(new URLSearchParams(window.location.search));
    if (toast) addToast(toast);
    navigate(readOAuthReturn(), { replace: true });
  }, [addToast, navigate]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-sm text-zinc-500">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        {'Completing connection\u2026'}
      </div>
    </div>
  );
}
