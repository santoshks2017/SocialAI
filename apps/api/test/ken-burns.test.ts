import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildKenBurnsArgs, extractThumbnail, reelDimensions, renderKenBurns } from '../src/services/kenBurns.js';
import { compositeOverlayArgs, normalizeVideo, overlayFilters, probeDurationSeconds, scaleVideoArgs } from '../src/services/geminiVideo.js';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

const graphOf = (args: string[]) => args[args.indexOf('-filter_complex') + 1]!;
const mapsOf = (args: string[]) => { const i = args.indexOf('-map'); return args.slice(i, i + 4); };

const FIT_9_16 = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1';

function assertReelEncode(args: string[], output: string) {
  const pair = (flag: string) => args.slice(args.indexOf(flag), args.indexOf(flag) + 2);
  assert.deepEqual(pair('-c:v'), ['-c:v', 'libx264']);
  assert.deepEqual(pair('-preset'), ['-preset', 'fast']);
  assert.deepEqual(pair('-crf'), ['-crf', '22']);
  assert.deepEqual(pair('-pix_fmt'), ['-pix_fmt', 'yuv420p']);
  assert.deepEqual(pair('-movflags'), ['-movflags', '+faststart']);
  assert.deepEqual(pair('-c:a'), ['-c:a', 'copy']);
  assert.equal(args.at(-1), output);
}

describe('compositeOverlayArgs', () => {
  it('re-encodes the overlaid reel at exactly 1080×1920 with faststart and yuv420p so Instagram accepts it', () => {
    const args = compositeOverlayArgs('clean.mp4', 'final.mp4', "drawtext=text='OFFER'", { width: 1080, height: 1920 });
    assert.deepEqual(args.slice(0, 5), ['-y', '-i', 'clean.mp4', '-vf', `${FIT_9_16},drawtext=text='OFFER'`]);
    assertReelEncode(args, 'final.mp4');
  });

  it('fits landscape reels to 1920×1080', () => {
    const args = compositeOverlayArgs('clean.mp4', 'final.mp4', 'drawtext=x', { width: 1920, height: 1080 });
    assert.match(args[4]!, /^scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:\(ow-iw\)\/2:\(oh-ih\)\/2,setsar=1,drawtext=x$/);
  });
});

describe('overlayFilters', () => {
  const beat = { id: 'b', startTime: 0, endTime: 3, badge: 'NEW', title: 'CRETA', subtitle: 'Book now', position: 'bottom' as const };
  const sizes = (filters: string[]) => filters.map((f) => [Number(/fontsize=(\d+)/.exec(f)?.[1]), Number(/boxborderw=(\d+)/.exec(f)?.[1])]);

  it('sizes text and boxes to the frame so it looks the same as the 720p tuning', () => {
    assert.deepEqual(sizes(overlayFilters([beat], { width: 720, height: 1280 }, 'font.ttf')), [[22, 7], [34, 10], [20, 6]]);
    assert.deepEqual(sizes(overlayFilters([beat], { width: 1080, height: 1920 }, 'font.ttf')), [[33, 11], [51, 15], [30, 9]]);
    assert.deepEqual(sizes(overlayFilters([beat], { width: 1920, height: 1080 }, 'font.ttf')), [[27, 11], [42, 15], [26, 9]]);
  });
});

describe('scaleVideoArgs', () => {
  it('only resizes when there is no text to burn in, with the same reel encode', () => {
    const args = scaleVideoArgs('clean.mp4', 'final.mp4', { width: 1080, height: 1920 });
    assert.deepEqual(args.slice(0, 5), ['-y', '-i', 'clean.mp4', '-vf', FIT_9_16]);
    assertReelEncode(args, 'final.mp4');
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

describe('normalizeVideo with ffmpeg', { skip: !hasFfmpeg }, () => {
  it('turns a small landscape clip into a 1080×1920 yuv420p reel and reads its length', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'fit-test-'));
    try {
      const src = path.join(dir, 'src.mp4');
      execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=10:duration=1', '-pix_fmt', 'yuv444p', src], { stdio: 'ignore' });
      const out = path.join(dir, 'out.mp4');
      assert.equal(await normalizeVideo(src, out, { width: 1080, height: 1920 }), true);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt,sample_aspect_ratio', '-of', 'json', out]).toString()) as { streams: Array<{ width: number; height: number; pix_fmt: string; sample_aspect_ratio?: string }> };
      assert.deepEqual([probe.streams[0]!.width, probe.streams[0]!.height, probe.streams[0]!.pix_fmt], [1080, 1920, 'yuv420p']);
      const seconds = await probeDurationSeconds(out);
      assert.ok(seconds !== null && Math.abs(seconds - 1) < 0.2, `duration ${seconds}`);
      assert.equal(await probeDurationSeconds(path.join(dir, 'missing.mp4')), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
