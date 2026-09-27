// Odvozené ukazatele pro úrovně ORP a obec z bodových vrstev + doplnění KV průměru (regional)
// a hodnoty ČR (national). Pravidla viz rozhodnutí koordinátora u Tasku 6.
import { countBy, sumBy } from '../aggregate.ts';
import type { AreaCode, IndicatorFile, PointLayer } from '../../src/lib/types.ts';

export interface DerivedSpec {
  /** id bodové vrstvy */
  layerId: string;
  /** id odvozeného ukazatele */
  id: string;
  label: string;
  unit: string;
  decimals: number;
  /** per1000 = počet bodů na 1000 obyvatel; perCapita = součet atributu na obyvatele */
  kind: 'per1000' | 'perCapita';
  /** pro perCapita: číselný atribut v attrs, který se sčítá */
  attr?: string;
  /** surový ukazatel počtů od adaptéru (má přednost před počítáním bodů; prázdný → dopočte se z bodů) */
  countIndicator?: string;
}

export const DERIVED: readonly DerivedSpec[] = [
  { layerId: 'skoly', id: 'skoly_na_1000', label: 'Školy a školská zařízení na 1000 obyvatel', unit: 'na 1000 obyvatel', decimals: 2, kind: 'per1000' },
  { layerId: 'socialni', id: 'socialni_na_1000', label: 'Poskytovatelé sociálních služeb na 1000 obyvatel', unit: 'na 1000 obyvatel', decimals: 2, kind: 'per1000' },
  { layerId: 'zastavky', id: 'zastavky_na_1000', label: 'Autobusové zastávky na 1000 obyvatel', unit: 'na 1000 obyvatel', decimals: 2, kind: 'per1000' },
  {
    layerId: 'zdravotnictvi', id: 'zdravotnicka_mista_na_1000', label: 'Místa poskytování zdravotních služeb na 1000 obyvatel',
    unit: 'na 1000 obyvatel', decimals: 2, kind: 'per1000', countIndicator: 'zdravotnicka_mista',
  },
  { layerId: 'vouchery', id: 'vouchery_kc_na_obyv', label: 'Krajské vouchery (Kč na obyvatele)', unit: 'Kč na obyvatele', decimals: 0, kind: 'perCapita', attr: 'prideleno' },
];

export const KV_KRAJ: AreaCode = 'CZ041';

/** Rok platnosti vrstvy ("2026" nebo "2026-09" → 2026). */
export function yearOf(validFor: string): number | null {
  const m = /^(\d{4})/.exec(validFor);
  return m ? Number(m[1]) : null;
}

/** Poslední rok ≤ `year`, pro který má ukazatel obyvatele aspoň jednu nenulovou hodnotu. */
export function populationYear(file: IndicatorFile, year: number): number | null {
  let best: number | null = null;
  for (const byYear of Object.values(file.values.obyvatele ?? {})) {
    for (const [yStr, v] of Object.entries(byYear)) {
      const y = Number(yStr);
      if (v != null && y <= year && (best === null || y > best)) best = y;
    }
  }
  return best;
}

function hasAnyValue(series: Record<AreaCode, Record<number, number | null>> | undefined, year: number): boolean {
  return !!series && Object.values(series).some((byYear) => byYear[year] != null);
}

/**
 * Přidá do souboru úrovně orp/obec odvozené ukazatele z bodových vrstev (DERIVED).
 * `areas` = všechna území úrovně (z geodat) – území bez bodů dostanou 0 (resp. null bez populace).
 * Nastaví i `regional` odvozeného ukazatele = Σ počtů / Σ populace přes KV kraj.
 */
export function deriveIndicators(
  input: IndicatorFile,
  layers: PointLayer[],
  opts: { areas: AreaCode[]; warn: (msg: string) => void; specs?: readonly DerivedSpec[] },
): IndicatorFile {
  const file: IndicatorFile = structuredClone(input);
  const level = file.level;
  if (level === 'kraj') return file;
  for (const spec of opts.specs ?? DERIVED) {
    const layer = layers.find((l) => l.id === spec.layerId);
    if (!layer) {
      opts.warn(`Odvozený ukazatel ${spec.id} (${level}) vynechán – chybí bodová vrstva "${spec.layerId}".`);
      continue;
    }
    const year = yearOf(layer.validFor);
    const popYear = year === null ? null : populationYear(file, year);
    if (year === null || popYear === null) {
      opts.warn(`Odvozený ukazatel ${spec.id} (${level}) vynechán – chybí rok vrstvy nebo počet obyvatel.`);
      continue;
    }

    // --- čitatel: počty / součty po územích ---
    let amounts: Record<AreaCode, number>;
    if (spec.kind === 'perCapita') {
      amounts = sumBy(layer, spec.attr ?? '', level);
    } else if (spec.countIndicator && hasAnyValue(file.values[spec.countIndicator], year)) {
      amounts = {};
      for (const [area, byYear] of Object.entries(file.values[spec.countIndicator]!)) {
        const v = byYear[year];
        if (v != null) amounts[area] = v;
      }
    } else {
      amounts = countBy(layer, level);
      if (spec.countIndicator && file.indicators[spec.countIndicator]) {
        // Adaptér nedodal počty pro tuto úroveň (NRPZS nemá kód obce) → dopočet z přiřazených bodů.
        const raw: Record<AreaCode, Record<number, number | null>> = {};
        for (const area of opts.areas) raw[area] = { [year]: amounts[area] ?? 0 };
        file.values[spec.countIndicator] = raw;
      }
    }

    // --- jmenovatel: obyvatelé v popYear ---
    const pop = file.values.obyvatele ?? {};
    const scale = spec.kind === 'per1000' ? 1000 : 1;
    const series: Record<AreaCode, Record<number, number | null>> = {};
    let sumAmount = 0;
    let sumPop = 0;
    for (const area of opts.areas) {
      const p = pop[area]?.[popYear];
      const a = amounts[area] ?? 0;
      if (p == null || !Number.isFinite(p) || p <= 0) {
        series[area] = { [year]: null };
        continue;
      }
      series[area] = { [year]: (a / p) * scale };
      sumAmount += a;
      sumPop += p;
    }
    file.indicators[spec.id] = {
      id: spec.id,
      label: spec.label,
      unit: spec.unit,
      higherIsBetter: true,
      sourceId: layer.sourceId,
      decimals: spec.decimals,
    };
    file.values[spec.id] = series;
    if (sumPop > 0) (file.regional ??= {})[spec.id] = { [year]: (sumAmount / sumPop) * scale };
  }
  return file;
}

function isRate(id: string, unit: string): boolean {
  return unit === '%' || unit === '‰' || /podil|na_1000|_na_obyv/.test(id);
}

/**
 * Doplní chybějící `national` (kopie z kraj souboru při shodě id) a `regional` (KV kraj):
 * ukazatel existuje na úrovni kraje → hodnota CZ041; jinak podíl/míra → průměr vážený populací
 * téhož roku; jinak (absolutní počty) se neuvádí. Existující hodnoty se nepřepisují.
 */
export function completeRegionalNational(input: IndicatorFile, kraj: IndicatorFile | undefined): IndicatorFile {
  const file: IndicatorFile = structuredClone(input);
  if (file.level === 'kraj') return file;
  for (const [id, d] of Object.entries(file.indicators)) {
    const nat = kraj?.national?.[id];
    if (nat && !file.national?.[id]) (file.national ??= {})[id] = { ...nat };
    if (file.regional?.[id]) continue;

    const krajSeries = kraj?.values[id]?.[KV_KRAJ];
    if (kraj?.indicators[id] && krajSeries) {
      const reg: Record<number, number> = {};
      for (const [y, v] of Object.entries(krajSeries)) if (v != null) reg[Number(y)] = v;
      if (Object.keys(reg).length) (file.regional ??= {})[id] = reg;
      continue;
    }
    if (!isRate(id, d.unit)) continue;
    const pop = file.values.obyvatele ?? {};
    const acc: Record<number, { num: number; den: number }> = {};
    for (const [area, byYear] of Object.entries(file.values[id] ?? {})) {
      for (const [yStr, v] of Object.entries(byYear)) {
        const y = Number(yStr);
        const p = pop[area]?.[y];
        if (v == null || p == null || p <= 0) continue;
        const a = (acc[y] ??= { num: 0, den: 0 });
        a.num += v * p;
        a.den += p;
      }
    }
    const reg: Record<number, number> = {};
    for (const [y, a] of Object.entries(acc)) if (a.den > 0) reg[Number(y)] = a.num / a.den;
    if (Object.keys(reg).length) (file.regional ??= {})[id] = reg;
  }
  return file;
}
