// Slučování IndicatorFile z více zdrojů do jednoho souboru na úroveň.
import type { AreaCode, IndicatorFile, Level } from '../../src/lib/types.ts';

type Series = Record<AreaCode, Record<number, number | null>>;

const clone = <T>(x: T): T => structuredClone(x);

/**
 * Sjednotí ukazatele všech souborů dané úrovně. Konflikt stejného id ze dvou zdrojů:
 * vyhrává první (pořadí registrace adaptérů), ostatní se zahodí a zaloguje se varování.
 * `national`/`regional` se přebírají jen od vítězného souboru daného ukazatele.
 */
export function mergeIndicatorFiles(
  level: Level,
  files: IndicatorFile[],
  warn: (msg: string) => void,
): IndicatorFile {
  const out: IndicatorFile = { level, indicators: {}, values: {} };
  for (const f of files) {
    if (f.level !== level) continue;
    for (const [id, d] of Object.entries(f.indicators)) {
      if (out.indicators[id]) {
        warn(
          `Ukazatel "${id}" (${level}) je ve více zdrojích – ponechán ${out.indicators[id]!.sourceId}, ` +
            `zahozen ${d.sourceId}.`,
        );
        continue;
      }
      out.indicators[id] = clone(d);
      out.values[id] = clone(f.values[id] ?? {});
      const nat = f.national?.[id];
      if (nat) (out.national ??= {})[id] = clone(nat);
      const reg = f.regional?.[id];
      if (reg) (out.regional ??= {})[id] = clone(reg);
    }
  }
  return out;
}

/**
 * Doplní do `primary` roky, které v něm chybí (nebo jsou null), ze `secondary` – jen pro `ids`.
 * Primární hodnoty se nikdy nepřepisují. Vrací novou kopii a seznam doplněných roků po ukazatelích.
 */
export function fillMissingYears(
  primary: IndicatorFile,
  secondary: IndicatorFile,
  ids: readonly string[],
): { file: IndicatorFile; filled: Record<string, number[]> } {
  const file = clone(primary);
  const filled: Record<string, number[]> = {};
  for (const id of ids) {
    const src = secondary.values[id];
    if (!src || !file.indicators[id]) continue;
    const dst: Series = (file.values[id] ??= {});
    const years = new Set<number>();
    for (const [area, byYear] of Object.entries(src)) {
      for (const [yStr, v] of Object.entries(byYear)) {
        if (v == null) continue;
        const y = Number(yStr);
        const target = (dst[area] ??= {});
        if (target[y] == null) {
          target[y] = v;
          years.add(y);
        }
      }
    }
    if (years.size) filled[id] = [...years].sort((a, b) => a - b);
  }
  return { file, filled };
}

/** Odstraní z hodnot území mimo `allowed` (např. prázdný kód nebo obec mimo KV kraj). */
export function restrictAreas(
  file: IndicatorFile,
  allowed: Set<AreaCode>,
): { file: IndicatorFile; removed: AreaCode[] } {
  const out = clone(file);
  const removed = new Set<AreaCode>();
  for (const byArea of Object.values(out.values)) {
    for (const area of Object.keys(byArea)) {
      if (!allowed.has(area)) {
        removed.add(area);
        delete byArea[area];
      }
    }
  }
  return { file: out, removed: [...removed].sort() };
}
