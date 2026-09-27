// Adaptér ČSÚ – "Uchazeči o zaměstnání dosažitelní a podíl nezaměstnaných osob podle obcí"
// (produkt 250169). Fix round 1, review finding #3 (Data ČR).
//
// Zjištěno živě 2026-09-27 (viz https://csu.gov.cz/csu/czso/uchazeci-o-zamestnani-dosazitelni-a-
// podil-nezamestnanych-osob-podle-obci_090417 a https://csu.gov.cz/produkty/uchazeci-o-zamestnani-
// dosazitelni-a-podil-nezamestnanych-osob-podle-obci_090417):
//   – Produkt byl ZRUŠEN ("Produkt byl zrušen s ohledem na změny distribuce dat ze strany MPSV" –
//     další data jsou na https://data.mpsv.cz/portal), poslední vydání je 250169-24 (14. 1. 2025).
//   – Koordinátor očekával "poslední dostupná data 2023", ale nejnovější skutečně existující edice
//     (250169-24) obsahuje měsíční data za rok 2024 → použito 2024 (validFor), ne 2023.
//   – ZIP obsahuje JEDEN CSV (`OD_NEZ01_*.CSV`), sloupce: idhod,hodnota,vuk,vuk_text,obdobi,rok,
//     mesic,uzemi_cis,uzemi_kod,uzemi_txt. `uzemi_cis` je vždy "43" (CISOB) – tento produkt je
//     JEN na úrovni OBCÍ, žádné ORP/kraj řádky přímo neobsahuje (proto se dle instrukce NEAGREGUJE
//     na ORP – chyběl by oficiální jmenovatel).
//   – Ukazatele (vuk): NEZ0004 "Podíl nezaměstnaných osob (%)" (oficiální podíl, se jmenovatelem
//     už započítaným ČSÚ – použito jako `nezamestnanost`) a NEZ0007 "Uchazeči o zaměstnání" (počet,
//     použito navíc jako `uchazeci`, i když to instrukce vyžadovala jen jako fallback – je zdarma
//     ze stejného souboru).
//   – Data jsou měsíční; jako roční hodnota se bere PROSINEC (`mesic="12"`, konec roku) – konzistentní
//     s "k 31. 12." konvencí použitou jinde v pipeline (ne roční průměr).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import yauzl from 'yauzl';
import type { AreaCode, IndicatorDef, IndicatorFile } from '../../src/lib/types.ts';
import type { SourceAdapter, SourceContext, SourceResult } from './types.ts';

const ZIP_URL = 'https://csu.gov.cz/docs/107508/0640906c-5e28-b2e6-4e03-327b9b64ad97/250169-24data011425.zip';
/** Rok pokrytý poslední (a zároveň poslední vydanou) edicí 250169-24 – viz komentář nahoře. */
export const YEAR = 2024;

const IND_NEZAMESTNANOST = 'NEZ0004'; // "Podíl nezaměstnaných osob (%)"
const IND_UCHAZECI = 'NEZ0007'; // "Uchazeči o zaměstnání" (počet)

interface CsvRow {
  [key: string]: string;
}

function parseRows(text: string): CsvRow[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  return Papa.parse<CsvRow>(normalized, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() }).data;
}

function toNumberOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function def(id: string, label: string, unit: string, higherIsBetter: boolean, decimals: number): IndicatorDef {
  return { id, label, unit, higherIsBetter, sourceId: 'csu-obec-nezamestnanost', decimals };
}

/**
 * Čistá (bez I/O) funkce – z CSV textu (obsah `OD_NEZ01_*.CSV`) sestaví obec. IndicatorFile pro
 * daný rok, jen z prosincových (`mesic="12"`) řádků.
 */
export function buildObecNezamestnanostFile(csvText: string, year: number): IndicatorFile {
  const nezamestnanost: Record<AreaCode, Record<number, number | null>> = {};
  const uchazeci: Record<AreaCode, Record<number, number | null>> = {};
  const yearStr = String(year);
  for (const row of parseRows(csvText)) {
    if (row.mesic !== '12' || row.rok !== yearStr) continue;
    const area = row.uzemi_kod;
    if (!area) continue;
    if (row.vuk === IND_NEZAMESTNANOST) {
      (nezamestnanost[area] ??= {})[year] = toNumberOrNull(row.hodnota);
    } else if (row.vuk === IND_UCHAZECI) {
      (uchazeci[area] ??= {})[year] = toNumberOrNull(row.hodnota);
    }
  }
  return {
    level: 'obec',
    indicators: {
      nezamestnanost: def(
        'nezamestnanost',
        'Podíl nezaměstnaných osob (obec, prosinec)',
        '%',
        false,
        2,
      ),
      uchazeci: def('uchazeci', 'Uchazeči o zaměstnání (obec, prosinec)', 'osoby', false, 0),
    },
    values: { nezamestnanost, uchazeci },
  };
}

/** Přečte JEDINÝ soubor uvnitř ZIPu a vrátí jeho obsah jako text (utf8). */
function readSingleEntryFromZip(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        reject(err ?? new Error('yauzl: prázdný ZIP'));
        return;
      }
      zip.on('error', reject);
      zip.readEntry();
      zip.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (err2, stream) => {
          if (err2 || !stream) {
            reject(err2 ?? new Error('yauzl: nelze otevřít stream'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          stream.on('error', reject);
        });
      });
    });
  });
}

async function fetchCachedText(url: string, rawDir: string, filename: string): Promise<string> {
  const filePath = path.join(rawDir, filename);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = await readSingleEntryFromZip(buf);
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

export const csuObecNezamestnanost: SourceAdapter = {
  id: 'csu-obec-nezamestnanost',
  async run(ctx: SourceContext): Promise<SourceResult> {
    const rawDir = path.join(ctx.rawDir, 'csu-obec-nezamestnanost');
    const csvText = await fetchCachedText(ZIP_URL, rawDir, 'od_nez01.csv');
    const obec = buildObecNezamestnanostFile(csvText, YEAR);

    return {
      source: {
        id: 'csu-obec-nezamestnanost',
        provider: 'Český statistický úřad',
        title: 'Uchazeči o zaměstnání dosažitelní a podíl nezaměstnaných osob podle obcí (produkt 250169)',
        url: ZIP_URL,
        license: 'CC BY 4.0',
        downloadedAt: ctx.now.toISOString(),
        validFor: String(YEAR),
        status: 'ok',
        note:
          `Produkt ČSÚ 250169 byl zrušen (data dál na data.mpsv.cz/portal); poslední vydaná edice ` +
          `250169-24 (14.1.2025) obsahuje měsíční data do prosince ${YEAR} – použita prosincová hodnota ` +
          '(ne roční průměr). Jen úroveň obcí (uzemi_cis=43) – ORP/kraj se nedopočítávají (chyběl by ' +
          'oficiální jmenovatel), viz review finding #3.',
      },
      indicators: [obec],
    };
  },
};
