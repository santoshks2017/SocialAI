import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === 'generated') return [];
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('API keys stay out of URLs', () => {
  it('no source file builds a URL with a key query parameter', () => {
    const offenders = files(SRC)
      .filter((f) => /[?&]key=\$\{|[?&]key=['"]\s*\+/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    assert.deepEqual(offenders, []);
  });
});
