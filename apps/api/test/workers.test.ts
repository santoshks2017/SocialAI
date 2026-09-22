import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startWorkers } from '../src/workers/index.js';

function fakeLogger() {
  const lines: string[] = [];
  return { lines, info: (msg: string) => { lines.push(msg); } };
}

describe('startWorkers (workers/index.ts)', () => {
  it('skips the BullMQ workers and logs one info line when Redis is not configured', () => {
    const log = fakeLogger();
    let started = 0;

    const result = startWorkers(log, false, [() => started++, () => started++]);

    assert.equal(result, false);
    assert.equal(started, 0);
    assert.equal(log.lines.length, 1);
    assert.match(log.lines[0]!, /skipping BullMQ workers/);
  });

  it('defaults to skipping when REDIS_URL is unset (test env)', () => {
    const log = fakeLogger();

    assert.equal(startWorkers(log), false);
    assert.equal(log.lines.length, 1);
  });

  it('starts every worker when Redis is configured', () => {
    const log = fakeLogger();
    let started = 0;

    const result = startWorkers(log, true, [() => started++, () => started++]);

    assert.equal(result, true);
    assert.equal(started, 2);
    assert.equal(log.lines.length, 0);
  });
});
