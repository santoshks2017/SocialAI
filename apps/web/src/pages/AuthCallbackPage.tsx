import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Car, RefreshCw } from 'lucide-react';
import type { UserInfo } from '../lib/permissions';
import api from '../services/api';

interface AuthCallbackPageProps {
  onLogin: (token: string, refresh: string, user: UserInfo) => void;
}

export default function AuthCallbackPage({ onLogin }: AuthCallbackPageProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const refresh = searchParams.get('refresh') ?? '';

    if (!token) {
      navigate('/login?error=oauth_failed');
      return;
    }

    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload)) as {
        dealer_user_id: string;
        dealer_id: string | null;
        role: string;
        phone: string;
        permissions: Record<string, boolean>;
      };

      // Store tokens first so API calls can work
      localStorage.setItem('access_token', token);
      if (refresh) localStorage.setItem('refresh_token', refresh);

      // Fetch user info + dealer profile to check onboarding
      Promise.all([
        api.get<{ user: { id: string; name: string; role: string; dealerId: string | null; permissions: Record<string, boolean> } }>('/users/me'),
        api.get<{ success: boolean; profile: { onboarding_completed: boolean; onboarding_step: number } }>('/dealer/profile').catch(() => ({ success: false, profile: { onboarding_completed: false, onboarding_step: 1 } }))
      ]).then(([userRes, profileRes]) => {
        const onboardingCompleted = profileRes.success && profileRes.profile ? profileRes.profile.onboarding_completed : false;
        const onboardingStep = profileRes.success && profileRes.profile ? profileRes.profile.onboarding_step : 1;

        const userInfo: UserInfo = {
          id: decoded.dealer_user_id,
          name: userRes.user.name,
          role: decoded.role as UserInfo['role'],
          dealer_id: decoded.dealer_id,
          permissions: decoded.permissions as UserInfo['permissions'],
          onboarding_completed: onboardingCompleted,
          onboarding_step: onboardingStep,
        };

        localStorage.setItem('user_info', JSON.stringify(userInfo));
        onLogin(token, refresh, userInfo);

        if (onboardingCompleted) {
          navigate('/');
        } else {
          navigate('/onboarding');
        }
      }).catch(() => {
        // Fallback using JWT payload
        const userInfo: UserInfo = {
          id: decoded.dealer_user_id,
          name: 'User',
          role: decoded.role as UserInfo['role'],
          dealer_id: decoded.dealer_id,
          permissions: decoded.permissions as UserInfo['permissions'],
          onboarding_completed: false,
          onboarding_step: 1,
        };
        localStorage.setItem('user_info', JSON.stringify(userInfo));
        onLogin(token, refresh, userInfo);
        navigate('/onboarding');
      });
    } catch {
      navigate('/login?error=invalid_token');
    }
  }, [searchParams, onLogin, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1117] via-[#141824] to-[#1a1f2e] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-orange-500/30 animate-pulse">
          <Car className="w-8 h-8 text-white" />
        </div>
        <div className="flex items-center gap-2 text-white/60 text-sm justify-center">
          <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
          Completing sign-in…
        </div>
      </div>
    </div>
  );
}
