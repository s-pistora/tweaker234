// Validace pipeline: počty území (14 krajů ČR, 7 ORP a 134 obcí Karlovarského kraje) a cross-check
// dvou nezávislých zdrojů (ČSÚ DataStat vs KROK) v rámci tolerance.
import type { AreaCode, IndicatorFile } from '../src/lib/types.ts';

/** Očekávané počty území dle zadání (viz spec, sekce Context). */
export const EXPECTED_COUNTS = { kraj: 14, orp: 7, obec: 134 } as const;

/** Minimální podmnožina TopoJSON, kterou validateCounts potřebuje (objekt `areas` s poli geometries). */
export interface AreasTopology {
  objects?: { areas?: { geometries?: unknown[] } };
}

function areaCodesOf(file: IndicatorFile): Set<AreaCode> {
  const codes = new Set<AreaCode>();
  for (const byArea of Object.values(file.values)) {
    for (const area of Object.keys(byArea)) codes.add(area);
  }
  return codes;
}

function countAreas(topology: AreasTopology | undefined): number {
  return topology?.objects?.areas?.geometries?.length ?? 0;
}

/**
 * Zkontroluje, že datové soubory (`files`) i geodata (`geo`) obsahují očekávaný počet území
 * na každé úrovni (14 krajů / 7 ORP KV kraje / 134 obcí KV kraje). Vrací pole chybových hlášek
 * (prázdné pole = vše v pořádku).
 */
export function validateCounts(
  files: { kraj: IndicatorFile; orp: IndicatorFile; obec: IndicatorFile },
  geo: { kraje?: AreasTopology; kvOrp?: AreasTopology; kvObce?: AreasTopology },
): string[] {
  const errors: string[] = [];
  const checks: Array<[keyof typeof EXPECTED_COUNTS, IndicatorFile, AreasTopology | undefined, string]> = [
    ['kraj', files.kraj, geo.kraje, 'krajů ČR'],
    ['orp', files.orp, geo.kvOrp, 'ORP Karlovarského kraje'],
    ['obec', files.obec, geo.kvObce, 'obcí Karlovarského kraje'],
  ];
  for (const [level, file, topo, label] of checks) {
    const expected = EXPECTED_COUNTS[level];
    const fileCount = areaCodesOf(file).size;
    const geoCount = countAreas(topo);
    if (fileCount !== expected) {
      errors.push(`Data (${level}): očekáváno ${expected} ${label}, nalezeno ${fileCount}.`);
    }
    if (geoCount !== expected) {
      errors.push(`Geodata (${level}): očekáváno ${expected} ${label}, nalezeno ${geoCount}.`);
    }
  }
  return errors;
}

export interface CrossCheckDiff {
  id: string;
  area: AreaCode;
  year: number;
  a: number;
  b: number;
  rel: number;
}

export interface CrossCheckResult {
  ok: boolean;
  diffs: CrossCheckDiff[];
}

/**
 * Porovná dva nezávislé zdroje (typicky ČSÚ DataStat = primary a KROK = secondary) pro dané
 * ukazatele (`ids`, musí existovat v obou souborech pod stejným id). Relativní odchylka
 * `rel = |a-b|/|a|` nad `tol` (výchozí 0,5 %) se zapíše do `diffs`; `ok` je true, jen když
 * žádný pár nepřekročil toleranci (chybějící hodnota v jednom ze zdrojů se přeskakuje, ne chyba).
 */
export function crossCheck(
  primary: IndicatorFile,
  secondary: IndicatorFile,
  ids: string[],
  tol = 0.005,
): CrossCheckResult {
  const diffs: CrossCheckDiff[] = [];
  for (const id of ids) {
    const pa = primary.values[id];
    const pb = secondary.values[id];
    if (!pa || !pb) continue;
    const areas = new Set([...Object.keys(pa), ...Object.keys(pb)]);
    for (const area of areas) {
      const ya = pa[area] ?? {};
      const yb = pb[area] ?? {};
      const years = new Set([...Object.keys(ya), ...Object.keys(yb)].map(Number));
      for (const year of years) {
        const a = ya[year];
        const b = yb[year];
        if (a == null || b == null) continue;
        const rel = a === 0 ? (b === 0 ? 0 : Number.POSITIVE_INFINITY) : Math.abs(a - b) / Math.abs(a);
        if (rel > tol) diffs.push({ id, area, year, a, b, rel });
      }
    }
  }
  return { ok: diffs.length === 0, diffs };
}
