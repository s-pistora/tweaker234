// Adaptér ÚZIS NRPZS (Národní registr poskytovatelů zdravotních služeb) – Task 5.
//
// Zdroj: https://nrpzs.uzis.cz/res/file/export/export-YYYY-MM.csv – `;`-oddělené, cp1250,
// bez CORS (jen pipeline). URL obsahuje měsíc -> sestavuje se dynamicky s fallbackem na
// předchozí měsíc, pokud aktuální ještě není publikovaný (404).
//
// Poznámka ke kódu obce: export obsahuje ORPKod (ČSÚ formát, např. "4105"), ale
// NEobsahuje samostatný ČSÚ kód obce (jen textový název `Obec` a RÚIAN kód adresního
// místa, který na obec nelze převést bez samostatného RÚIAN registru – mimo rozsah této
// dávky). `obec` se proto ponechává jako '' u všech prvků; název obce je v attrs.obecNazev.
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import type { IndicatorFile, PointFeature } from '../../src/lib/types.ts';
import type { SourceAdapter, SourceContext, SourceResult } from './types.ts';

const KV_KRAJ_KOD = 'CZ041';

/** Sestaví URL exportu pro daný měsíc (`now` mínus `monthsBack` měsíců). */
export function nrpzsUrl(now: Date, monthsBack = 0): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `https://nrpzs.uzis.cz/res/file/export/export-${yyyy}-${mm}.csv`;
}

export interface ParsedNrpzs {
  features: PointFeature[];
  countsByObec: Record<string, number>;
  countsByOrp: Record<string, number>;
}

/** Naparsuje stažený NRPZS export (cp1250, `;`) a vrátí body KV kraje. Řádky bez GPS se
 *  do `features` nezahrnou (chybí souřadnice), ale počítají se do `countsByOrp`/`countsByObec`. */
export function parseNrpzs(buf: Buffer): ParsedNrpzs {
  const text = iconv.decode(buf, 'cp1250');
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const features: PointFeature[] = [];
  const countsByObec: Record<string, number> = {};
  const countsByOrp: Record<string, number> = {};

  for (const r of res.data) {
    if ((r['KrajKod'] ?? '').trim() !== KV_KRAJ_KOD) continue;

    const orp = (r['ORPKod'] ?? '').trim();
    // Bez ČSÚ kódu obce v exportu – viz poznámka nahoře. Používá se prázdný klíč pro
    // souhrn "bez určené obce", aby se žádný záznam neztratil z celkového počtu.
    const obecKey = '';

    if (orp) countsByOrp[orp] = (countsByOrp[orp] ?? 0) + 1;
    countsByObec[obecKey] = (countsByObec[obecKey] ?? 0) + 1;

    const gps = (r['GPS'] ?? '').trim();
    if (!gps) continue; // bez GPS -> vynecháno z bodů, ale už započítáno výše
    const parts = gps.split(/\s+/).map(Number);
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) continue;
    const [lat, lon] = parts as [number, number];

    features.push({
      id: `nrpzs-${r['MistoPoskytovaniId'] ?? features.length}`,
      name: r['NazevCely'] ?? r['PoskytovatelNazev'] ?? '',
      lon,
      lat,
      obec: obecKey,
      orp,
      attrs: {
        typ: r['DruhZarizeni'] ?? '',
        obecNazev: r['Obec'] ?? '',
        orpNazev: r['ORP'] ?? '',
      },
    });
  }

  return { features, countsByObec, countsByOrp };
}

async function fetchNrpzsCsv(now: Date, rawDir: string): Promise<{ buf: Buffer; url: string }> {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  for (let monthsBack = 0; monthsBack <= 2; monthsBack++) {
    const url = nrpzsUrl(now, monthsBack);
    const res = await fetch(url);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`nrpzs: ${url} -> HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(`${rawDir}/nrpzs.csv`, buf);
    return { buf, url };
  }
  throw new Error('nrpzs: export nenalezen ani po 2 měsících zpět (404)');
}

const INDICATOR_ID = 'zdravotnicka_mista';

export function makeIndicatorFile(
  level: 'orp' | 'obec',
  counts: Record<string, number>,
  year: number,
  sourceId: string,
): IndicatorFile {
  const byArea: Record<string, Record<number, number | null>> = {};
  for (const [area, n] of Object.entries(counts)) {
    if (!area) continue; // '' = nezjistitelná obec (viz poznámka u parseNrpzs) – nepatří do žádného územního celku
    byArea[area] = { [year]: n };
  }
  return {
    level,
    indicators: {
      [INDICATOR_ID]: {
        id: INDICATOR_ID,
        label: 'Místa poskytování zdravotních služeb',
        unit: 'počet',
        higherIsBetter: true,
        sourceId,
        decimals: 0,
      },
    },
    values: { [INDICATOR_ID]: byArea },
  };
}

export const nrpzs: SourceAdapter = {
  id: 'nrpzs',
  async run(ctx: SourceContext): Promise<SourceResult> {
    const { buf, url } = await fetchNrpzsCsv(ctx.now, `${ctx.rawDir}/nrpzs`);
    const { features, countsByObec, countsByOrp } = parseNrpzs(buf);
    const validFor = `${ctx.now.getUTCFullYear()}-${String(ctx.now.getUTCMonth() + 1).padStart(2, '0')}`;
    const year = ctx.now.getUTCFullYear();

    return {
      source: {
        id: 'nrpzs',
        provider: 'ÚZIS ČR – Národní registr poskytovatelů zdravotních služeb (NRPZS)',
        title: 'Národní registr poskytovatelů zdravotních služeb – místa poskytování',
        url,
        license: 'neuvedeno poskytovatelem',
        downloadedAt: ctx.now.toISOString(),
        validFor,
        status: 'ok',
        note:
          'Licence nenalezena na nrpzs.uzis.cz ani v NKOD (SPARQL data.gov.cz) – ověřeno 2026-09-27. ' +
          'Export neobsahuje ČSÚ kód obce (jen RÚIAN kód adresního místa a textový název); adaptér proto ' +
          'ponechává pole obec prázdné a obec (i ORP) doplňuje až pipeline prostorovým přiřazením bodů s GPS ' +
          'k hranicím obcí RÚIAN. Počty na úrovni ORP (ORPKod z registru) zahrnují i místa bez GPS, počty obcí jen místa s GPS.',
      },
      points: [
        { id: 'zdravotnictvi', label: 'Zdravotnická zařízení (NRPZS)', sourceId: 'nrpzs', validFor, features },
      ],
      indicators: [
        makeIndicatorFile('orp', countsByOrp, year, 'nrpzs'),
        makeIndicatorFile('obec', countsByObec, year, 'nrpzs'),
      ],
    };
  },
};
