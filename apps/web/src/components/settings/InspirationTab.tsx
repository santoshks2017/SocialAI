import { useEffect, useState } from 'react';
import { Link2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import api from '../../services/api';
import type { InspirationHandle } from '../../utils/settings';

function FbSvg() {
  return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>;
}
function IgSvg() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="url(#ig-s-settings)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs><linearGradient id="ig-s-settings" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="50%" stopColor="#e6683c"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
}

// Moved from SettingsPage.tsx; Task 12 ports it to the reference layout.
export function InspirationTab() {
  const { addToast } = useToast();
  const [handles, setHandles] = useState<InspirationHandle[]>([]);
  const [loadingHandles, setLoadingHandles] = useState(true);
  const [handleUrl, setHandleUrl] = useState('');
  const [handlePlatform, setHandlePlatform] = useState<'facebook' | 'instagram'>('facebook');
  const [handleName, setHandleName] = useState('');
  const [addingHandle, setAddingHandle] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ success: boolean; handles: InspirationHandle[] }>('/dealer/inspiration-handles')
      .then((res) => setHandles(res.handles))
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Failed to load inspiration handles' }))
      .finally(() => setLoadingHandles(false));
  }, [addToast]);

  const handleAddHandle = async () => {
    if (!handleUrl.trim()) return;
    setAddingHandle(true);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle }>('/dealer/inspiration-handles', {
        handle_url: handleUrl.trim(),
        platform: handlePlatform,
        handle_name: handleName.trim() || undefined,
      });
      setHandles((prev) => [res.handle, ...prev]);
      setHandleUrl('');
      setHandleName('');
      addToast({ type: 'success', title: 'Success', message: 'Handle added — scraping posts in background' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to add handle' });
    } finally {
      setAddingHandle(false);
    }
  };

  const handleDeleteHandle = async (id: string) => {
    try {
      await api.delete(`/dealer/inspiration-handles/${id}`);
      setHandles((prev) => prev.filter((h) => h.id !== id));
      addToast({ type: 'success', title: 'Success', message: 'Handle removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove handle' });
    }
  };

  const handleRefreshHandle = async (id: string) => {
    setRefreshingId(id);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle; posts_found: number }>(
        `/dealer/inspiration-handles/${id}/refresh`,
      );
      setHandles((prev) => prev.map((h) => h.id === id ? res.handle : h));
      addToast({ type: 'success', title: 'Success', message: `Scraped ${res.posts_found} posts` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to refresh handle' });
    } finally {
      setRefreshingId(null);
    }
  };

  return (
        <div className="space-y-5">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-900 font-medium">
            <p className="font-bold mb-1 text-orange-950">AI Inspiration from Reference Pages</p>
            <p className="text-orange-900/90 leading-relaxed">Add Facebook or Instagram page URLs of dealers or brands you admire. The AI will study their posts and use them as inspiration when generating captions and creatives — tailored to Indian automotive context.</p>
          </div>

          {/* Add handle form */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4 text-orange-500" />
              Add Reference Handle
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-600 mb-1 block">Platform</label>
                <select
                  value={handlePlatform}
                  onChange={(e) => setHandlePlatform(e.target.value as 'facebook' | 'instagram')}
                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  <option value="facebook" className="bg-white">Facebook</option>
                  <option value="instagram" className="bg-white">Instagram</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-600 mb-1 block">Page / Profile URL</label>
                <input
                  value={handleUrl}
                  onChange={(e) => setHandleUrl(e.target.value)}
                  placeholder={handlePlatform === 'facebook' ? 'https://www.facebook.com/MarutiSuzukiIndia' : 'https://www.instagram.com/hyundaiindia'}
                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Display Name (optional)</label>
              <input
                value={handleName}
                onChange={(e) => setHandleName(e.target.value)}
                placeholder="e.g. Maruti Suzuki India"
                className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <Button
              onClick={handleAddHandle}
              disabled={!handleUrl.trim() || addingHandle}
              className="flex items-center gap-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {addingHandle ? 'Adding...' : 'Add Handle'}
            </Button>
          </div>

          {/* Handles list */}
          {loadingHandles ? (
            <div className="text-center py-8 text-slate-500 text-sm">Loading handles...</div>
          ) : handles.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm bg-slate-50/50 rounded-xl border border-dashed border-slate-300">
              No reference handles added yet. Add a Facebook or Instagram page above.
            </div>
          ) : (
            <div className="space-y-3">
              {handles.map((h) => (
                <div key={h.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-50 border border-slate-200">
                      {h.platform === 'facebook' ? <FbSvg /> : <IgSvg />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{h.handle_name ?? h.handle_url}</p>
                      <a
                        href={h.handle_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-orange-600 hover:underline truncate block font-medium"
                      >
                        {h.handle_url}
                      </a>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${h.platform === 'facebook' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-pink-50 text-pink-700 border border-pink-200'}`}>
                          {h.platform === 'facebook' ? 'Facebook' : 'Instagram'}
                        </span>
                        {h.posts_cache && Array.isArray(h.posts_cache) && h.posts_cache.length > 0 ? (
                          <span className="text-xs text-emerald-600 font-semibold">{h.posts_cache.length} posts cached</span>
                        ) : (
                          <span className="text-xs text-slate-500">No posts cached yet</span>
                        )}
                        {h.last_scraped_at && (
                          <span className="text-xs text-slate-500">
                            Last scraped {new Date(h.last_scraped_at).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleRefreshHandle(h.id)}
                        disabled={refreshingId === h.id}
                        title="Re-scrape posts"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-4 h-4 ${refreshingId === h.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleDeleteHandle(h.id)}
                        title="Remove handle"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-650 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
  );
}
