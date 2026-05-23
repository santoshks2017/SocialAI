import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../services/api';

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

function FacebookIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#FFFFFF" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export default function SignupPage() {
  const navigate = useNavigate();
  const { loginDemo } = useAuth();
  
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleGoogleSignUp = () => {
    setLoading('google');
    setError('');
    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  const handleFacebookSignUp = () => {
    setLoading('facebook');
    setError('');
    window.location.href = `${API_BASE_URL}/auth/facebook-login`;
  };

  const handleDemoLogin = async () => {
    setLoading('demo');
    setError('');
    try {
      const user = await loginDemo();
      if (user.onboarding_completed) {
        navigate('/');
      } else {
        navigate('/onboarding');
      }
    } catch {
      setError('Demo login failed. Please check your connection.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background design elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[30%] w-[500px] h-[500px] bg-orange-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25 mb-4 border border-orange-400/20">
            <span className="font-extrabold text-white text-2xl tracking-tighter">CD</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight font-display">
            Start with <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">CarDekho Social AI</span>
          </h1>
          <p className="text-slate-400 text-xs mt-1 text-center font-medium">
            AI-powered social media automation for auto dealers
          </p>
        </div>

        {/* Auth Box */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-slate-950/80">
          <h2 className="text-white font-bold text-lg mb-1">Create Account</h2>
          <p className="text-slate-400 text-xs mb-6">
            Register your dealership in seconds
          </p>

          {error && (
            <div className="mb-5 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-xs font-semibold">
              {error}
            </div>
          )}

          <div className="space-y-4 font-sans">
            {/* Google Sign Up */}
            <button
              onClick={handleGoogleSignUp}
              disabled={loading !== null}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs transition-all duration-300 cursor-pointer disabled:opacity-50 shadow-sm border border-slate-200"
            >
              {loading === 'google' ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-600 flex-shrink-0" />
              ) : (
                <GoogleIcon />
              )}
              <span className="flex-1 text-left">Signup with Gmail</span>
            </button>

            {/* Facebook Sign Up */}
            <button
              onClick={handleFacebookSignUp}
              disabled={loading !== null}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold text-xs transition-all duration-300 cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {loading === 'facebook' ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white flex-shrink-0" />
              ) : (
                <FacebookIcon />
              )}
              <span className="flex-1 text-left">Signup with Facebook</span>
            </button>

            {/* Login Redirect */}
            <p className="text-center text-xs text-slate-500 mt-2">
              Already have an account?{' '}
              <Link to="/login" className="text-orange-400 font-bold hover:underline">
                Sign in
              </Link>
            </p>

            <div className="h-px bg-slate-800/80 my-4" />

            {/* Sandbox Demo Button */}
            <button
              onClick={handleDemoLogin}
              disabled={loading !== null}
              className="w-full py-3 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-orange-400 font-bold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {loading === 'demo' ? (
                <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-orange-400" />
              )}
              Try Demo Sandbox (no setup needed)
            </button>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-slate-500 text-[10px] mt-6 font-semibold tracking-wide">
          BUILT FOR AUTOMOBILE DEALERS IN INDIA
        </p>
      </div>
    </div>
  );
}
