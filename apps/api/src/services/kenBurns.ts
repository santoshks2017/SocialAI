import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface KenBurnsOptions {
  imagePaths: string[];
  outputPath: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps?: number;
  transitionSeconds?: number;
}

const SIZES: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};

export function reelDimensions(aspect: string): { width: number; height: number } {
  return SIZES[aspect] ?? { width: 1080, height: 1920 };
}

const round = (n: number, digits = 3) => Number(n.toFixed(digits));

// ffmpeg arguments for a slow pan/zoom over each still, crossfaded, with a silent AAC track
// (some players and platforms expect an audio stream).
export function buildKenBurnsArgs(o: KenBurnsOptions): string[] {
  const n = o.imagePaths.length;
  if (n === 0) throw new Error('Ken Burns needs at least one image');
  const fps = o.fps ?? 30;
  const fade = n > 1 ? o.transitionSeconds ?? 0.6 : 0;
  const clipSeconds = (o.durationSeconds + (n - 1) * fade) / n;
  const frames = Math.round(clipSeconds * fps);
  const maxZoom = 1.15;
  const step = round((maxZoom - 1) / frames, 6);
  const { width: W, height: H } = o;

  const clips = o.imagePaths.map((_, i) => {
    // Alternate a slow push-in with a slow pull-out so consecutive shots don't feel identical.
    const zoom = i % 2 === 0 ? `min(zoom+${step},${maxZoom})` : `if(eq(on,0),${maxZoom},max(zoom-${step},1))`;
    return `[${i}:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},`
      + `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${fps},setsar=1,format=yuv420p[v${i}]`;
  });

  const fades: string[] = [];
  let previous = 'v0';
  for (let i = 1; i < n; i++) {
    const label = i === n - 1 ? 'vout' : `x${i}`;
    fades.push(`[${previous}][v${i}]xfade=transition=fade:duration=${fade}:offset=${round(i * (clipSeconds - fade))}[${label}]`);
    previous = label;
  }

  return [
    '-y',
    ...o.imagePaths.flatMap((p) => ['-i', p]),
    '-f', 'lavfi', '-t', String(o.durationSeconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', [...clips, ...fades].join(';'),
    '-map', `[${n === 1 ? 'v0' : 'vout'}]`, '-map', `${n}:a`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '128k',
    '-t', String(o.durationSeconds), '-movflags', '+faststart',
    o.outputPath,
  ];
}

export async function renderKenBurns(o: KenBurnsOptions): Promise<void> {
  await execFileAsync('ffmpeg', buildKenBurnsArgs(o), { timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
}

export async function extractThumbnail(videoPath: string, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', ['-y', '-ss', '0.5', '-i', videoPath, '-frames:v', '1', '-q:v', '3', outputPath], { timeout: 30_000 });
}
