// Radarový zoom: interpolace SVG viewBoxu s ease-in-out.
export type ViewBox = [number, number, number, number];

export const ZOOM_MS = 600;

/** Kubický ease-in-out, t ∈ [0,1]. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function zoomViewBox(from: ViewBox, to: ViewBox, t: number): ViewBox {
  const e = easeInOut(t);
  return from.map((f, i) => f + (to[i] - f) * e) as ViewBox;
}

/** Má se animovat? Ne při `.crt-off` na <html> ani při prefers-reduced-motion. */
export function motionAllowed(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.classList.contains('crt-off')) return false;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  } catch {
    /* matchMedia nedostupné */
  }
  return true;
}
