import { AlertTriangle, CheckCircle2, Clock, LoaderCircle, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { PlatformGlyph, StatusPill, TokenPill } from './AccountPills';
import {
  INSTAGRAM_NEEDS_FACEBOOK, accountsFor, cardAction, needsFacebookFirst, tokenHealth,
  type CardAction, type CatalogueEntry, type ConnectedAccount, type TokenHealth,
} from '../../utils/accounts';

interface PlatformCardProps {
  entry: CatalogueEntry;
  /** Every connected account; the card picks its platform's own. */
  accounts: ConnectedAccount[];
  now: number;
  busy: boolean;
  onAction: (entry: CatalogueEntry, action: CardAction) => void;
  onDisconnect: (account: ConnectedAccount) => void;
}

const ROW_TINT: Record<TokenHealth, string> = {
  expired: 'bg-red-50/60 border-red-200',
  warn: 'bg-amber-50/60 border-amber-200',
  ok: 'bg-emerald-50/60 border-emerald-200',
};

function AccountRow({ account, health, onDisconnect }: { account: ConnectedAccount; health: TokenHealth; onDisconnect: (account: ConnectedAccount) => void }) {
  const Icon = health === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 border transition-colors', ROW_TINT[health])}>
      <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', health === 'ok' ? 'text-emerald-600' : health === 'warn' ? 'text-amber-600' : 'text-red-600')} />
      <span className="text-xs font-medium text-zinc-800 truncate flex-1 min-w-0">{account.accountName}</span>
      <TokenPill health={health} />
      <button
        type="button"
        onClick={() => onDisconnect(account)}
        aria-label={`Disconnect ${account.accountName}`}
        title="Disconnect account"
        className="p-1 rounded-md text-zinc-400 hover:text-red-600 hover:bg-white transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function PlatformCard({ entry, accounts, now, busy, onAction, onDisconnect }: PlatformCardProps) {
  const mine = accountsFor(accounts, entry.id);
  const action = cardAction(entry, accounts);
  const planned = entry.status === 'planned';
  const connected = mine.length > 0;

  return (
    <div
      className={cn(
        'relative bg-white rounded-xl border shadow-sm transition-all duration-200 overflow-hidden',
        connected ? 'border-emerald-300 hover:border-emerald-400 hover:shadow-md'
          : planned ? 'border-zinc-200/80'
            : 'border-zinc-200/80 hover:border-zinc-300 hover:shadow-md',
      )}
    >
      {planned && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-400">
          <Clock className="w-3 h-3" /> Coming soon
        </span>
      )}
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${entry.color}18`, color: entry.color }}>
            <PlatformGlyph platform={entry.id} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn('flex items-center gap-2 flex-wrap', planned && 'pr-20')}>
              <h3 className="text-sm font-semibold text-zinc-900">{entry.label}</h3>
              <StatusPill status={entry.status} />
            </div>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{entry.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {entry.capabilities.map((capability) => (
            <span key={capability} className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">{capability}</span>
          ))}
        </div>

        {connected && (
          <div className="mt-3 space-y-1.5">
            {mine.map((account) => (
              <AccountRow key={account.id} account={account} health={tokenHealth(account.tokenExpiry, account.platform, now)} onDisconnect={onDisconnect} />
            ))}
          </div>
        )}

        {needsFacebookFirst(entry, accounts) && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-amber-700 leading-relaxed">{INSTAGRAM_NEEDS_FACEBOOK}</p>
          </div>
        )}

        <div className="mt-auto pt-4">
          <Button
            variant={action.kind === 'connect' ? 'primary' : 'secondary'}
            className="w-full"
            disabled={busy}
            onClick={() => onAction(entry, action)}
          >
            {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
            {action.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
