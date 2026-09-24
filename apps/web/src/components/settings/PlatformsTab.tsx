import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, Plug, RefreshCw, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { useToast } from '../ui/Toast';
import { DisconnectModal } from '../accounts/DisconnectModal';
import { accountsService } from '../../services/accounts';
import { startConnect } from '../../utils/connectPlatform';
import { accountLine, connectedPlatformCount, platformRows, type PlatformAccount, type PlatformRow, type RowStatus } from '../../utils/settingsPlatforms';
import { SectionHeader, SettingsCard, SettingsListCard, StatPill } from './SettingsParts';

const STATUS: Record<RowStatus, { label: string; className: string; dot: string }> = {
  connected: { label: 'Connected', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  expired: { label: 'Token expired', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-500' },
  disconnected: { label: 'Not connected', className: 'bg-zinc-100 text-zinc-500', dot: 'bg-zinc-400' },
};

function StatusPill({ status }: { status: RowStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', s.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
      <div className="w-10 h-10 rounded-xl bg-zinc-100 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2.5 w-24 rounded bg-zinc-100 animate-pulse" />
      </div>
    </div>
  );
}

export function PlatformsTab() {
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [reloadKey, setReloadKey] = useState(0);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PlatformAccount | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Live Meta token checks (no verify=0), so an expired token shows the banner below.
  useEffect(() => {
    let cancelled = false;
    accountsService.list()
      .then((list) => {
        if (cancelled) return;
        setAccounts(list);
        setNow(new Date());
      })
      .catch(() => { if (!cancelled) setAccounts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Coming back from Meta Business Suite or another tab: show what changed.
  useEffect(() => {
    const onFocus = () => setReloadKey((k) => k + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const rows = platformRows(accounts, now);

  const connect = async (row: PlatformRow) => {
    setConnecting(row.id);
    try {
      // A full-page redirect; OAuthCallbackPage brings the dealer back to this tab.
      await startConnect(row.connect, '/settings?tab=platforms');
    } catch (err) {
      setConnecting(null);
      addToast({ type: 'error', title: 'Connection failed', message: err instanceof Error && err.message ? err.message : 'Could not start connection' });
    }
  };

  const disconnect = async () => {
    if (!removing) return;
    setDisconnecting(true);
    try {
      await accountsService.remove(removing.id);
      setAccounts((prev) => prev.filter((a) => a.id !== removing.id));
      setRemoving(null);
      addToast({ type: 'success', title: 'Disconnected', message: 'Account removed successfully.' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not remove account. Please try again.' });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SectionHeader
          level={2}
          className="mb-0"
          icon={<Plug className="w-4 h-4" />}
          title="Connected platforms"
          description="Connect your accounts so the platform can publish posts and manage your inbox on your behalf."
          action={(
            <div className="flex items-center gap-3">
              <StatPill value={connectedPlatformCount(rows)} label={`of ${rows.length} connected`} />
              <Link to="/accounts" className="text-xs font-semibold text-orange-600 hover:text-orange-700">Manage all accounts</Link>
            </div>
          )}
        />
      </SettingsCard>

      <SettingsListCard>
        {loading
          ? [0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)
          : rows.map((row) => (
            <div key={row.id} className="px-4 sm:px-5 py-3.5 transition-colors hover:bg-zinc-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center flex-shrink-0">
                  <PlatformIcon platform={row.icon} size="lg" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-zinc-900 text-sm">{row.label}</p>
                    <StatusPill status={row.status} />
                  </div>
                  {row.accounts.length === 0 ? (
                    <p className="text-xs text-zinc-500 mt-0.5">Not connected</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {row.accounts.map((a) => (
                        <li key={a.id} className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <span className="truncate">{accountLine(a)}</span>
                          <button
                            type="button"
                            onClick={() => setRemoving(a)}
                            aria-label={`Disconnect ${a.accountName}`}
                            title="Disconnect account"
                            className="grid place-items-center w-6 h-6 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {row.status === 'connected' ? (
                    <button
                      type="button"
                      onClick={() => void connect(row)}
                      disabled={connecting !== null}
                      title="Refresh connection"
                      aria-label={`Refresh the ${row.label} connection`}
                      className="grid place-items-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={cn('w-4 h-4', connecting === row.id && 'animate-spin')} />
                    </button>
                  ) : (
                    <Button variant={row.status === 'expired' ? 'secondary' : 'primary'} onClick={() => void connect(row)} disabled={connecting !== null}>
                      {row.status === 'expired' && <CircleAlert className="w-4 h-4 text-amber-600" />}
                      {row.status === 'expired' ? 'Reconnect' : 'Connect'}
                    </Button>
                  )}
                </div>
              </div>
              {row.status === 'expired' && (
                <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-2.5">
                  <CircleAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">Your access token has expired. Reconnect to continue publishing and managing your inbox for this platform.</p>
                </div>
              )}
            </div>
          ))}
      </SettingsListCard>

      <p className="text-center text-xs text-zinc-400">More integrations coming soon — WhatsApp Business, LinkedIn</p>

      <DisconnectModal
        account={removing}
        busy={disconnecting}
        onClose={() => setRemoving(null)}
        onConfirm={() => void disconnect()}
      />
    </div>
  );
}
