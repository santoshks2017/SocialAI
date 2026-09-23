// Labels match the reference app's banner.
const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  gmb: 'Google Business Profile',
  google: 'Google',
  youtube: 'YouTube',
};

export function disconnectedPlatformNames(platforms: Array<{ platform: string; needs_reconnect?: boolean }>): string[] {
  const names: string[] = [];
  for (const p of platforms) {
    if (!p.needs_reconnect) continue;
    const name = PLATFORM_NAMES[p.platform] ?? p.platform;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export function disconnectedVerb(count: number): 'is' | 'are' {
  return count === 1 ? 'is' : 'are';
}
