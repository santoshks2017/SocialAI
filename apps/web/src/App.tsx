import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React from 'react';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DealerProfileProvider } from './contexts/DealerProfileContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppLayout } from './components/shell/AppLayout';

import CreateStudio from './pages/CreateStudio';
import CalendarPage from './pages/Calendar';
import InboxPage from './pages/InboxPage';
import InventoryPage from './pages/Inventory';
import BoostPage from './pages/Boost';
import AnalyticsPage from './pages/AnalyticsPage';
import ReportPage from './pages/ReportPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import SettingsPage from './pages/SettingsPage';
import AccountsPage from './pages/AccountsPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import PostsPage from './pages/PostsPage';
import Onboarding from './pages/Onboarding';
import BillingPage from './pages/BillingPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import ApiConnectionsPage from './pages/admin/ApiConnectionsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ConnectProfilesPage from './pages/ConnectProfilesPage';
import type { UserInfo } from './lib/permissions';
import { isGlobalOwner } from './lib/permissions';
import ApprovePage from './pages/ApprovePage';
import Dashboard from './pages/Dashboard';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, token, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

// Client-side guard only; the API enforces owner access on /v1/admin too.
function RequireGlobalOwner({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!isGlobalOwner(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Inner component that has access to AuthContext
function AppRoutes() {
  const { loginWithToken } = useAuth();

  const handleLogin = (token: string, refresh: string, user: UserInfo) => {
    loginWithToken(token, refresh, user);
  };

  return (
    <DealerProfileProvider>
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage onLogin={handleLogin} />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/approve/:token" element={<ApprovePage />} />

      {/* Protected routes */}
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><AppLayout><Dashboard /></AppLayout></RequireAuth>} />
      <Route path="/create" element={<RequireAuth><AppLayout fullBleed><CreateStudio /></AppLayout></RequireAuth>} />
      <Route path="/posts"    element={<RequireAuth><AppLayout><PostsPage /></AppLayout></RequireAuth>} />
      <Route path="/calendar" element={<RequireAuth><AppLayout><CalendarPage /></AppLayout></RequireAuth>} />
      <Route path="/inbox" element={<RequireAuth><AppLayout><InboxPage /></AppLayout></RequireAuth>} />
      <Route path="/inventory" element={<RequireAuth><AppLayout><InventoryPage /></AppLayout></RequireAuth>} />
      <Route path="/analytics" element={<RequireAuth><AppLayout><AnalyticsPage /></AppLayout></RequireAuth>} />
      {/* Printable report: signed in, but outside AppLayout so it prints without the app shell. */}
      <Route path="/report" element={<RequireAuth><ReportPage /></RequireAuth>} />
      <Route path="/boost" element={<RequireAuth><AppLayout><BoostPage /></AppLayout></RequireAuth>} />
      <Route path="/accounts" element={<RequireAuth><AppLayout><AccountsPage /></AppLayout></RequireAuth>} />
      <Route path="/accounts/create" element={<RequireAuth><AppLayout><ConnectProfilesPage /></AppLayout></RequireAuth>} />
      <Route path="/billing" element={<RequireAuth><AppLayout><BillingPage /></AppLayout></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><RequireGlobalOwner><AppLayout><AdminDashboard /></AppLayout></RequireGlobalOwner></RequireAuth>} />
      <Route path="/admin/apis" element={<RequireAuth><RequireGlobalOwner><AppLayout><ApiConnectionsPage /></AppLayout></RequireGlobalOwner></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><AppLayout><SettingsPage /></AppLayout></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </DealerProfileProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Router>
            <AppRoutes />
          </Router>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
