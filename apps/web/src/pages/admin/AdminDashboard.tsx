import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, TrendingUp, IndianRupee, Layers, 
  Search, ArrowRightLeft, UserCheck, RefreshCw,
  Calendar
} from 'lucide-react';
import { adminService } from '../../services/admin';
import type { AdminMetrics, AdminDealer } from '../../services/admin';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const { addToast } = useToast();

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [dealers, setDealers] = useState<AdminDealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [metricsRes, dealersRes] = await Promise.all([
        adminService.getDashboard(),
        adminService.getDealers(),
      ]);
      if (metricsRes.success) setMetrics(metricsRes.metrics);
      if (dealersRes.success) setDealers(dealersRes.items);
    } catch (err: any) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Access Denied',
        message: err.message || 'You must be a global owner to access this panel.',
      });
      // Redirect away from admin if access is forbidden
      if (err.status === 403) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleImpersonate = async (dealer: AdminDealer) => {
    setImpersonatingId(dealer.id);
    try {
      const res = await adminService.impersonateDealer(dealer.id);
      if (res.success) {
        // Save current admin credentials to restore later
        const currentToken = localStorage.getItem('access_token');
        const currentRefresh = localStorage.getItem('refresh_token');
        const currentUserInfo = localStorage.getItem('user_info');
        
        if (currentToken && currentUserInfo) {
          localStorage.setItem('admin_access_token', currentToken);
          if (currentRefresh) localStorage.setItem('admin_refresh_token', currentRefresh);
          localStorage.setItem('admin_user_info', currentUserInfo);
        }

        // Swap to the impersonated user session
        loginWithToken(res.token, res.refreshToken, {
          id: res.user.id,
          name: res.user.name,
          role: res.user.role as any,
          dealer_id: res.user.dealerId,
          permissions: {} as any, // Temporary permissions
          onboarding_completed: true,
          onboarding_step: 5,
        });

        addToast({
          type: 'success',
          title: 'Impersonation Mode Active',
          message: `Now acting as admin for ${dealer.name}.`,
        });

        // Redirect to dealer dashboard
        navigate('/');
        // Force reload to refresh context providers (DealerProfileContext etc.)
        window.location.reload();
      }
    } catch (err: any) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Impersonation Failed',
        message: err.message || 'Could not impersonate this dealer.',
      });
    } finally {
      setImpersonatingId(null);
    }
  };

  const filteredDealers = dealers.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.city.toLowerCase().includes(q) ||
      d.state.toLowerCase().includes(q) ||
      d.phone.toLowerCase().includes(q)
    );
  });

  if (loading && !metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading administrator panel...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
          SocialGenie Admin Panel
          <span className="bg-red-100 text-red-700 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
            Owner Only
          </span>
        </h1>
        <p className="text-slate-500 mt-1">Global platform metrics, revenue tracking, and dealer impersonation control.</p>
      </div>

      {/* Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500">
              <IndianRupee className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Total MRR</p>
              <p className="text-2xl font-black text-slate-900 mt-0.5">₹{metrics.mrr.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center text-teal-500">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Active Dealers</p>
              <p className="text-2xl font-black text-slate-900 mt-0.5">{metrics.activeDealers}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">WADP (Active Posts/Wk)</p>
              <p className="text-2xl font-black text-slate-900 mt-0.5">{metrics.wadp}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Total AI Posts</p>
              <p className="text-2xl font-black text-slate-900 mt-0.5">{metrics.totalPosts}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3 col-span-2 lg:col-span-1">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Total Users</p>
              <p className="text-2xl font-black text-slate-900 mt-0.5">{metrics.totalUsers}</p>
            </div>
          </div>
        </div>
      )}

      {/* Dealers Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Registered Dealership Orgs</h2>
            <p className="text-xs text-slate-400 mt-0.5">Manage connected handles, view subscription plans, and impersonate admins.</p>
          </div>
          
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search dealers by name, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Dealer Name</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Current Plan</th>
                <th className="px-6 py-4">Onboarding Step</th>
                <th className="px-6 py-4">AI Posts Generated</th>
                <th className="px-6 py-4">Handles Connected</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredDealers.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-bold text-slate-900 text-[13px]">{d.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Phone: {d.phone}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-slate-900">{d.city}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{d.state}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-wider border ${
                        d.plan === 'starter' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                        d.plan === 'growth' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                        'bg-purple-50 text-purple-600 border-purple-100'
                      }`}>
                        {d.plan}
                      </span>
                      {d.expiresAt && (
                        <span className="text-[9px] text-slate-400">
                          Expires: {new Date(d.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {d.onboardingCompleted ? (
                      <span className="text-teal-600 font-bold flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" /> Completed
                      </span>
                    ) : (
                      <span className="text-yellow-600 font-bold bg-yellow-50 px-2 py-0.5 rounded border border-yellow-100">
                        Step {d.onboardingStep}/5
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-extrabold text-slate-900">{d.postCount}</p>
                  </td>
                  <td className="px-6 py-4">
                    {d.connectedHandles.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {d.connectedHandles.map((handle, idx) => (
                          <span key={idx} className="bg-slate-100 text-slate-600 text-[9px] px-1.5 py-0.5 rounded">
                            {handle.split(':')[0]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 italic">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="secondary"
                      className="bg-orange-50 hover:bg-orange-100 text-orange-600 hover:text-orange-700 text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 ml-auto shadow-sm"
                      onClick={() => handleImpersonate(d)}
                      disabled={impersonatingId !== null}
                    >
                      {impersonatingId === d.id ? (
                        <RefreshCw className="w-3 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="w-3 h-3" />
                      )}
                      Impersonate
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredDealers.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 italic">
                    No dealerships match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
