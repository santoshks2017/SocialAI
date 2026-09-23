import { useEffect, useState } from 'react';

const DESKTOP_QUERY = '(min-width: 1024px)'; // Tailwind's `lg` breakpoint

// Tracks whether the viewport is at or above the `lg` breakpoint, so callers can
// mount a desktop-only or mobile-only variant of a component instead of both at once.
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(DESKTOP_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
