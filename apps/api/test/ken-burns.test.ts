import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildKenBurnsArgs, extractThumbnail, reelDimensions, renderKenBurns } from '../src/services/kenBurns.js';
import { compositeOverlayArgs } from '../src/services/geminiVideo.js';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

const graphOf = (args: string[]) => args[args.indexOf('-filter_complex') + 1]!;
const mapsOf = (args: string[]) => { const i = args.indexOf('-map'); return args.slice(i, i + 4); };

describe('compositeOverlayArgs', () => {
  it('re-encodes the overlaid reel with faststart and yuv420p so Instagram accepts it', () => {
    const args = compositeOverlayArgs('clean.mp4', 'final.mp4', "drawtext=text='OFFER'");
    const pair = (flag: string) => args.slice(args.indexOf(flag), args.indexOf(flag) + 2);
    assert.deepEqual(args.slice(0, 5), ['-y', '-i', 'clean.mp4', '-vf', "drawtext=text='OFFER'"]);
    assert.deepEqual(pair('-c:v'), ['-c:v', 'libx264']);
    assert.deepEqual(pair('-preset'), ['-preset', 'fast']);
    assert.deepEqual(pair('-crf'), ['-crf', '22']);
    assert.deepEqual(pair('-pix_fmt'), ['-pix_fmt', 'yuv420p']);
    assert.deepEqual(pair('-movflags'), ['-movflags', '+faststart']);
    assert.deepEqual(pair('-c:a'), ['-c:a', 'copy']);
    assert.equal(args.at(-1), 'final.mp4');
  });
});

describe('buildKenBurnsArgs', () => {
  it('pans and zooms each image and crossfades between them', () => {
    const args = buildKenBurnsArgs({ imagePaths: ['a.jpg', 'b.jpg', 'c.jpg'], outputPath: 'out.mp4', width: 1080, height: 1920, durationSeconds: 15 });
    const graph = graphOf(args);
    assert.equal((graph.match(/zoompan=/g) ?? []).length, 3);
    assert.match(graph, /d=162:s=1080x1920:fps=30/);
    assert.match(graph, /xfade=transition=fade:duration=0\.6:offset=4\.8\[x1\]/);
    assert.match(graph, /xfade=transition=fade:duration=0\.6:offset=9\.6\[vout\]/);
    assert.deepEqual(mapsOf(args), ['-map', '[vout]', '-map', '3:a']);
    const pixFmtIdx = args.indexOf('-pix_fmt');
    assert.ok(pixFmtIdx > 0, 'should have -pix_fmt');
    assert.equal(args[pixFmtIdx + 1], 'yuv420p');
    assert.equal(args[args.indexOf('-t', args.indexOf('-filter_complex')) + 1], '15');
    assert.equal(args.at(-1), 'out.mp4');
  });

  it('uses a single clip without crossfades for one image', () => {
    const args = buildKenBurnsArgs({ imagePaths: ['a.jpg'], outputPath: 'o.mp4', width: 1080, height: 1080, durationSeconds: 10 });
    assert.doesNotMatch(graphOf(args), /xfade/);
    assert.deepEqual(mapsOf(args), ['-map', '[v0]', '-map', '1:a']);
    const pixFmtIdx = args.indexOf('-pix_fmt');
    assert.ok(pixFmtIdx > 0, 'should have -pix_fmt');
    assert.equal(args[pixFmtIdx + 1], 'yuv420p');
  });

  it('knows the reel sizes', () => {
    assert.deepEqual(reelDimensions('9:16'), { width: 1080, height: 1920 });
    assert.deepEqual(reelDimensions('1:1'), { width: 1080, height: 1080 });
    assert.deepEqual(reelDimensions('16:9'), { width: 1920, height: 1080 });
    assert.deepEqual(reelDimensions('4:5'), { width: 1080, height: 1920 });
  });
});

describe('renderKenBurns with ffmpeg', { skip: !hasFfmpeg }, () => {
  it('renders a video of the requested size and length, and a thumbnail', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
    try {
      const a = path.join(dir, 'a.png');
      const b = path.join(dir, 'b.png');
      await sharp({ create: { width: 320, height: 240, channels: 3, background: '#c2564f' } }).png().toFile(a);
      await sharp({ create: { width: 320, height: 240, channels: 3, background: '#3c7d58' } }).png().toFile(b);
      const out = path.join(dir, 'out.mp4');

      await renderKenBurns({ imagePaths: [a, b], outputPath: out, width: 180, height: 320, durationSeconds: 2, fps: 10 });

      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt:format=duration', '-of', 'json', out]).toString()) as { streams: Array<{ width: number; height: number; pix_fmt: string }>; format: { duration: string } };
      assert.deepEqual([probe.streams[0]!.width, probe.streams[0]!.height], [180, 320]);
      assert.equal(probe.streams[0]!.pix_fmt, 'yuv420p', 'video should be rendered in yuv420p');
      assert.ok(Math.abs(Number(probe.format.duration) - 2) < 0.35, `duration ${probe.format.duration}`);
      const thumb = path.join(dir, 'thumb.jpg');
      await extractThumbnail(out, thumb);
      assert.ok(statSync(thumb).size > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
