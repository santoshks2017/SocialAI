import { useState } from 'react';
import { Sparkles, RefreshCw, Phone } from 'lucide-react';
import api from '../services/api';
import { authService } from '../services/auth';
import type { UserInfo } from '../lib/permissions';

interface LoginPageProps {
  onLogin: (token: string, refresh: string, user: UserInfo) => void;
}

function FbIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [showOtp, setShowOtp] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleDemoLogin = async () => {
    setLoading('demo');
    setError('');
    try {
      const res = await api.post<{
        token: string;
        refreshToken: string;
        user: { id: string; name: string; role: string; dealer_id: string | null; permissions: Record<string, boolean>; onboarding_completed?: boolean; onboarding_step?: number };
      }>('/auth/demo');
      const userInfo: UserInfo = {
        id: res.user.id,
        name: res.user.name,
        role: res.user.role as UserInfo['role'],
        dealer_id: res.user.dealer_id,
        permissions: res.user.permissions as UserInfo['permissions'],
        onboarding_completed: res.user.onboarding_completed,
        onboarding_step: res.user.onboarding_step,
      };
      onLogin(res.token, res.refreshToken, userInfo);
    } catch {
      setError('Demo login failed. Please check your internet connection.');
    } finally {
      setLoading(null);
    }
  };

  const handleSocialConnect = async (platform: 'facebook' | 'gmb') => {
    setLoading(platform);
    setError('');
    try {
      const res = await api.get<{ success: boolean; redirect_url: string }>(
        `/platforms/connect/${platform}?signin=1`
      );
      window.location.href = res.redirect_url;
    } catch {
      setError(`Could not start ${platform === 'facebook' ? 'Facebook' : 'Google'} sign-in. Make sure the API is running and social keys are configured.`);
      setLoading(null);
    }
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    setLoading('otp');
    setError('');
    try {
      await authService.sendOtp(phone.trim());
      setOtpSent(true);
    } catch {
      setError('Failed to send OTP. Check your phone number.');
    } finally {
      setLoading(null);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) return;
    setLoading('otp');
    setError('');
    try {
      const res = await authService.verifyOtp(phone.trim(), otp.trim());
      const userInfo: UserInfo = {
        id: res.user.id,
        name: res.user.name,
        role: res.user.role as UserInfo['role'],
        dealer_id: res.user.dealer_id,
        permissions: res.user.permissions as UserInfo['permissions'],
        onboarding_completed: res.user.onboarding_completed,
        onboarding_step: res.user.onboarding_step,
      };
      onLogin(res.token, res.refreshToken, userInfo);
    } catch {
      setError('Incorrect OTP. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100/50 to-slate-200/50 flex flex-col items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-slate-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" className="w-20 h-20 rounded-2xl shadow-lg shadow-orange-500/10 mb-4 object-cover border border-slate-200/80" />
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            CarDekho <span className="text-orange-600">Social AI</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1 text-center font-medium">
            AI-powered social media for Indian auto dealers
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/50">
          <h2 className="text-slate-900 font-bold text-lg mb-1 text-center">Get Started</h2>
          <p className="text-slate-500 text-sm text-center mb-6">
            Connect your accounts to start posting
          </p>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {/* Facebook sign-in */}
            <button
              onClick={() => handleSocialConnect('facebook')}
              disabled={loading !== null}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {loading === 'facebook' ? (
                <RefreshCw className="w-5 h-5 animate-spin flex-shrink-0" />
              ) : (
                <FbIcon />
              )}
              <span className="flex-1 text-left">Continue with Facebook</span>
            </button>

            {/* Google sign-in */}
            <button
              onClick={() => handleSocialConnect('gmb')}
              disabled={loading !== null}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {loading === 'gmb' ? (
                <RefreshCw className="w-5 h-5 animate-spin flex-shrink-0 text-slate-500" />
              ) : (
                <GoogleIcon />
              )}
              <span className="flex-1 text-left">Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-slate-400 text-xs font-semibold">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Demo login */}
            <button
              onClick={handleDemoLogin}
              disabled={loading !== null}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-orange-50 border border-orange-200 hover:bg-orange-100 text-orange-700 font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {loading === 'demo' ? (
                <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 flex-shrink-0 text-orange-600" />
              )}
              <span className="flex-1 text-left">Try Demo (no sign-up needed)</span>
            </button>

            {/* Phone OTP toggle */}
            {!showOtp ? (
              <button
                onClick={() => setShowOtp(true)}
                className="w-full text-center text-slate-400 hover:text-slate-600 text-xs py-1 transition-colors cursor-pointer font-medium"
              >
                <Phone className="w-3 h-3 inline mr-1" />
                Sign in with phone number
              </button>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                  {!otpSent && (
                    <button
                      onClick={handleSendOtp}
                      disabled={!phone.trim() || loading === 'otp'}
                      className="px-3 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
                    >
                      {loading === 'otp' ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Send'}
                    </button>
                  )}
                </div>
                {otpSent && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Enter OTP"
                      maxLength={6}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 tracking-widest transition-all"
                    />
                    <button
                      onClick={handleVerifyOtp}
                      disabled={!otp.trim() || loading === 'otp'}
                      className="px-3 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
                    >
                      {loading === 'otp' ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Verify'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Social proof */}
        <div className="mt-6 flex items-center justify-center gap-6 text-slate-400 text-xs font-semibold">
          <span>AI Captions</span>
          <span>·</span>
          <span>One-click post</span>
          <span>·</span>
          <span>Live preview</span>
        </div>

        <p className="text-center text-slate-400 text-[11px] mt-4 font-semibold">
          Built for Indian automobile dealerships
        </p>
      </div>
    </div>
  );
}
