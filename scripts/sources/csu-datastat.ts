// Adaptér ČSÚ DataStat (https://data.csu.gov.cz/api/dotaz/v1/data/sady/{sada}/vlastni).
// Zdroje/sady ověřené 2026-09-27 (viz docs/superpowers/specs/2026-09-27-kraj-term-design.md):
//   PORKR01  – obyvatelé krajů (a ČR), 2000–2025, plochá dimenze území Uz02A (STAT i KRAJ ve stejném sloupci).
//   PORKR02  – přirozený přírůstek a přírůstek stěhováním na 1000 obyv. (kraje) → sečteno = "celkový přírůstek na 1000".
//   PORKR03  – průměrný věk (kraje).
//   PORKR04  – index stáří (kraje).
//   OBY02E   – počet obyvatel podle věkových skupin (VekSkupZakl: Celkem/0-14/15-64/65+) → odvozené podíly.
//   NEZ01    – podíl nezaměstnaných (kraje, jen poslední rok 2024); hierarchická dimenze UZ023H2U (STAT/KRAJ/OKRES).
//   MZDR     – průměrná hrubá mzda (kraje, ZJIST=2 "pracovištní metoda" – s výchozím ZJIST žádná data na úrovni kraje!);
//              hierarchická dimenze Uz0123vm (STAT/REGION/KRAJ).
//   OBY01B   – obyvatelé ORP (plochá dimenze Uz4A).
//   OBY01B01 – obyvatelé obcí (hierarchická dimenze Uz45B: ORP+OBEC; server odmítne najednou víc než ~1 rok při
//              stovkách obcí jako "too large to be generated synchronously" – proto se pro obce stahuje rok po roce).
//
// POZOR (zjištěno živě): apl2.czso.cz/iSMS/do_cis_export (číselníky, viz codes.ts) při souběžných requestech
// vrací všem stejnou zkrácenou odpověď. Pro data.csu.gov.cz jsme tento problém nepozorovali, přesto se zde
// stahuje sekvenčně kvůli konzistenci a menší zátěži serveru.
import Papa from 'papaparse';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AreaCode, IndicatorDef, IndicatorFile } from '../../src/lib/types.ts';
import type { SourceAdapter, SourceContext, SourceResult } from './types.ts';
import { loadCodes, KV_ORP } from '../codes.ts';

const API = 'https://data.csu.gov.cz/api/dotaz/v1/data/sady';
const KRAJE_NUTS3 = [
  'CZ010', 'CZ020', 'CZ031', 'CZ032', 'CZ041', 'CZ042',
  'CZ051', 'CZ052', 'CZ053', 'CZ063', 'CZ064', 'CZ071', 'CZ072', 'CZ080',
] as const;
const NATIONAL = 'CZ';
const KV_KRAJ: AreaCode = 'CZ041';

// Rozumný kompromis rozsahu vs. času běhu pipeline (viz report – lze rozšířit na 2000+).
const YEARS_KRAJ = range(2015, 2025);
const YEARS_MZDR = range(2015, 2025);
const YEARS_NEZ = [2024]; // jediný rok s krajovým rozpadem dostupný v NEZ01 (ověřeno živě)
const YEARS_OBEC = range(2020, 2025);

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

interface CsvRow {
  [key: string]: string;
}

function parseRows(text: string): CsvRow[] {
  // Server míchá CRLF/LF nekonzistentně, což mate Papaparse autodetekci uvnitř quotovaných polí.
  const normalized = text.replace(/\r\n?/g, '\n');
  return Papa.parse<CsvRow>(normalized, { header: true, skipEmptyLines: true }).data;
}

function yearColumnOf(row: CsvRow): string | undefined {
  return Object.keys(row).find((k) => /^Cas\w*\.Polozka$/.test(k));
}

function toNumberOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Obecný parser CSV odpovědí ČSÚ DataStat.
 * `map.indicatorId` filtruje řádky podle sloupce "Ukazatel" (přesná shoda).
 * `map.areaColumn` je název sloupce s kódem území (po `kodCiselniku=true` např. "Uz02A.Polozka",
 * "UZ023H2U.KRAJ.Polozka", "Uz4A.Polozka", "Uz45B.OBEC.Polozka"…). Řádky s prázdnou hodnotou
 * v tomto sloupci se přeskočí (typicky řádek nadřazené úrovně u hierarchických území).
 * Prázdná hodnota v "Hodnota" → `null`.
 */
export function parseDataStatCsv(
  text: string,
  map: { indicatorId: string; areaColumn: string },
): Record<AreaCode, Record<number, number | null>> {
  const result: Record<AreaCode, Record<number, number | null>> = {};
  for (const row of parseRows(text)) {
    if (row.Ukazatel !== map.indicatorId) continue;
    const area = row[map.areaColumn];
    if (!area) continue;
    const yearCol = yearColumnOf(row);
    if (!yearCol) continue;
    const year = Number(row[yearCol]);
    if (!Number.isFinite(year)) continue;
    (result[area] ??= {})[year] = toNumberOrNull(row.Hodnota);
  }
  return result;
}

/**
 * Vytáhne čistě celostátní (STAT) řadu z odpovědi, kde ČR i kraje sdílí stejný text ale
 * území je rozděleno do samostatných sloupců po úrovních (STAT/KRAJ). Řádek patří k ČR,
 * pokud je jeho krajový sloupec prázdný (jinak by šlo o konkrétní kraj).
 */
function extractNationalSeries(
  text: string,
  indicatorId: string,
  statColumn: string,
  krajColumn: string,
): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const row of parseRows(text)) {
    if (row.Ukazatel !== indicatorId) continue;
    if (row[krajColumn]) continue;
    const area = row[statColumn];
    if (!area) continue;
    const yearCol = yearColumnOf(row);
    if (!yearCol) continue;
    const year = Number(row[yearCol]);
    if (!Number.isFinite(year)) continue;
    out[year] = toNumberOrNull(row.Hodnota);
  }
  return out;
}

/** Jako parseDataStatCsv, ale s dodatečným filtrem na jeden další sloupec (např. věkovou skupinu). */
function parseDataStatCsvBy(
  text: string,
  indicatorId: string,
  areaColumn: string,
  extraColumn: string,
  extraValue: string,
): Record<AreaCode, Record<number, number | null>> {
  const result: Record<AreaCode, Record<number, number | null>> = {};
  for (const row of parseRows(text)) {
    if (row.Ukazatel !== indicatorId) continue;
    if (row[extraColumn] !== extraValue) continue;
    const area = row[areaColumn];
    if (!area) continue;
    const yearCol = yearColumnOf(row);
    if (!yearCol) continue;
    const year = Number(row[yearCol]);
    if (!Number.isFinite(year)) continue;
    (result[area] ??= {})[year] = toNumberOrNull(row.Hodnota);
  }
  return result;
}

function def(
  id: string,
  label: string,
  unit: string,
  higherIsBetter: boolean,
  decimals: number,
): IndicatorDef {
  return { id, label, unit, higherIsBetter, sourceId: 'csu-datastat', decimals };
}

function sum2(
  a: Record<AreaCode, Record<number, number | null>>,
  b: Record<AreaCode, Record<number, number | null>>,
): Record<AreaCode, Record<number, number | null>> {
  const areas = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<AreaCode, Record<number, number | null>> = {};
  for (const area of areas) {
    const ya = a[area] ?? {};
    const yb = b[area] ?? {};
    const years = new Set([...Object.keys(ya), ...Object.keys(yb)].map(Number));
    out[area] = {};
    for (const y of years) {
      const va = ya[y];
      const vb = yb[y];
      out[area][y] = va == null || vb == null ? null : va + vb;
    }
  }
  return out;
}

function ratioPct(
  part: Record<AreaCode, Record<number, number | null>>,
  total: Record<AreaCode, Record<number, number | null>>,
): Record<AreaCode, Record<number, number | null>> {
  const out: Record<AreaCode, Record<number, number | null>> = {};
  for (const area of Object.keys(part)) {
    out[area] = {};
    const totalYears = total[area] ?? {};
    for (const [yStr, v] of Object.entries(part[area])) {
      const y = Number(yStr);
      const t = totalYears[y];
      out[area][y] = v == null || t == null || t === 0 ? null : (v / t) * 100;
    }
  }
  return out;
}

/** Odfiltruje `null` roky – pro `national`/`regional`, kde kontrakt `IndicatorFile` nulu nepřipouští. */
function dropNulls(series: Record<number, number | null>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [y, v] of Object.entries(series)) {
    if (v != null) out[Number(y)] = v;
  }
  return out;
}

/** Vezme jen klíč `CZ041` a spol. (bez `CZ`) – pro values kraj. souboru. */
function withoutNational(
  m: Record<AreaCode, Record<number, number | null>>,
): Record<AreaCode, Record<number, number | null>> {
  const { [NATIONAL]: _omit, ...rest } = m;
  return rest;
}

export interface DataStatRawTexts {
  porkr01: string;
  porkr02: string;
  porkr03: string;
  porkr04: string;
  nez01: string;
  mzdr: string;
  oby02e: string;
  oby01b: string;
  /** obec obyvatele – více textů (jeden fetch na rok, viz komentář nahoře), spojí se dohromady. */
  oby01b01: string | string[];
}

/** Čistá (bez I/O) funkce – z už stažených CSV textů sestaví IndicatorFile pro kraj/orp/obec. */
export function buildIndicatorFiles(
  raw: DataStatRawTexts,
  obceKv: string[],
): { kraj: IndicatorFile; orp: IndicatorFile; obec: IndicatorFile } {
  // --- kraj: obyvatelé (PORKR01, plochá dimenze Uz02A) ---
  const obyvateleAll = parseDataStatCsv(raw.porkr01, {
    indicatorId: 'Počet obyvatel k 31. 12.',
    areaColumn: 'Uz02A.Polozka',
  });
  const obyvateleKraj = withoutNational(obyvateleAll);
  const obyvateleNational = obyvateleAll[NATIONAL] ?? {};

  // --- kraj: přírůstek na 1000 (PORKR02 = přirozený + stěhováním, plochá dimenze) ---
  const natural = parseDataStatCsv(raw.porkr02, {
    indicatorId: 'Přirozený přírůstek/úbytek na 1 000 obyvatel',
    areaColumn: 'Uz02A.Polozka',
  });
  const migration = parseDataStatCsv(raw.porkr02, {
    indicatorId: 'Přírůstek/úbytek stěhováním na 1 000 obyvatel',
    areaColumn: 'Uz02A.Polozka',
  });
  const prirustekAll = sum2(natural, migration);
  const prirustekKraj = withoutNational(prirustekAll);
  const prirustekNational = prirustekAll[NATIONAL] ?? {};

  // --- kraj: průměrný věk (PORKR03), index stáří (PORKR04) ---
  const vekAll = parseDataStatCsv(raw.porkr03, { indicatorId: 'Průměrný věk', areaColumn: 'Uz02A.Polozka' });
  const indexStariAll = parseDataStatCsv(raw.porkr04, { indicatorId: 'Index stáří', areaColumn: 'Uz02A.Polozka' });

  // --- kraj: podíl 0-14 a 65+ (OBY02E, filtr na věkovou skupinu textovým sloupcem) ---
  const IND_OBY02E = 'Počet obyvatel k 31. 12. (koncový stav)';
  const COL_VEK = 'Věkové skupiny (základní)';
  const celkemAll = parseDataStatCsvBy(raw.oby02e, IND_OBY02E, 'Uz02A.Polozka', COL_VEK, 'Celkem');
  const vek014All = parseDataStatCsvBy(raw.oby02e, IND_OBY02E, 'Uz02A.Polozka', COL_VEK, '0 - 14 let');
  const vek65All = parseDataStatCsvBy(raw.oby02e, IND_OBY02E, 'Uz02A.Polozka', COL_VEK, '65 a více let');
  const podil014All = ratioPct(vek014All, celkemAll);
  const podil65All = ratioPct(vek65All, celkemAll);

  // --- kraj: nezaměstnanost (NEZ01, hierarchická dimenze UZ023H2U) ---
  const IND_NEZ = 'Podíl nezaměstnaných osob - celkem (%)';
  const nezamestnanostKraj = parseDataStatCsv(raw.nez01, { indicatorId: IND_NEZ, areaColumn: 'UZ023H2U.KRAJ.Polozka' });
  const nezamestnanostNational = extractNationalSeries(
    raw.nez01, IND_NEZ, 'UZ023H2U.STAT.Polozka', 'UZ023H2U.KRAJ.Polozka',
  );

  // --- kraj: mzda (MZDR, ZJIST=2 už vyfiltrováno requestem; hierarchická dimenze Uz0123vm) ---
  const IND_MZDA = 'Průměrná hrubá měsíční mzda na přepočtené počty zaměstnanců (Kč)';
  const mzdaKraj = parseDataStatCsv(raw.mzdr, { indicatorId: IND_MZDA, areaColumn: 'Uz0123vm.KRAJ.Polozka' });
  const mzdaNational = extractNationalSeries(raw.mzdr, IND_MZDA, 'Uz0123vm.STAT.Polozka', 'Uz0123vm.KRAJ.Polozka');

  const kraj: IndicatorFile = {
    level: 'kraj',
    indicators: {
      obyvatele: def('obyvatele', 'Počet obyvatel', 'osoby', true, 0),
      prirustek_na_1000: def('prirustek_na_1000', 'Celkový přírůstek na 1000 obyvatel', '‰', true, 2),
      podil_0_14: def('podil_0_14', 'Podíl dětí 0–14 let', '%', true, 1),
      podil_65: def('podil_65', 'Podíl obyvatel 65+', '%', false, 1),
      prumerny_vek: def('prumerny_vek', 'Průměrný věk', 'let', false, 1),
      index_stari: def('index_stari', 'Index stáří', '%', false, 1),
      nezamestnanost: def('nezamestnanost', 'Podíl nezaměstnaných', '%', false, 2),
      mzda: def('mzda', 'Průměrná hrubá mzda', 'Kč', true, 0),
    },
    values: {
      obyvatele: obyvateleKraj,
      prirustek_na_1000: prirustekKraj,
      podil_0_14: withoutNational(podil014All),
      podil_65: withoutNational(podil65All),
      prumerny_vek: withoutNational(vekAll),
      index_stari: withoutNational(indexStariAll),
      nezamestnanost: nezamestnanostKraj,
      mzda: mzdaKraj,
    },
    national: {
      obyvatele: dropNulls(obyvateleNational),
      prirustek_na_1000: dropNulls(prirustekNational),
      podil_0_14: dropNulls(podil014All[NATIONAL] ?? {}),
      podil_65: dropNulls(podil65All[NATIONAL] ?? {}),
      prumerny_vek: dropNulls(vekAll[NATIONAL] ?? {}),
      index_stari: dropNulls(indexStariAll[NATIONAL] ?? {}),
      nezamestnanost: dropNulls(nezamestnanostNational),
      mzda: dropNulls(mzdaNational),
    },
  };

  // --- orp (KV kraj, 7 ORP): obyvatelé (OBY01B, plochá dimenze Uz4A) ---
  const obyvateleOrp = parseDataStatCsv(raw.oby01b, {
    indicatorId: 'Počet obyvatel k 31. 12.',
    areaColumn: 'Uz4A.Polozka',
  });
  const orp: IndicatorFile = {
    level: 'orp',
    indicators: {
      obyvatele: def('obyvatele', 'Počet obyvatel', 'osoby', true, 0),
    },
    values: { obyvatele: obyvateleOrp },
    regional: { obyvatele: dropNulls(obyvateleKraj[KV_KRAJ] ?? {}) },
  };

  // --- obec (134 obcí KV kraje): obyvatelé (OBY01B01, hierarchická dimenze Uz45B – po letech) ---
  const obecTexts = Array.isArray(raw.oby01b01) ? raw.oby01b01 : [raw.oby01b01];
  const obyvateleObec: Record<AreaCode, Record<number, number | null>> = {};
  for (const text of obecTexts) {
    const part = parseDataStatCsv(text, { indicatorId: 'Počet obyvatel k 31. 12.', areaColumn: 'Uz45B.OBEC.Polozka' });
    for (const [area, byYear] of Object.entries(part)) {
      obyvateleObec[area] = { ...(obyvateleObec[area] ?? {}), ...byYear };
    }
  }
  const obec: IndicatorFile = {
    level: 'obec',
    indicators: {
      obyvatele: def('obyvatele', 'Počet obyvatel', 'osoby', true, 0),
    },
    values: { obyvatele: obyvateleObec },
    regional: { obyvatele: dropNulls(obyvateleKraj[KV_KRAJ] ?? {}) },
  };
  // obceKv se v čisté buildIndicatorFiles nepoužívá k filtraci (data se stahují už jen pro tyto obce) –
  // parametr slouží ke kontrole úplnosti v run().
  void obceKv;

  return { kraj, orp, obec };
}

async function fetchCached(url: string, rawDir: string, filename: string): Promise<string> {
  const filePath = path.join(rawDir, filename);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const text = await res.text();
    await mkdir(rawDir, { recursive: true });
    await writeFile(filePath, text, 'utf8');
    return text;
  } catch (err) {
    try {
      return await readFile(filePath, 'utf8');
    } catch {
      throw err;
    }
  }
}

/**
 * Sestaví query string pro DataStat API. POZOR (zjištěno živě): server u parametrů se seznamem
 * kódů (např. `Uz02A=CZ,CZ041`) vyžaduje LITERÁLNÍ čárku – `URLSearchParams` by ji zakódovalo na
 * `%2C` a server by pak na takový dotaz odpověděl 400 "Chybný požadavek". Proto ruční sestavení
 * bez enkódování čárky (ostatní znaky v hodnotách zde nejsou, kódy jsou vždy `[A-Z0-9,]`).
 */
function q(params: Record<string, string>): string {
  const base = 'format=CSV&kodCiselniku=true';
  const rest = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return rest ? `${base}&${rest}` : base;
}

export const csuDataStat: SourceAdapter = {
  id: 'csu-datastat',
  async run(ctx: SourceContext): Promise<SourceResult> {
    const rawDir = path.join(ctx.rawDir, 'csu-datastat');
    const codes = await loadCodes(path.join(ctx.rawDir, 'codes'));
    const obceKv = KV_ORP.flatMap((orp) => codes.obceOfOrp(orp));
    const kraje = KRAJE_NUTS3.join(',');
    const krajeAndNational = [NATIONAL, ...KRAJE_NUTS3].join(',');
    const orpy = KV_ORP.join(',');

    const porkr01 = await fetchCached(
      `${API}/PORKR01/vlastni?${q({ Uz02A: krajeAndNational, CasR: YEARS_KRAJ.join(','), POHLK: '0' })}`,
      rawDir, 'porkr01.csv',
    );
    const porkr02 = await fetchCached(
      `${API}/PORKR02/vlastni?${q({ Uz02A: krajeAndNational, CasR: YEARS_KRAJ.join(',') })}`,
      rawDir, 'porkr02.csv',
    );
    const porkr03 = await fetchCached(
      `${API}/PORKR03/vlastni?${q({ Uz02A: krajeAndNational, CasR: YEARS_KRAJ.join(',') })}`,
      rawDir, 'porkr03.csv',
    );
    const porkr04 = await fetchCached(
      `${API}/PORKR04/vlastni?${q({ Uz02A: krajeAndNational, CasR: YEARS_KRAJ.join(',') })}`,
      rawDir, 'porkr04.csv',
    );
    const oby02e = await fetchCached(
      `${API}/OBY02E/vlastni?${q({
        Uz02A: krajeAndNational, CasRB: YEARS_KRAJ.join(','), VekSkupZakl: 'VEK014,VEK1564,VEK65AV,VEKC',
      })}`,
      rawDir, 'oby02e.csv',
    );
    const nez01 = await fetchCached(
      `${API}/NEZ01/vlastni?${q({ UZ023H2U: krajeAndNational, CasR: YEARS_NEZ.join(',') })}`,
      rawDir, 'nez01.csv',
    );
    const mzdr = await fetchCached(
      `${API}/MZDR/vlastni?${q({ Uz0123vm: krajeAndNational, ZJIST: '2', CasR: YEARS_MZDR.join(',') })}`,
      rawDir, 'mzdr.csv',
    );
    const oby01b = await fetchCached(
      `${API}/OBY01B/vlastni?${q({ Uz4A: orpy, CasR: YEARS_KRAJ.join(',') })}`,
      rawDir, 'oby01b.csv',
    );

    // Obce: server odmítá víc než ~1 rok najednou pro stovky obcí ("too large to be generated
    // synchronously") – stahuje se rok po roce a spojuje.
    const oby01b01: string[] = [];
    for (const year of YEARS_OBEC) {
      const text = await fetchCached(
        `${API}/OBY01B01/vlastni?${q({ Uz45B: obceKv.join(','), CasR: String(year) })}`,
        rawDir, `oby01b01_${year}.csv`,
      );
      oby01b01.push(text);
    }

    const files = buildIndicatorFiles(
      { porkr01, porkr02, porkr03, porkr04, nez01, mzdr, oby02e, oby01b, oby01b01 },
      obceKv,
    );

    const validFor = String(Math.max(...YEARS_KRAJ));
    return {
      source: {
        id: 'csu-datastat',
        provider: 'Český statistický úřad',
        title: 'ČSÚ DataStat – obyvatelstvo, nezaměstnanost, mzdy (kraje, ORP a obce KV kraje)',
        url: 'https://data.csu.gov.cz/api/dotaz/v1/data/sady/PORKR01/vlastni',
        license: 'CC BY 4.0',
        downloadedAt: ctx.now.toISOString(),
        validFor,
        status: 'ok',
        note:
          'Sady PORKR01/02/03/04, OBY02E, OBY01B, OBY01B01 (' + YEARS_KRAJ[0] + '–' + validFor + '), ' +
          'NEZ01 (jen ' + YEARS_NEZ.join(',') + ' – jediný rok s krajovým rozpadem), ' +
          'MZDR se ZJIST=2 "pracovištní metoda" (výchozí ZJIST=1 nemá krajová data).',
      },
      indicators: [files.kraj, files.orp, files.obec],
    };
  },
};
