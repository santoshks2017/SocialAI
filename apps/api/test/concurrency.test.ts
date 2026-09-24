import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { forEachLimited, mapWithConcurrency } from '../src/lib/concurrency.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('keeps results in input order with at most `limit` calls in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const results = await mapWithConcurrency([30, 5, 20, 1, 10, 15, 2], 3, async (ms, index) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(ms);
      inFlight--;
      return `${index}:${ms}`;
    });

    assert.deepEqual(results, ['0:30', '1:5', '2:20', '3:1', '4:10', '5:15', '6:2']);
    assert.equal(maxInFlight, 3);
  });

  it('handles an empty list and a limit above the item count', async () => {
    assert.deepEqual(await mapWithConcurrency([], 5, async () => 1), []);
    assert.deepEqual(await mapWithConcurrency([1, 2], 10, async (n) => n * 2), [2, 4]);
  });
});

describe('forEachLimited', () => {
  it('visits every item once within the limit', async () => {
    const seen: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    await forEachLimited([1, 2, 3, 4, 5, 6], 2, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(2);
      seen.push(n);
      inFlight--;
    });
    assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
    assert.equal(maxInFlight, 2);
  });
});
