import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '../ui/Button';
import {
  engagementRate, formatPercent, platformAbbrev, platformName, PLATFORM_PILLS, POST_SORTS, shortDate, sortPosts, topPlatform,
  type AnalyticsPlatform, type PerformanceBag, type PostMetric, type PostPerformance, type PostSort,
} from '../../utils/analytics';
import { MetricRow, PlatformIconRow, SectionShell, StatTile } from './AnalyticsParts';

const DOTS: Record<AnalyticsPlatform, string> = { facebook: 'bg-[#1877F2]', instagram: 'bg-pink-500', gmb: 'bg-[#4285F4]', youtube: 'bg-[#FF0000]' };
const INBOX_TRACKED_TITLE = 'Counts the comments, DMs and reviews our inbox sync linked to these posts. It can differ from Meta’s own comment count.';

function PlatformBreakdownInline({ byPlatform, highlight }: { byPlatform: PostPerformance['byPlatform']; highlight: 'all' | AnalyticsPlatform }) {
  const rows = (Object.entries(byPlatform) as Array<[AnalyticsPlatform, PerformanceBag | undefined]>).filter(([, bag]) => (bag?.reach ?? 0) > 0);
  if (rows.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {rows.map(([p, bag]) => (
        <span key={p} className={cn('inline-flex items-center gap-1', highlight === p && 'font-semibold text-zinc-600')}>
          <span className={cn('w-1.5 h-1.5 rounded-full', DOTS[p])} />
          {platformAbbrev(p)} {(bag?.reach ?? 0).toLocaleString('en-IN')}
        </span>
      ))}
    </span>
  );
}

function PostRow({ post }: { post: PostMetric }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50/40 transition-colors">
      <div className="w-12 h-12 rounded-md bg-zinc-100 flex-shrink-0 overflow-hidden ring-1 ring-zinc-200">
        {post.thumbnail && <img src={post.thumbnail} alt="" className="w-full h-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900 truncate">{post.caption || 'Untitled post'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <PlatformIconRow platforms={post.platforms} />
          {post.publishedAt && <span className="text-[11px] text-zinc-400">{shortDate(post.publishedAt)}</span>}
        </div>
        <MetricRow metrics={post} />
      </div>
    </div>
  );
}

function TopPerformer({ post }: { post: PostMetric }) {
  return (
    <div className="relative flex items-center gap-3 p-3 rounded-lg border border-orange-200/70 bg-white shadow-sm mt-4 mb-4 overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />
      <div className="w-14 h-14 rounded-md bg-zinc-100 flex-shrink-0 overflow-hidden ring-1 ring-zinc-200 ml-1">
        {post.thumbnail
          ? <img src={post.thumbnail} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-orange-100 to-amber-50" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-orange-600 flex items-center gap-1">
          <Trophy className="w-3 h-3" />
          Top performer
        </p>
        <p className="text-sm font-medium text-zinc-900 truncate">{post.caption || 'Untitled post'}</p>
        <MetricRow metrics={post} />
      </div>
    </div>
  );
}

function PerformanceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] rounded-xl bg-zinc-50 animate-pulse" />)}
      </div>
      <div className="h-40 rounded-xl bg-zinc-50 animate-pulse" />
    </div>
  );
}

interface PerformanceBodyProps {
  perf: PostPerformance;
  platform: 'all' | AnalyticsPlatform;
  sort: PostSort;
  showAll: boolean;
  onSort: (sort: PostSort) => void;
  onShowAll: (showAll: boolean) => void;
}

function PerformanceBody({ perf, platform, sort, showAll, onSort, onShowAll }: PerformanceBodyProps) {
  const { totals, posts, byPlatform } = perf;
  const rate = engagementRate(totals.engagement, totals.reach);
  const top = topPlatform(byPlatform);
  const best = posts[0]; // the API sorts by reach
  const sorted = sortPosts(posts, sort);
  const shown = showAll ? sorted : sorted.slice(0, 6);
  const count = posts.length;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile accent label="Total reach" value={totals.reach.toLocaleString('en-IN')} sub={<PlatformBreakdownInline byPlatform={byPlatform} highlight={platform} />} />
        <StatTile
          label="Engagement"
          value={totals.engagement.toLocaleString('en-IN')}
          sub={
            <span className="flex flex-wrap gap-x-2">
              <span>{totals.likes} likes</span>
              <span>{totals.comments} comments</span>
              <span>{totals.shares} shares</span>
            </span>
          }
        />
        <StatTile
          label="Engagement rate"
          value={formatPercent(rate)}
          sub={rate === null ? 'Needs reach to compute' : `across ${count} post${count === 1 ? '' : 's'}`}
        />
        <StatTile label="Inbox tracked" value={totals.inboxMessages.toLocaleString('en-IN')} sub="comments + DMs + reviews" title={INBOX_TRACKED_TITLE} />
        <StatTile label="Top platform" value={top ? platformName(top.platform) : '—'} sub={top ? `${top.reach.toLocaleString('en-IN')} reach` : 'No reach yet'} />
      </div>

      {best && best.reach > 0 && <TopPerformer post={best} />}

      <div className="flex flex-wrap items-center justify-between gap-2 mt-5 mb-2">
        <p className="text-xs font-semibold text-zinc-700">All posts</p>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-zinc-400 mr-1">Sort by</span>
          {POST_SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={sort === s.id}
              onClick={() => onSort(s.id)}
              className={cn('px-2 py-0.5 rounded font-semibold transition-colors', sort === s.id ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {count === 0 ? (
        <p className="text-sm text-zinc-400 py-6 text-center">No published-post metrics in this period yet.</p>
      ) : (
        <div className="space-y-2">{shown.map((p) => <PostRow key={p.id} post={p} />)}</div>
      )}

      {count > 6 && (
        <button type="button" onClick={() => onShowAll(!showAll)} className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors">
          {showAll ? 'Show top 6 only' : `Show all ${count} posts`}
        </button>
      )}

      {platform === 'gmb' && (
        <p className="mt-3 text-[11px] text-zinc-400">
          Google Business Profile reports views ({totals.views.toLocaleString('en-IN')}) and clicks ({totals.clicks.toLocaleString('en-IN')}) rather than likes/shares.
        </p>
      )}
    </>
  );
}

interface PostPerformanceCardProps {
  perf: PostPerformance | null;
  platform: 'all' | AnalyticsPlatform;
  onPlatform: (platform: 'all' | AnalyticsPlatform) => void;
}

export function PostPerformanceCard({ perf, platform, onPlatform }: PostPerformanceCardProps) {
  const [sort, setSort] = useState<PostSort>('reach');
  const [showAll, setShowAll] = useState(false);
  return (
    <SectionShell
      title="Post Performance"
      subtitle="Reach & engagement for posts published in the selected period"
      action={
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              aria-pressed={platform === pill.id}
              onClick={() => onPlatform(pill.id)}
              className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors', platform === pill.id ? 'bg-zinc-900 text-white border-zinc-900' : 'text-zinc-600 border-zinc-200 hover:bg-zinc-50')}
            >
              {pill.label}
            </button>
          ))}
        </div>
      }
    >
      {perf === null
        ? <PerformanceSkeleton />
        : <PerformanceBody perf={perf} platform={platform} sort={sort} showAll={showAll} onSort={setSort} onShowAll={setShowAll} />}
    </SectionShell>
  );
}
