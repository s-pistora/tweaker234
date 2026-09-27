// Adaptér KROK (ČSÚ opendata, https://opendata.czso.cz/data/od_krok01/) – druhý, nezávislý zdroj
// časových řad pro kraje (vlastní kódy území) a cross-check proti ČSÚ DataStat.
// Ověřeno živě 2026-09-27:
//   krok_uzemi.csv  – číselník území (sloupec koduzemi, typuzemi 'ČR'|'oblast'|'kraj'|'okres'|'soorp').
//                      Kódy ORP v KROK jsou PŘÍMO ČSÚ kódy ORP (např. '4103' = Karlovy Vary), obce v KROK nejsou.
//                      Kódy krajů jsou VLASTNÍ (např. '0410' = Karlovarský kraj) – nutný vlastní překlad na NUTS3.
//   krok_ukaz.csv   – číselník ukazatelů (kodukaz, nazev, mj…), >1200 položek.
//   krok_data_{rok}.csv – řádky `rok,kodukaz,koduzemi,hodnota` za VŠECHNY ukazatele a území daného roku
//                      (~4-5 MB/rok, žádný server-side filtr – nutné stáhnout celý soubor a filtrovat lokálně).
// Použité ukazatele: 020401 Počet obyvatel celkem; 060231 Podíl nezaměstnaných osob - celkem (%);
// 111211 Průměrná hrubá měsíční mzda (POZOR: jen stavební podniky se sídlem na území, 50+ zaměstnanci –
// užší definice než ČSÚ DataStat MZDR, cross-check proto u mzdy očekávaně vykazuje odchylku, viz report).
import Papa from 'papaparse';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AreaCode, IndicatorDef, IndicatorFile } from '../../src/lib/types.ts';
import type { SourceAdapter, SourceContext, SourceResult } from './types.ts';

const BASE = 'https://opendata.czso.cz/data/od_krok01';

/** Vlastní kódy krajů KROK → NUTS3 (ověřeno živě z krok_uzemi.csv, viz tests/fixtures/krok_uzemi_sample.csv). */
export const KROK_KRAJ_TO_NUTS3: Record<string, AreaCode> = {
  '0110': 'CZ010', // Hlavní město Praha
  '0210': 'CZ020', // Středočeský kraj
  '0310': 'CZ031', // Jihočeský kraj
  '0320': 'CZ032', // Plzeňský kraj
  '0410': 'CZ041', // Karlovarský kraj
  '0420': 'CZ042', // Ústecký kraj
  '0510': 'CZ051', // Liberecký kraj
  '0520': 'CZ052', // Královéhradecký kraj
  '0530': 'CZ053', // Pardubický kraj
  '0610': 'CZ063', // Vysočina
  '0620': 'CZ064', // Jihomoravský kraj
  '0710': 'CZ071', // Olomoucký kraj
  '0720': 'CZ072', // Zlínský kraj
  '0810': 'CZ080', // Moravskoslezský kraj
};

const IND_OBYVATELE = '020401';
const IND_NEZAMESTNANOST = '060231';
const IND_MZDA = '111211';

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

/** Roky, pro které se stahují KROK data (celá historie – KROK je zdroj "2000+" doplňující DataStat). */
const YEARS_KROK = range(2000, 2025);

interface DataRow {
  rok: string;
  kodukaz: string;
  koduzemi: string;
  hodnota: string;
}

function parseRows<T = DataRow>(text: string): T[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  // POZOR: reálné krok_data_*.csv mají v hlavičce mezeru za "hodnota" ("hodnota "), proto trim.
  return Papa.parse<T>(normalized, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() }).data;
}

function toNumberOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Z jednoho ročního CSV (`krok_data_{rok}.csv`) vytáhne hodnoty daného ukazatele pro kraje,
 * s převodem vlastních kódů KROK na NUTS3. Nekrajová území (ČR, oblast, okres, ORP) se přeskočí.
 */
function extractKrajSeries(text: string, kodukaz: string): Record<AreaCode, number | null> {
  const out: Record<AreaCode, number | null> = {};
  for (const row of parseRows(text)) {
    if (row.kodukaz !== kodukaz) continue;
    const nuts3 = KROK_KRAJ_TO_NUTS3[row.koduzemi];
    if (!nuts3) continue; // není kraj (ČR/oblast/okres/ORP) nebo neznámý kód
    out[nuts3] = toNumberOrNull(row.hodnota);
  }
  return out;
}

function def(id: string, label: string, unit: string, higherIsBetter: boolean, decimals: number): IndicatorDef {
  return { id, label, unit, higherIsBetter, sourceId: 'krok', decimals };
}

/** Čistá (bez I/O) funkce – z textů ročních CSV sestaví kraj. IndicatorFile. */
export function buildKrokIndicatorFile(dataByYear: Record<number, string>): IndicatorFile {
  const values: IndicatorFile['values'] = { obyvatele: {}, nezamestnanost: {}, mzda: {} };
  for (const [yearStr, text] of Object.entries(dataByYear)) {
    const year = Number(yearStr);
    const obyvatele = extractKrajSeries(text, IND_OBYVATELE);
    const nezamestnanost = extractKrajSeries(text, IND_NEZAMESTNANOST);
    const mzda = extractKrajSeries(text, IND_MZDA);
    for (const [area, v] of Object.entries(obyvatele)) {
      (values.obyvatele[area] ??= {})[year] = v;
    }
    for (const [area, v] of Object.entries(nezamestnanost)) {
      (values.nezamestnanost[area] ??= {})[year] = v;
    }
    for (const [area, v] of Object.entries(mzda)) {
      (values.mzda[area] ??= {})[year] = v;
    }
  }
  return {
    level: 'kraj',
    indicators: {
      obyvatele: def('obyvatele', 'Počet obyvatel', 'osoby', true, 0),
      nezamestnanost: def('nezamestnanost', 'Podíl nezaměstnaných', '%', false, 2),
      mzda: def(
        'mzda',
        'Průměrná hrubá mzda (stavebnictví, podniky 50+ zam. – KROK)',
        'Kč',
        true,
        0,
      ),
    },
    values,
  };
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

export const krok: SourceAdapter = {
  id: 'krok',
  async run(ctx: SourceContext): Promise<SourceResult> {
    const rawDir = path.join(ctx.rawDir, 'krok');
    const dataByYear: Record<number, string> = {};
    for (const year of YEARS_KROK) {
      dataByYear[year] = await fetchCached(`${BASE}/krok_data_${year}.csv`, rawDir, `krok_data_${year}.csv`);
    }
    const kraj = buildKrokIndicatorFile(dataByYear);

    return {
      source: {
        id: 'krok',
        provider: 'Český statistický úřad (KROK)',
        title: 'KROK – krajská a okresní data (obyvatelé, nezaměstnanost, mzda – doplňkový zdroj a cross-check)',
        url: `${BASE}/krok_data_${YEARS_KROK[YEARS_KROK.length - 1]}.csv`,
        license: 'CC BY 4.0',
        downloadedAt: ctx.now.toISOString(),
        validFor: String(YEARS_KROK[YEARS_KROK.length - 1]),
        status: 'ok',
        note:
          `Roky ${YEARS_KROK[0]}–${YEARS_KROK[YEARS_KROK.length - 1]}. Ukazatel mzda (kód ${IND_MZDA}) je ` +
          'v KROK dostupný jen pro stavební podniky se sídlem na území s 50+ zaměstnanci – užší definice ' +
          'než ČSÚ DataStat MZDR, cross-check proto u mzdy očekává vyšší odchylku (viz report).',
      },
      indicators: [kraj],
    };
  },
};
