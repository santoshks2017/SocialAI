import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ACTIVITY_STATUSES, type ActivityBucket, type ActivityStatus } from '../../utils/dashboard';
import { labelStride, smoothPath, yTicks, type Point } from '../../utils/chartPath';

const HEIGHT = 180;
const PAD_L = 28;
const TOP = 18;
const PLOT_H = 136;
const BASE = TOP + PLOT_H;

// --color-orange-* are defined in index.css (brand remap), so they always exist at runtime.
const SERIES: Record<ActivityStatus, { color: string; label: string }> = {
  published: { color: 'var(--color-orange-600)', label: 'Published' },
  scheduled: { color: 'var(--color-orange-400)', label: 'Scheduled' },
  approved: { color: '#14b8a6', label: 'Ready' },
  pending_approval: { color: '#fcd34d', label: 'Pending approval' },
  draft: { color: '#a1a1aa', label: 'Draft' },
  failed: { color: '#ef4444', label: 'Failed' },
};

// Stacked area chart of posts created per day, coloured by status, with a hover tooltip.
export function ActivityChart({ buckets }: { buckets: ActivityBucket[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = buckets.length;
  const plotW = width - PAD_L;
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => TOP + (1 - v / max) * PLOT_H;
  const active = ACTIVITY_STATUSES.filter((s) => buckets.some((b) => b.byStatus[s] > 0));

  // Each status is a band between the running total below it and the running total including it.
  const areas = active.reduce<{ lower: number[]; paths: Array<{ status: ActivityStatus; d: string }> }>(
    (acc, status) => {
      const upper = acc.lower.map((v, i) => v + (buckets[i]?.byStatus[status] ?? 0));
      const top = upper.map((v, i): Point => [x(i), y(v)]);
      const bottom = acc.lower.map((v, i): Point => [x(i), y(v)]).reverse();
      return { lower: upper, paths: [...acc.paths, { status, d: `${smoothPath(top)} ${smoothPath(bottom).replace(/^M/, 'L')} Z` }] };
    },
    { lower: buckets.map(() => 0), paths: [] },
  ).paths;
  const outline = smoothPath(buckets.map((b, i): Point => [x(i), y(b.total)]));
  const stride = labelStride(n, width);
  const hovered = hover !== null ? buckets[hover] : undefined;

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    if (svgX < PAD_L) {
      setHover(null);
      return;
    }
    setHover(Math.min(n - 1, Math.max(0, Math.round(((svgX - PAD_L) / plotW) * (n - 1)))));
  };

  return (
    <div>
      <div ref={wrapRef} className="relative">
        <svg ref={svgRef} viewBox={`0 0 ${width} ${HEIGHT}`} className="w-full h-[180px]" role="img" aria-label="Posts created per day">
          <defs>
            <clipPath id="activity-plot-clip">
              <rect x={PAD_L} y={TOP} width={plotW} height={PLOT_H} />
            </clipPath>
          </defs>
          {yTicks(max).map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={width} y1={y(t)} y2={y(t)} stroke="#e4e4e7" strokeDasharray="2 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={22} y={y(t) + 3} textAnchor="end" className="fill-zinc-300" style={{ fontSize: 10, fontWeight: 500 }}>{t}</text>
            </g>
          ))}
          <line x1={PAD_L} y1={BASE} x2={width} y2={BASE} stroke="#d4d4d8" strokeWidth={1} />
          <g clipPath="url(#activity-plot-clip)">
            {areas.map((a) => <path key={a.status} d={a.d} fill={SERIES[a.status].color} fillOpacity={0.88} />)}
            <path d={outline} fill="none" stroke="#27272a" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          </g>
          {buckets.map((b, i) => (i % stride === 0 || i === n - 1) && (
            <text
              key={b.key}
              x={x(i)}
              y={174}
              textAnchor={i === n - 1 ? 'end' : 'middle'}
              style={{ fontSize: 10, fontWeight: 500 }}
              className={hover === i ? 'fill-zinc-800' : b.date.getDay() === 1 ? 'fill-zinc-500' : 'fill-zinc-400'}
            >
              {b.label}
            </text>
          ))}
          {hovered && hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={BASE} stroke="var(--color-orange-600)" strokeOpacity={0.25} strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(hovered.total)} r={4.5} fill="#27272a" stroke="#fff" strokeWidth={2} />
            </>
          )}
          <rect x={PAD_L} y={0} width={plotW} height={HEIGHT} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {hovered && hover !== null && (
          <ChartTooltip bucket={hovered} left={(x(hover) / width) * 100} top={(y(hovered.total) / HEIGHT) * 100} />
        )}
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-zinc-100">
          {active.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="w-3 h-[2px] rounded-full" style={{ background: SERIES[s].color }} />
              {SERIES[s].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ bucket, left, top }: { bucket: ActivityBucket; left: number; top: number }) {
  const transform = left < 22
    ? 'translate(8px, -100%)'
    : left > 78
      ? 'translate(calc(-100% - 8px), -100%)'
      : 'translate(-50%, calc(-100% - 8px))';
  return (
    <div
      className="absolute z-10 bg-zinc-900 text-white rounded-lg shadow-lg px-3 py-2 text-xs pointer-events-none whitespace-nowrap"
      style={{ left: `${left}%`, top: `${top}%`, transform, minWidth: 152 }}
    >
      <p className="font-semibold mb-0.5">{bucket.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
      <p className="text-zinc-300 mb-1.5 text-[11px]">{bucket.total} {bucket.total === 1 ? 'post' : 'posts'} total</p>
      {bucket.total === 0 ? (
        <p className="text-[11px] text-zinc-400">No posts</p>
      ) : (
        ACTIVITY_STATUSES.filter((s) => bucket.byStatus[s] > 0).map((s) => (
          <div key={s} className="flex items-center justify-between gap-4 text-[11px] leading-relaxed">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: SERIES[s].color }} />
              {SERIES[s].label}
            </span>
            <span className="font-semibold">{bucket.byStatus[s]}</span>
          </div>
        ))
      )}
    </div>
  );
}
