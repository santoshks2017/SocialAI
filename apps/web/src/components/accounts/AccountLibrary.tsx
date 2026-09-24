import type { ReactNode } from 'react';
import { ChevronDown, Filter, Link2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { ActivePill, PlatformGlyph, TokenPill } from './AccountPills';
import {
  FILTER_OPTIONS, SEARCH_PLACEHOLDER, accountPlatformName, connectedDate, filterAccounts, libraryCountText, shortAccountId, tokenHealth,
  type ConnectedAccount, type PlatformFilter,
} from '../../utils/accounts';

interface AccountLibraryProps {
  accounts: ConnectedAccount[];
  loading: boolean;
  now: number;
  query: string;
  onQuery: (query: string) => void;
  filter: PlatformFilter;
  onFilter: (filter: PlatformFilter) => void;
  onRefresh: () => void;
  onDisconnect: (account: ConnectedAccount) => void;
}

const FIELD = 'h-8 rounded-lg border border-zinc-200 bg-white pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30 transition-colors';
const HEADERS = ['Platform', 'Account', 'Account ID', 'Connected', 'Status', ''];

function SkeletonRows() {
  return (
    <div className="divide-y divide-zinc-100">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-zinc-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 rounded bg-zinc-100" />
            <div className="h-2.5 w-24 rounded bg-zinc-100" />
          </div>
          <div className="h-6 w-16 rounded-full bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-12 px-4 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-zinc-100 flex items-center justify-center mb-3">
        <Link2 className="w-5 h-5 text-zinc-400" />
      </div>
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <p className="text-xs text-zinc-500 mt-1">{text}</p>
    </div>
  );
}

export function AccountLibrary({ accounts, loading, now, query, onQuery, filter, onFilter, onRefresh, onDisconnect }: AccountLibraryProps) {
  const shown = filterAccounts(accounts, query, filter);

  let body: ReactNode;
  if (loading && accounts.length === 0) body = <SkeletonRows />;
  else if (accounts.length === 0) body = <Empty title="No accounts connected yet" text="Connect Facebook or Google Business above to start publishing from Social AI." />;
  else if (shown.length === 0) body = <Empty title="No accounts match this filter" text="Clear the search or switch back to all platforms." />;
  else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50/80 border-b border-zinc-100 text-left">
              {HEADERS.map((header, i) => (
                <th key={i} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {shown.map((account) => {
              const health = tokenHealth(account.tokenExpiry, account.platform, now);
              return (
                <tr key={account.id} className="group hover:bg-zinc-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 whitespace-nowrap">
                      <PlatformGlyph platform={account.platform} size="sm" />
                      {accountPlatformName(account.platform)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-medium text-zinc-900">{account.accountName}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-zinc-500" title={account.accountId}>{shortAccountId(account.accountId)}</td>
                  <td className="px-5 py-3.5 text-xs text-zinc-500 whitespace-nowrap">{connectedDate(account.createdAt)}</td>
                  <td className="px-5 py-3.5">{health === 'ok' ? <ActivePill /> : <TokenPill health={health} />}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => onDisconnect(account)}
                      aria-label={`Disconnect ${account.accountName}`}
                      title="Disconnect account"
                      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Disconnect</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Connected Account Library</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{libraryCountText(accounts.length)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={SEARCH_PLACEHOLDER}
              aria-label="Search accounts"
              className={cn(FIELD, 'w-full pr-3')}
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <select
              value={filter}
              onChange={(e) => onFilter(e.target.value as PlatformFilter)}
              aria-label="Filter by platform"
              className={cn(FIELD, 'appearance-none pr-8')}
            >
              {FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          </div>
          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={onRefresh}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 overflow-hidden">{body}</div>
    </section>
  );
}
