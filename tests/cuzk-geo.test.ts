import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mapshaper from 'mapshaper';
import { feature } from 'topojson-client';
import { buildGeo, type OrpCodeMapper } from '../scripts/sources/cuzk-geo.ts';

// --- offline unit test: synthetic fixture shapefiles, no network -------------------------
//
// Coordinates are real S-JTSK/Krovak (EPSG:5514) meters taken from the Karlovarský kraj
// bounding box in the actual ČÚZK VUSC_P layer, so buildGeo's hardcoded fallback proj4
// string reprojects them back into plausible Czech lon/lat instead of nonsense.

function square(x0: number, y0: number, x1: number, y1: number) {
  return {
    type: 'Polygon',
    coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
  };
}

async function writeFixtureShp(destDir: string, layer: string, fc: unknown) {
  const out = await mapshaper.applyCommands(`-i in.json -o format=shapefile encoding=win1250 ${layer}.shp`, {
    'in.json': JSON.stringify(fc),
  });
  mkdirSync(destDir, { recursive: true });
  for (const [name, buf] of Object.entries(out)) {
    writeFileSync(join(destDir, name), buf as Buffer);
  }
}

async function buildFixtureShpDir(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'cuzk-geo-fixture-'));

  await writeFixtureShp(dir, 'VUSC_P', {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { KOD: '51', NAZEV: 'Karlovarský kraj', NUTS3_KOD: 'CZ041' },
        geometry: square(-880000, -1040000, -820000, -980000),
      },
      {
        type: 'Feature',
        properties: { KOD: '60', NAZEV: 'Ústecký kraj', NUTS3_KOD: 'CZ042' },
        geometry: square(-800000, -1040000, -740000, -980000),
      },
    ],
  });

  await writeFixtureShp(dir, 'ORP_P', {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { KOD: '531', NAZEV: 'Karlovy Vary', NUTS3_KOD: 'CZ041' },
        geometry: square(-870000, -1030000, -850000, -1010000),
      },
      {
        type: 'Feature',
        properties: { KOD: '999', NAZEV: 'Jiné ORP', NUTS3_KOD: 'CZ042' },
        geometry: square(-790000, -1030000, -770000, -1010000),
      },
    ],
  });

  await writeFixtureShp(dir, 'OBCE_P', {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { KOD: '554961', NAZEV: 'Karlovy Vary', ORP_KOD: '531', VUSC_KOD: '51' },
        geometry: square(-865000, -1025000, -855000, -1015000),
      },
      {
        type: 'Feature',
        properties: { KOD: '999999', NAZEV: 'Jiná obec', ORP_KOD: '999', VUSC_KOD: '99' },
        geometry: square(-785000, -1025000, -775000, -1015000),
      },
    ],
  });

  return dir;
}

const fakeCodes: OrpCodeMapper = {
  orpRuianToCsu(kodRuian: string): string {
    if (kodRuian === '531') return '4103';
    throw new Error(`fakeCodes: unexpected RÚIAN ORP kod ${kodRuian}`);
  },
};

describe('buildGeo (synthetic fixture, offline)', () => {
  it('builds kraje/kv-orp/kv-obce with correct filtering, code mapping and parents', async () => {
    const shpDir = await buildFixtureShpDir();
    try {
      const outputs = await buildGeo(shpDir, fakeCodes);
      expect(outputs.map((o) => o.file)).toEqual(['kraje.topo.json', 'kv-orp.topo.json', 'kv-obce.topo.json']);

      const byFile = Object.fromEntries(outputs.map((o) => [o.file, o.topology]));

      const kraje = feature(byFile['kraje.topo.json'] as never, 'areas') as never as {
        features: { properties: Record<string, unknown> }[];
      };
      expect(kraje.features).toHaveLength(2); // no filter on kraje: both fixture kraje survive
      expect(kraje.features.map((f) => f.properties.code).sort()).toEqual(['CZ041', 'CZ042']);
      expect(kraje.features.every((f) => !('parent' in f.properties))).toBe(true);

      const orp = feature(byFile['kv-orp.topo.json'] as never, 'areas') as never as {
        features: { properties: Record<string, unknown> }[];
      };
      expect(orp.features).toHaveLength(1); // NUTS3_KOD=="CZ041" filter drops the CZ042 ORP
      expect(orp.features[0].properties).toEqual({ code: '4103', name: 'Karlovy Vary', parent: 'CZ041' });

      const obce = feature(byFile['kv-obce.topo.json'] as never, 'areas') as never as {
        features: { properties: Record<string, unknown> }[];
      };
      expect(obce.features).toHaveLength(1); // VUSC_KOD=="51" filter drops the other obec
      expect(obce.features[0].properties).toEqual({ code: '554961', name: 'Karlovy Vary', parent: '4103' });
    } finally {
      rmSync(shpDir, { recursive: true, force: true });
    }
  });
});

// --- tests over the real generated files (skipped until the live pipeline has run) -------

const GEO_DIR = 'public/data/geo';
const files = {
  kraje: join(GEO_DIR, 'kraje.topo.json'),
  kvOrp: join(GEO_DIR, 'kv-orp.topo.json'),
  kvObce: join(GEO_DIR, 'kv-obce.topo.json'),
};
const haveGenerated = Object.values(files).every(existsSync);

function readTopoFeatures(path: string) {
  const topo = JSON.parse(readFileSync(path, 'utf8'));
  return (feature(topo, 'areas') as never as { features: { properties: Record<string, unknown>; geometry: unknown }[] })
    .features;
}

function allCoordsLonLat(geometry: unknown): [number, number][] {
  const coords: [number, number][] = [];
  const walk = (g: unknown): void => {
    if (Array.isArray(g)) {
      if (typeof g[0] === 'number' && typeof g[1] === 'number') {
        coords.push([g[0] as number, g[1] as number]);
      } else {
        for (const child of g) walk(child);
      }
    }
  };
  walk((geometry as { coordinates: unknown }).coordinates);
  return coords;
}

describe.skipIf(!haveGenerated)('generated geo files (real ČÚZK RÚIAN data)', () => {
  it('kraje.topo.json has all 14 kraje under 150 KB', () => {
    expect(statSync(files.kraje).size).toBeLessThan(150 * 1024);
    const feats = readTopoFeatures(files.kraje);
    expect(feats).toHaveLength(14);
    for (const f of feats) {
      expect(typeof f.properties.code).toBe('string');
      expect(typeof f.properties.name).toBe('string');
    }
  });

  it('kv-orp.topo.json has the 7 KV ORP with ČSÚ codes 4101..4107 and intact diacritics', () => {
    const feats = readTopoFeatures(files.kvOrp);
    expect(feats).toHaveLength(7);
    const codes = feats.map((f) => f.properties.code).sort();
    expect(codes).toEqual(['4101', '4102', '4103', '4104', '4105', '4106', '4107']);
    expect(feats.every((f) => f.properties.parent === 'CZ041')).toBe(true);
    expect(feats.some((f) => f.properties.name === 'Mariánské Lázně')).toBe(true);
  });

  it('kv-obce.topo.json has the 134 KV obce under 300 KB, each with a KV ORP parent', () => {
    expect(statSync(files.kvObce).size).toBeLessThan(300 * 1024);
    const feats = readTopoFeatures(files.kvObce);
    expect(feats).toHaveLength(134);
    const kvOrpCodes = new Set(['4101', '4102', '4103', '4104', '4105', '4106', '4107']);
    for (const f of feats) {
      expect(typeof f.properties.code).toBe('string');
      expect(typeof f.properties.name).toBe('string');
      expect(kvOrpCodes.has(f.properties.parent as string)).toBe(true);
    }
  });

  it('all coordinates across the three layers fall within Czech lon/lat bounds', () => {
    for (const path of Object.values(files)) {
      const feats = readTopoFeatures(path);
      for (const f of feats) {
        for (const [lon, lat] of allCoordsLonLat(f.geometry)) {
          expect(lon).toBeGreaterThanOrEqual(12);
          expect(lon).toBeLessThanOrEqual(19);
          expect(lat).toBeGreaterThanOrEqual(48.5);
          expect(lat).toBeLessThanOrEqual(51.1);
        }
      }
    }
  });
});
