import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../src');
// Removed by the video task (Task 3) once geminiVideo.ts uses header auth.
const TEMP_ALLOW = new Set(['services/geminiVideo.ts']);

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
      .filter((f) => !TEMP_ALLOW.has(path.relative(SRC, f).split(path.sep).join('/')))
      .filter((f) => /[?&]key=\$\{|[?&]key=['"]\s*\+/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    assert.deepEqual(offenders, []);
  });
});
