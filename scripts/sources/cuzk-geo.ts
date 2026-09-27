// ČÚZK RÚIAN – hranice krajů, ORP a obcí -> public/data/geo/{kraje,kv-orp,kv-obce}.topo.json
//
// Zdroj: https://services.cuzk.gov.cz/shp/stat/epsg-5514/1.zip (SHP, S-JTSK/Krovak EPSG:5514,
// DBF v CP1250). Soubor má ~251 MB, ale obsahuje desítky vrstev – stahujeme přes zip-range.ts
// jen VUSC_P (14 krajů), ORP_P (206 ORP) a OBCE_P (6258 obcí), každou jen s .shp/.shx/.dbf.
//
// Kódy: kraje používají NUTS3_KOD přímo jako `code`. ORP a obce v RÚIAN mají jiné číslování
// než ČSÚ – převod zajišťuje `OrpCodeMapper.orpRuianToCsu` (viz koordinátorovo rozhodnutí:
// tohle je zúžený `Pick<Codes,'orpRuianToCsu'>`, aby cuzk-geo.ts nezávisel na scripts/codes.ts,
// který píše jiná větev).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import mapshaper from 'mapshaper';
import { extractEntries } from '../zip-range.ts';
import type { GeoOutput, SourceAdapter, SourceContext, SourceResult } from './types.ts';

const ZIP_URL = 'https://services.cuzk.gov.cz/shp/stat/epsg-5514/1.zip';
const CIS65_URL = 'https://apl2.czso.cz/iSMS/do_cis_export?kodcis=65&typdat=0&cisjaz=203&format=2&separator=%2C';

const KV_NUTS3 = 'CZ041';
const KV_VUSC_KOD = '51';

// .prj sidecar in the ČÚZK export uses an ESRI WKT name ("S-JTSK_Krovak_East_North") that
// mapshaper's WKT parser doesn't recognize, so we always override the source CRS with this
// verified proj4 string instead of relying on auto-detection.
const KROVAK_PROJ4 =
  '+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 ' +
  '+x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480 +units=m +no_defs';

/** Narrow view of `Codes` (from the coordinator's scripts/codes.ts) that this module needs. */
export interface OrpCodeMapper {
  orpRuianToCsu(kodRuian: string): string;
}

interface AreaProps {
  code: string;
  name: string;
  parent?: string;
}

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown }[];
};

async function importLayer(
  shpDir: string,
  layer: string,
  opts: { filter?: string; simplifyPct: number },
): Promise<GeoJsonFeatureCollection> {
  const read = (ext: string) => readFileSync(join(shpDir, `${layer}${ext}`));
  const filterPart = opts.filter ? ` -filter '${opts.filter}'` : '';
  const cmd =
    `-i in.shp encoding=win1250${filterPart} ` +
    `-proj wgs84 init="${KROVAK_PROJ4}" ` +
    `-simplify ${opts.simplifyPct}% keep-shapes ` +
    `-o format=geojson out.json`;
  const out = await mapshaper.applyCommands(cmd, {
    'in.shp': read('.shp'),
    'in.shx': read('.shx'),
    'in.dbf': read('.dbf'),
  });
  return JSON.parse(out['out.json'].toString());
}

function remapFeatures(
  fc: GeoJsonFeatureCollection,
  toProps: (dbfProps: Record<string, unknown>) => AreaProps,
): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      type: 'Feature',
      properties: toProps(f.properties) as unknown as Record<string, unknown>,
      geometry: f.geometry,
    })),
  };
}

/** Builds one TopoJSON object named `areas`, preserving shared borders (topology arcs). */
async function toTopology(fc: GeoJsonFeatureCollection): Promise<unknown> {
  const out = await mapshaper.applyCommands('-i in.json name=areas -o format=topojson out.json', {
    'in.json': JSON.stringify(fc),
  });
  return JSON.parse(out['out.json'].toString());
}

/**
 * Turns extracted VUSC_P/ORP_P/OBCE_P shapefile components (as produced by zip-range's
 * `extractEntries`, flattened into `<layer>.shp/.shx/.dbf` under `shpDir`) into the three
 * geo outputs: all 14 kraje, the 7 ORP of Karlovarský kraj, and its 134 obce.
 */
export async function buildGeo(shpDir: string, codes: OrpCodeMapper): Promise<GeoOutput[]> {
  const krajeGeo = await importLayer(shpDir, 'VUSC_P', { simplifyPct: 2 });
  const krajeFc = remapFeatures(krajeGeo, (p) => ({
    code: String(p.NUTS3_KOD),
    name: String(p.NAZEV),
  }));

  const orpGeo = await importLayer(shpDir, 'ORP_P', {
    filter: `NUTS3_KOD=="${KV_NUTS3}"`,
    simplifyPct: 5,
  });
  const orpFc = remapFeatures(orpGeo, (p) => ({
    code: codes.orpRuianToCsu(String(p.KOD)),
    name: String(p.NAZEV),
    parent: KV_NUTS3,
  }));

  const obceGeo = await importLayer(shpDir, 'OBCE_P', {
    filter: `VUSC_KOD=="${KV_VUSC_KOD}"`,
    simplifyPct: 5,
  });
  const obceFc = remapFeatures(obceGeo, (p) => ({
    code: String(p.KOD),
    name: String(p.NAZEV),
    parent: codes.orpRuianToCsu(String(p.ORP_KOD)),
  }));

  return [
    { file: 'kraje.topo.json', topology: await toTopology(krajeFc) },
    { file: 'kv-orp.topo.json', topology: await toTopology(orpFc) },
    { file: 'kv-obce.topo.json', topology: await toTopology(obceFc) },
  ];
}

function parseCsvLine(line: string): string[] {
  // ČSÚ číselník export: double-quoted CSV, "" as the escaped quote, no embedded newlines.
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Small standalone helper (not scripts/codes.ts, which the coordinator owns on another
 * branch) that fetches ČSÚ číselník 65 (CISORP) and builds an OrpCodeMapper from its
 * `kod_ruian` column to its `chodnota` column. Good enough to run this adapter on its own;
 * the coordinator can swap in codes.ts later if it provides an equivalent mapping.
 */
export async function loadOrpMapperFromCis65(rawDir: string): Promise<OrpCodeMapper> {
  const res = await fetch(CIS65_URL);
  if (!res.ok) throw new Error(`cuzk-geo: failed to fetch číselník 65 (HTTP ${res.status})`);
  const text = await res.text();

  try {
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, 'cis65-cisorp.csv'), text);
  } catch {
    // best effort only – provenance copy, not required for the mapping itself
  }

  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const ruianIdx = header.indexOf('kod_ruian');
  const chodnotaIdx = header.indexOf('chodnota');
  if (ruianIdx < 0 || chodnotaIdx < 0) {
    throw new Error('cuzk-geo: číselník 65 export is missing kod_ruian/chodnota columns');
  }

  const byRuian = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const ruian = cols[ruianIdx];
    if (ruian) byRuian.set(ruian, cols[chodnotaIdx]);
  }

  return {
    orpRuianToCsu(kodRuian: string): string {
      const csu = byRuian.get(kodRuian);
      if (!csu) throw new Error(`cuzk-geo: no ČSÚ ORP code found for RÚIAN kod ${kodRuian}`);
      return csu;
    },
  };
}

async function resolveValidFor(now: Date): Promise<string> {
  const res = await fetch(ZIP_URL, { method: 'HEAD' });
  const lastModified = res.headers.get('last-modified');
  if (lastModified) {
    const d = new Date(lastModified);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

/**
 * Builds the `cuzk-ruian-hranice` SourceAdapter. `getCodes` is injected so this module
 * doesn't depend on the (separately developed) scripts/codes.ts: pass
 * `loadOrpMapperFromCis65` for a standalone run, or a codes.ts-backed loader once available.
 */
export function makeCuzkGeo(getCodes: (rawDir: string) => Promise<OrpCodeMapper>): SourceAdapter {
  return {
    id: 'cuzk-ruian-hranice',
    async run(ctx: SourceContext): Promise<SourceResult> {
      const shpDir = join(ctx.rawDir, 'shp');
      const layers = ['VUSC_P', 'ORP_P', 'OBCE_P'];
      const names = layers.flatMap((l) => [`1/${l}.shp`, `1/${l}.shx`, `1/${l}.dbf`]);

      const [validFor, codes] = await Promise.all([resolveValidFor(ctx.now), getCodes(ctx.rawDir)]);
      await extractEntries(ZIP_URL, names, shpDir);
      const geo = await buildGeo(shpDir, codes);

      return {
        source: {
          id: 'cuzk-ruian-hranice',
          provider: 'Český úřad zeměměřický a katastrální (ČÚZK)',
          title: 'RÚIAN – hranice krajů, ORP a obcí (SHP, EPSG:5514)',
          url: ZIP_URL,
          license: 'CC BY 4.0',
          downloadedAt: ctx.now.toISOString(),
          validFor,
          status: 'ok',
        },
        geo,
      };
    },
  };
}

/** Default adapter for production wiring (update-data.ts). */
export const cuzkGeo: SourceAdapter = makeCuzkGeo(loadOrpMapperFromCis65);
