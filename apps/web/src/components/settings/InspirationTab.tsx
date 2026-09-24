import { useEffect, useState } from 'react';
import { Link2, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PlatformIcon } from '../ui/PlatformIcon';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useToast } from '../ui/Toast';
import api from '../../services/api';
import type { InspirationHandle } from '../../utils/settings';
import { INSPIRATION_PLATFORMS, handleTitle, inspirationStats, isHttpUrl, postsLearned, referencePlaceholder, type InspirationPlatform } from '../../utils/inspiration';
import { FieldLabel, ICON, PILL, SettingsCard, StatPill } from './SettingsParts';

function HandleSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
      <div className="w-10 h-10 rounded-lg bg-zinc-100 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2.5 w-56 rounded bg-zinc-100 animate-pulse" />
      </div>
    </div>
  );
}

function AddReferenceModal({ busy, onClose, onAdd }: {
  busy: boolean;
  onClose: () => void;
  onAdd: (input: { url: string; platform: InspirationPlatform; name: string }) => void;
}) {
  const [platform, setPlatform] = useState<InspirationPlatform>('facebook');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const link = url.trim();
  const validLink = isHttpUrl(link);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add an inspiration reference"
      description="The AI learns this page's posting style to inspire your content."
      size="md"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onAdd({ url: link, platform, name: name.trim() })} disabled={!validLink || busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Adding…' : 'Add reference'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <FieldLabel>Platform</FieldLabel>
            <ThemedSelect value={platform} onChange={(v) => setPlatform(v as InspirationPlatform)} options={INSPIRATION_PLATFORMS} ariaLabel="Platform" />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="reference-url">Page URL</FieldLabel>
            <Input id="reference-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={referencePlaceholder(platform)} />
            {link && !validLink && <p className="text-xs text-zinc-500 mt-1.5">Enter the full link, starting with https://</p>}
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="reference-name">Display name (optional)</FieldLabel>
          <Input id="reference-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brand or page name" />
        </div>
      </div>
    </Modal>
  );
}

export function InspirationTab() {
  const { addToast } = useToast();
  const [handles, setHandles] = useState<InspirationHandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<InspirationHandle | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<{ success: boolean; handles: InspirationHandle[] }>('/dealer/inspiration-handles')
      .then((res) => { if (!cancelled) setHandles(res.handles); })
      .catch(() => { if (!cancelled) addToast({ type: 'error', title: 'Error', message: 'Failed to load inspiration handles' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [addToast]);

  const add = async (input: { url: string; platform: InspirationPlatform; name: string }) => {
    setAdding(true);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle }>('/dealer/inspiration-handles', {
        handle_url: input.url,
        platform: input.platform,
        ...(input.name ? { handle_name: input.name } : {}),
      });
      // The API upserts by URL, so re-adding a page replaces its row.
      setHandles((prev) => [res.handle, ...prev.filter((h) => h.id !== res.handle.id)]);
      setShowAdd(false);
      addToast({ type: 'success', title: 'Success', message: 'Reference added — analysing posts in background' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to add handle' });
    } finally {
      setAdding(false);
    }
  };

  const refresh = async (id: string) => {
    setRefreshingId(id);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle; posts_found: number }>(`/dealer/inspiration-handles/${id}/refresh`);
      setHandles((prev) => prev.map((h) => (h.id === id ? res.handle : h)));
      addToast({ type: 'success', title: 'Success', message: `Scraped ${res.posts_found} posts` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to refresh handle' });
    } finally {
      setRefreshingId(null);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.delete(`/dealer/inspiration-handles/${removeTarget.id}`);
      setHandles((prev) => prev.filter((h) => h.id !== removeTarget.id));
      setRemoveTarget(null);
      addToast({ type: 'success', title: 'Success', message: 'Handle removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove handle' });
    } finally {
      setRemoving(false);
    }
  };

  const stats = inspirationStats(handles);

  return (
    <div className="space-y-4">
      <SettingsCard className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Inspiration references</h2>
              <p className="text-xs text-zinc-500 mt-0.5 max-w-xl">
                Add Facebook or Instagram pages you admire. The AI studies their posts and uses them as inspiration when writing your captions and designing creatives.
              </p>
            </div>
          </div>
          <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Add reference</Button>
        </div>
        {handles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <StatPill value={stats.references} label="References" />
            <StatPill value={stats.facebook} label="Facebook" />
            <StatPill value={stats.instagram} label="Instagram" />
            <StatPill value={stats.postsLearned} label="Posts learned" />
          </div>
        )}
      </SettingsCard>

      {loading ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm divide-y divide-zinc-100 overflow-hidden">
          <HandleSkeleton />
          <HandleSkeleton />
        </div>
      ) : handles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 bg-white rounded-2xl border border-dashed border-zinc-200">
          <div className="w-11 h-11 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3"><Link2 className="w-5 h-5" /></div>
          <p className="text-sm font-semibold text-zinc-800">No references yet</p>
          <p className="text-xs text-zinc-500 mt-1">Add a page you admire and the AI will learn from it.</p>
          <Button variant="secondary" className="mt-4" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Add reference</Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm divide-y divide-zinc-100 overflow-hidden">
          {handles.map((h) => {
            const count = postsLearned(h);
            const instagram = h.platform === 'instagram';
            return (
              <div key={h.id} className="flex items-start gap-3 px-4 sm:px-5 py-3.5">
                <div className="w-10 h-10 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center flex-shrink-0">
                  <PlatformIcon platform={instagram ? 'instagram' : 'facebook'} size="md" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{handleTitle(h)}</p>
                    <span className={cn(PILL, 'bg-blue-50 text-blue-700 ring-1 ring-blue-100')}>
                      {instagram ? 'Instagram' : 'Facebook'}
                    </span>
                    {count > 0
                      ? <span className={cn(PILL, 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100')}>{count} post{count === 1 ? '' : 's'} learned</span>
                      : <span className="text-[11px] text-zinc-400">Not analysed yet</span>}
                  </div>
                  {isHttpUrl(h.handle_url) ? (
                    <a href={h.handle_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-zinc-500 hover:text-orange-600 mt-0.5">
                      {h.handle_url}
                    </a>
                  ) : (
                    <p className="truncate text-xs text-zinc-500 mt-0.5">{h.handle_url}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => void refresh(h.id)}
                    disabled={refreshingId === h.id}
                    title="Re-analyse"
                    aria-label={`Re-analyse ${handleTitle(h)}`}
                    className={cn(ICON, 'text-zinc-400 hover:text-orange-600 hover:bg-zinc-100 disabled:opacity-50')}
                  >
                    <RefreshCw className={cn('w-4 h-4', refreshingId === h.id && 'animate-spin')} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(h)}
                    title="Remove"
                    aria-label={`Remove ${handleTitle(h)}`}
                    className={cn(ICON, 'text-zinc-400 hover:text-red-600 hover:bg-red-50')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddReferenceModal busy={adding} onClose={() => setShowAdd(false)} onAdd={(input) => void add(input)} />}
      {removeTarget && (
        <Modal
          isOpen
          onClose={() => { if (!removing) setRemoveTarget(null); }}
          title="Remove inspiration handle?"
          variant="danger"
          size="sm"
          closeOnOverlayClick={!removing}
          closeOnEscape={!removing}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setRemoveTarget(null)} disabled={removing}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove()} disabled={removing}>
                {removing && <Loader2 className="w-4 h-4 animate-spin" />}
                Remove handle
              </Button>
            </>
          )}
        >
          <p className="text-sm text-zinc-600">
            The handle <strong className="text-zinc-900">{handleTitle(removeTarget)}</strong> and its cached posts will be permanently removed.
          </p>
        </Modal>
      )}
    </div>
  );
}
