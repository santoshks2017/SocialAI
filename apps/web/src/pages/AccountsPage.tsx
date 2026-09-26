import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AccountLibrary } from '../components/accounts/AccountLibrary';
import { StatPill } from '../components/accounts/AccountPills';
import { DisconnectModal } from '../components/accounts/DisconnectModal';
import { PlatformCard } from '../components/accounts/PlatformCard';
import { cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { useToast } from '../components/ui/Toast';
import { ApiError } from '../services/api';
import { accountsService } from '../services/accounts';
import { trackEvent } from '../services/events';
import {
  LIVE_CHANNELS, notifyToast, sortedCatalogue, syncInstagramToast,
  type CardAction, type CatalogueEntry, type ConnectedAccount, type PlatformFilter,
} from '../utils/accounts';
import { startConnect } from '../utils/connectPlatform';

const CATALOGUE = sortedCatalogue();

export default function AccountsPage() {
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConnectedAccount | null>(null);
  const [removing, setRemoving] = useState(false);

  // A failed load shows an empty list, as in the reference; only actions toast.
  const load = useCallback(() => accountsService.list()
    .then((list) => {
      setAccounts(list);
      setNow(Date.now());
    })
    .catch(() => setAccounts([]))
    .finally(() => setLoading(false)), []);

  // Refetch when the dealer comes back to the tab (e.g. after connecting in another window).
  useEffect(() => {
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const refresh = () => {
    setLoading(true);
    void load();
  };

  const onAction = (entry: CatalogueEntry, action: CardAction) => {
    if (action.kind === 'notify') {
      trackEvent('platform.notify_requested', { platform: entry.id });
      addToast({ type: 'success', ...notifyToast(entry.label) });
      return;
    }
    setBusyCard(entry.id);
    if (action.kind === 'detect') {
      accountsService.syncInstagram()
        .then((res) => {
          addToast({ type: 'success', ...syncInstagramToast(res.accountName) });
          return load();
        })
        .catch((err: unknown) => addToast({
          type: 'error',
          title: 'No Instagram found',
          message: err instanceof ApiError && err.message ? err.message : 'Could not detect Instagram.',
        }))
        .finally(() => setBusyCard(null));
      return;
    }
    if (!action.platform) {
      setBusyCard(null);
      return;
    }
    // Leaves for the provider's consent screen; /oauth/callback brings the dealer back here.
    startConnect(action.platform, '/accounts').catch((err: unknown) => {
      setBusyCard(null);
      const fallback = entry.id === 'youtube' ? 'Could not start YouTube connection' : 'Could not start OAuth. Check API configuration.';
      addToast({ type: 'error', title: 'Connection failed', message: err instanceof ApiError && err.message ? err.message : fallback });
    });
  };

  const disconnect = () => {
    const target = confirm;
    if (!target) return;
    setRemoving(true);
    accountsService.remove(target.id)
      .then(() => {
        setAccounts((list) => list.filter((a) => a.id !== target.id));
        setConfirm(null);
        addToast({ type: 'success', title: 'Disconnected', message: 'Account removed successfully.' });
      })
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Could not remove account. Please try again.' }))
      .finally(() => setRemoving(false));
  };

  return (
    <PageCard className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Accounts &amp; integrations</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Connect your social platforms to publish, schedule and engage.</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <StatPill value={accounts.length} label="Connected" />
            <StatPill value={LIVE_CHANNELS} label="Live channels" />
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh"
          title="Refresh"
          className="p-2 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      <section>
        <h2 className="text-base font-semibold text-zinc-900">Social Platforms</h2>
        <p className="text-sm text-zinc-500 mt-0.5 mb-4">Live connectors are ready to use; upcoming channels show the product roadmap.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {CATALOGUE.map((entry) => (
            <PlatformCard
              key={entry.id}
              entry={entry}
              accounts={accounts}
              now={now}
              busy={busyCard === entry.id}
              onAction={onAction}
              onDisconnect={setConfirm}
            />
          ))}
        </div>
      </section>

      <AccountLibrary
        accounts={accounts}
        loading={loading}
        now={now}
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        onRefresh={refresh}
        onDisconnect={setConfirm}
      />

      <DisconnectModal account={confirm} busy={removing} onClose={() => setConfirm(null)} onConfirm={disconnect} />
    </PageCard>
  );
}
