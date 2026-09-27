// Navigace šipkami: nejbližší soused podle centroidu v kuželu ±45° kolem směru.
// Souřadnice jsou obrazovkové (y roste dolů).
import type { AreaCode } from '../types.ts';

export type Direction = 'up' | 'down' | 'left' | 'right';

const DIRS: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export function neighborInDirection(
  centroids: Record<AreaCode, [number, number]>,
  from: AreaCode,
  dir: Direction,
): AreaCode | null {
  const origin = centroids[from];
  if (!origin) return null;
  const [ux, uy] = DIRS[dir];
  const cos45 = Math.SQRT1_2;
  let best: AreaCode | null = null;
  let bestDist = Infinity;
  for (const [code, [x, y]] of Object.entries(centroids)) {
    if (code === from) continue;
    const dx = x - origin[0];
    const dy = y - origin[1];
    const dist = Math.hypot(dx, dy);
    if (!(dist > 0) || !Number.isFinite(dist)) continue;
    const cos = (dx * ux + dy * uy) / dist;
    if (cos + 1e-9 < cos45) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = code;
    }
  }
  return best;
}
