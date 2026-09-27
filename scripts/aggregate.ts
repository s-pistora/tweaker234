// Obecné agregační funkce nad PointLayer – používá je Task 4 (datazapad) i další zdroje.
import type { AreaCode, PointLayer } from '../src/lib/types.ts';

type Level = 'orp' | 'obec';

/** Spočítá počet prvků vrstvy podle území (orp/obec). Prvky ve `features` mají vždy platné souřadnice –
 *  prvky bez souřadnic (např. NRPZS bez GPS) se počítají mimo tuto funkci (viz `parseNrpzs`). */
export function countBy(layer: PointLayer, level: Level): Record<AreaCode, number> {
  const out: Record<AreaCode, number> = {};
  for (const f of layer.features) {
    const key = f[level];
    if (!key) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** Sečte číselný atribut `attr` z `attrs` prvků vrstvy podle území. Nečíselné/chybějící hodnoty počítají jako 0. */
export function sumBy(layer: PointLayer, attr: string, level: Level): Record<AreaCode, number> {
  const out: Record<AreaCode, number> = {};
  for (const f of layer.features) {
    const key = f[level];
    if (!key) continue;
    const v = f.attrs[attr];
    const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
    out[key] = (out[key] ?? 0) + n;
  }
  return out;
}

/** counts na 1000 obyvatel; pro population 0/null/undefined/non-finite vrací null (nikdy Infinity/NaN). */
export function perThousand(
  counts: Record<AreaCode, number>,
  pop: Record<AreaCode, number | null | undefined>,
): Record<AreaCode, number | null> {
  const out: Record<AreaCode, number | null> = {};
  const keys = new Set([...Object.keys(counts), ...Object.keys(pop)]);
  for (const key of keys) {
    const p = pop[key];
    const c = counts[key] ?? 0;
    if (p === null || p === undefined || !Number.isFinite(p) || p === 0) {
      out[key] = null;
    } else {
      out[key] = (c / p) * 1000;
    }
  }
  return out;
}
