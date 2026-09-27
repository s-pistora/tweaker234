// Čisté pomocné funkce nad IndicatorFile (bez DOM).
import type { AreaCode, IndicatorFile } from '../types.ts';
import { formatValue } from '../sentences.ts';

export type Series = Record<number, number | null>;

/** Hodnoty ukazatele za daný rok pro všechna území (chybějící → null). */
export function valuesFor(
  file: IndicatorFile | undefined,
  indicator: string,
  year: number,
): Record<AreaCode, number | null> {
  const byArea = file?.values[indicator];
  const out: Record<AreaCode, number | null> = {};
  if (!byArea) return out;
  for (const [code, byYear] of Object.entries(byArea)) {
    const v = byYear[year];
    out[code] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  return out;
}

/** Poslední nenulová hodnota v roce ≤ upTo; když žádná není, poslední nenulová vůbec. */
export function latestValue(
  series: Series | undefined,
  upTo?: number,
): { year: number; value: number } | null {
  if (!series) return null;
  const entries = Object.entries(series)
    .map(([y, v]) => [Number(y), v] as const)
    .filter((e): e is readonly [number, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
    .sort((a, b) => a[0] - b[0]);
  if (!entries.length) return null;
  const upToEntries = upTo === undefined ? entries : entries.filter(([y]) => y <= upTo);
  const [year, value] = (upToEntries.length ? upToEntries : entries).at(-1)!;
  return { year, value };
}

export function yearsWithData(file: IndicatorFile | undefined, indicator: string): number[] {
  const byArea = file?.values[indicator];
  if (!byArea) return [];
  const years = new Set<number>();
  for (const byYear of Object.values(byArea)) {
    for (const [y, v] of Object.entries(byYear)) if (v !== null) years.add(Number(y));
  }
  return [...years].sort((a, b) => a - b);
}

/** Přizpůsobí (ukazatel, rok) dané úrovni: platné ponechá, jinak první ukazatel / poslední rok s daty. */
export function fitIndicator(
  file: IndicatorFile | undefined,
  indicator: string,
  year: number,
): { indicator: string; year: number } {
  if (!file) return { indicator, year };
  const ind = indicator in file.indicators ? indicator : (Object.keys(file.indicators)[0] ?? indicator);
  const years = yearsWithData(file, ind);
  const y = years.includes(year) ? year : (years.at(-1) ?? year);
  return { indicator: ind, year: y };
}

/**
 * Řádky náhledu: vybraný ukazatel první, pak další; „LABEL: hodnota jednotka (rok)“.
 *
 * Vybraný (primární) ukazatel je rokem přesný (kvůli časové ose, Task 17): pokud
 * pro něj území nemá žádnou hodnotu vůbec, řádek je „LABEL: N/A“; pokud hodnotu
 * má, ale ne pro AKTUÁLNĚ vybraný rok, řádek je „LABEL: N/A PRO ROK <rok>“ (na
 * rozdíl od `latestValue`, tady se NEPADÁ zpět na nejbližší/poslední známý rok -
 * jinak by časová osa u ukazatelů bez řady tiše ukazovala starou hodnotu).
 * Ostatní ukazatele dál používají svůj vlastní poslední rok s daty (viz `Concerns`
 * v report - různé pokrytí roky, mixování by bylo zavádějící).
 */
export function summaryLines(
  file: IndicatorFile | undefined,
  code: AreaCode,
  primary: string,
  year: number,
  max = 3,
): string[] {
  if (!file) return [];
  const ids = [primary, ...Object.keys(file.indicators).filter((id) => id !== primary)].filter(
    (id) => id in file.indicators,
  );
  return ids.slice(0, max).map((id) => {
    const def = file.indicators[id];
    if (id === primary) {
      const series = file.values[id]?.[code];
      const hasAnyData = latestValue(series) !== null;
      if (!hasAnyData) return `${def.label}: N/A`;
      const v = series?.[year];
      if (typeof v !== 'number' || !Number.isFinite(v)) return `${def.label}: N/A PRO ROK ${year}`;
      return `${def.label}: ${formatValue(v, def)} ${def.unit} (${year})`;
    }
    const lv = latestValue(file.values[id]?.[code]);
    if (!lv) return `${def.label}: N/A`;
    return `${def.label}: ${formatValue(lv.value, def)} ${def.unit} (${lv.year})`;
  });
}
