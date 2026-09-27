// Čisté pomocné funkce pro grafy (Oscilloscope, AgePyramid).
import type { IndicatorDef } from '../types.ts';

/** Vodorovný ASCII pruh z bloků █ + zlomkový znak ▓▒░. */
export function asciiBar(v: number, max: number, width: number): string {
  if (!Number.isFinite(v) || !Number.isFinite(max) || max <= 0 || v <= 0) return '';
  const cells = Math.min(width, (v / max) * width);
  const full = Math.floor(cells);
  const frac = cells - full;
  let tail = '';
  if (full < width) {
    if (frac >= 0.75) tail = '▓';
    else if (frac >= 0.5) tail = '▒';
    else if (frac >= 0.25) tail = '░';
  }
  return '█'.repeat(full) + tail;
}

/** Věkové skupiny: ukazatele `podil_<od>[_<do>]` (např. podil_0_14, podil_65), od nejstarší. */
export function ageGroups(indicators: Record<string, IndicatorDef>): IndicatorDef[] {
  return Object.values(indicators)
    .map((def) => ({ def, m: /^podil_(\d+)(?:_(\d+))?$/.exec(def.id) }))
    .filter((x): x is { def: IndicatorDef; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => Number(b.m[1]) - Number(a.m[1]))
    .map((x) => x.def);
}

/** Souvislé úseky řady (dělené null) jako body [x,y] v obdélníku w×h (y dolů). */
export function seriesPoints(
  series: Record<number, number | null>,
  xDomain: [number, number],
  yDomain: [number, number],
  w: number,
  h: number,
): [number, number][][] {
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const sx = (y: number) => (x1 === x0 ? w / 2 : ((y - x0) / (x1 - x0)) * w);
  const sy = (v: number) => (y1 === y0 ? h / 2 : h - ((v - y0) / (y1 - y0)) * h);
  const years = Object.keys(series)
    .map(Number)
    .sort((a, b) => a - b);
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (const y of years) {
    const v = series[y];
    if (typeof v === 'number' && Number.isFinite(v)) cur.push([sx(y), sy(v)]);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}
