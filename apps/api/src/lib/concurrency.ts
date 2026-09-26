/** Runs `fn` over `items` with at most `limit` calls in flight, returning the results in the order of `items`. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let index = next++; index < items.length; index = next++) results[index] = await fn(items[index] as T, index);
  });
  await Promise.all(workers);
  return results;
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
export async function forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  await mapWithConcurrency(items, limit, (item) => fn(item));
}
