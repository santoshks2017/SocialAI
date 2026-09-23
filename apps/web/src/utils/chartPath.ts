export type Point = [number, number];

/** Smooth SVG path through the points: Catmull-Rom converted to cubic Béziers (tension 1/6). */
export function smoothPath(points: Point[]): string {
  const first = points[0];
  if (!first) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(first[0])},${f(first[1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)}`
      + ` ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)}`
      + ` ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** Y gridline values: steps of 1, 2 or 5 for small maxima, otherwise about four lines. */
export function yTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 8 ? 2 : max <= 20 ? 5 : Math.ceil(max / 4);
  const ticks: number[] = [];
  for (let t = step; t <= max; t += step) ticks.push(t);
  return ticks.length ? ticks : [max];
}

/** Label every nth day so x-axis labels stay about 60px apart. */
export function labelStride(count: number, width: number): number {
  return Math.max(1, Math.ceil(count / Math.max(3, Math.floor(width / 60))));
}
