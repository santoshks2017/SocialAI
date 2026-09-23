const R = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;

// Donut of posts by status, starting at 12 o'clock and running clockwise.
export function PipelineDonut({ segments, total }: { segments: Array<{ key: string; color: string; value: number }>; total: number }) {
  const arcs = segments
    .filter((s) => s.value > 0)
    .reduce<Array<{ key: string; color: string; len: number; start: number }>>((list, s) => {
      const prev = list[list.length - 1];
      const start = prev ? prev.start + prev.len : 0;
      return [...list, { key: s.key, color: s.color, len: (s.value / total) * CIRCUMFERENCE, start }];
    }, []);

  return (
    <div className="relative w-[150px] h-[150px] flex-shrink-0">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90" role="img" aria-label="Posts by status">
        <circle cx={80} cy={80} r={R} fill="none" stroke="#f4f4f5" strokeWidth={20} />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={80}
            cy={80}
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={20}
            strokeDasharray={`${a.len.toFixed(2)} ${(CIRCUMFERENCE - a.len).toFixed(2)}`}
            strokeDashoffset={(-a.start).toFixed(2)}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tracking-tight text-zinc-900">{total}</span>
        <span className="text-[10px] font-medium text-zinc-400">total posts</span>
      </div>
    </div>
  );
}
