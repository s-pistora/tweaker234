// Percentily a vazene skore uzemi (ciste funkce, zadny pristup na DOM/sit).
//
// percentileRank: percentil (0-100) hodnoty v ramci mnoziny uzemi. Pocita se z
// poradi (0-indexovaneho), shodne hodnoty sdili prumerne poradi. Pro
// higherIsBetter=false se vysledek invertuje (100 - p), protoze u takoveho
// ukazatele je "lepsi" nizsi hodnota (napr. nezamestnanost).
//
// score: skore(uzemi) = Σ wᵢ·pᵢ / Σ wᵢ pres ukazatele, ktere maji pro dane
// uzemi hodnotu (chybejici -> ukazatel je v `skipped`, vahy se prirozene
// renormalizuji tim, ze do jmenovatele vstupuji jen vahy pouzitych casti).
// Kazdy ukazatel pouziva SVUJ vlastni posledni rok s daty (ne globalne
// vybrany rok predany parametrem `year`) - ukazatele maji ruzne pokryti roky
// a mixovani by bylo zavadejici. Rezim „Kde by se mi dobre zilo?“ pouziva jen
// percentileRank (viz lib/zivot.ts); score() zustava kvuli starsim odkazum s `w=`.
import type { AreaCode, IndicatorDef, IndicatorFile } from './types.ts';

export interface ScorePart {
  id: string;
  /** percentil (0-100) */
  p: number;
  /** pouzita vaha (0-5) */
  w: number;
}

export interface AreaScore {
  score: number | null;
  parts: ScorePart[];
  /** id ukazatelu, ktere mely nenulovou vahu, ale pro toto uzemi chybi hodnota */
  skipped: string[];
}

export type ScoreResult = Record<AreaCode, AreaScore>;

/**
 * Percentilove poradi hodnot (0-100). `values` muze obsahovat `null` (chybejici
 * udaj) - ten zustane v odpovedi `null`. n=1 -> 100 (jedine uzemi je "nejlepsi
 * mozne", srovnani nema smysl). Vsechny hodnoty null (n=0) -> vsechno zustane null.
 */
export function percentileRank(
  values: Record<AreaCode, number | null>,
  higherIsBetter: boolean,
): Record<AreaCode, number | null> {
  const result: Record<AreaCode, number | null> = {};
  const withValue: [AreaCode, number][] = [];
  for (const [code, v] of Object.entries(values)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      withValue.push([code, v]);
    } else {
      result[code] = null;
    }
  }

  const n = withValue.length;
  if (n === 0) return result;
  if (n === 1) {
    result[withValue[0][0]] = 100;
    return result;
  }

  const sorted = [...withValue].sort((a, b) => a[1] - b[1]);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1][1] === sorted[i][1]) j++;
    const avgRank = (i + j) / 2;
    let p = (100 * avgRank) / (n - 1);
    if (!higherIsBetter) p = 100 - p;
    for (let k = i; k <= j; k++) result[sorted[k][0]] = p;
    i = j + 1;
  }
  return result;
}

/** Nejvyšší rok, pro který má daný ukazatel alespoň jednu nenulovou hodnotu (v libovolném území). */
function latestDataYear(file: IndicatorFile, id: string): number | null {
  const byArea = file.values[id];
  if (!byArea) return null;
  let latest: number | null = null;
  for (const byYear of Object.values(byArea)) {
    for (const [y, v] of Object.entries(byYear)) {
      if (v !== null && Number.isFinite(v)) {
        const yn = Number(y);
        if (latest === null || yn > latest) latest = yn;
      }
    }
  }
  return latest;
}

/** Jednotky čistě velikostních (absolutních) ukazatelů - viz `eligibleIndicators`. */
const ABSOLUTE_UNITS = new Set(['počet', 'osoby']);

/**
 * Ukazatele vhodné jako kritéria "životní úrovně": vylučuje čisté ukazatele
 * velikosti (počet obyvatel, počty jinak jednotky "počet" nebo "osoby" - např.
 * počet uchazečů o zaměstnání), protože ty samy o sobě neříkají nic o tom,
 * jestli se v území dobře žije (jen jak je území velké).
 */
export function eligibleIndicators(file: IndicatorFile): IndicatorDef[] {
  return Object.values(file.indicators).filter((d) => d.id !== 'obyvatele' && !ABSOLUTE_UNITS.has(d.unit));
}

/**
 * Vážené skóre (0-100) pro každé území v `file`, dané vahami (0-5, klíč =
 * id ukazatele). `year` je zachován kvůli kontraktu, ale NEPOUŽÍVÁ se pro
 * výběr roku jednotlivých ukazatelů - viz komentář v hlavičce souboru.
 */
export function score(file: IndicatorFile, _year: number, weights: Record<string, number>): ScoreResult {
  const allAreas = new Set<AreaCode>();
  for (const byArea of Object.values(file.values)) {
    for (const code of Object.keys(byArea)) allAreas.add(code);
  }

  const ids = Object.keys(weights).filter((id) => id in file.indicators && weights[id] > 0);

  const percentiles: Record<string, Record<AreaCode, number | null>> = {};
  for (const id of ids) {
    const byArea = file.values[id] ?? {};
    const latestYear = latestDataYear(file, id);
    const valuesAtYear: Record<AreaCode, number | null> = {};
    for (const code of allAreas) {
      const v = latestYear !== null ? byArea[code]?.[latestYear] : undefined;
      valuesAtYear[code] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    percentiles[id] = percentileRank(valuesAtYear, file.indicators[id].higherIsBetter);
  }

  const out: ScoreResult = {};
  for (const code of allAreas) {
    const parts: ScorePart[] = [];
    const skipped: string[] = [];
    for (const id of ids) {
      const p = percentiles[id][code];
      if (p === null || p === undefined) {
        skipped.push(id);
        continue;
      }
      parts.push({ id, p, w: weights[id] });
    }
    const totalW = parts.reduce((s, x) => s + x.w, 0);
    const scoreVal = parts.length && totalW > 0 ? parts.reduce((s, x) => s + x.p * x.w, 0) / totalW : null;
    out[code] = { score: scoreVal, parts, skipped };
  }
  return out;
}

/** Poslední rok s daty pro daný ukazatel (každá část skóre má svůj rok). */
export function scoreIndicatorYear(file: IndicatorFile, id: string): number | null {
  return latestDataYear(file, id);
}
