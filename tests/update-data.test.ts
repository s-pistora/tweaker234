import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPipeline } from '../scripts/update-data.ts';
import type { SourceAdapter, SourceResult } from '../scripts/sources/types.ts';
import type { IndicatorFile, Manifest, SourceEntry } from '../src/lib/types.ts';
import { isIndicatorFile, isManifest, isPointLayer } from '../src/lib/types.ts';

// ---------- syntetická (offline) data splňující počty 14 / 7 / 134 ----------
const KRAJE = ['CZ010', 'CZ020', 'CZ031', 'CZ032', 'CZ041', 'CZ042', 'CZ051', 'CZ052', 'CZ053', 'CZ063', 'CZ064', 'CZ071', 'CZ072', 'CZ080'];
const ORP = ['4101', '4102', '4103', '4104', '4105', '4106', '4107'];
const OBCE = Array.from({ length: 134 }, (_, i) => ({ code: String(500000 + i), parent: ORP[i % 7]! }));
/** Obec i = čtverec 0,1° × 0,1° na [i*0,1; 0] (ve směru hodinových ručiček). */
const center = (i: number): [number, number] => [i * 0.1 + 0.05, 0.05];

function squaresTopology(props: Array<{ code: string; name?: string; parent?: string }>) {
  const s = 0.1;
  return {
    type: 'Topology',
    arcs: props.map((_, i) => [[i * s, 0], [i * s, s], [i * s + s, s], [i * s + s, 0], [i * s, 0]]),
    objects: {
      areas: {
        type: 'GeometryCollection',
        geometries: props.map((p, i) => ({ type: 'Polygon', arcs: [[i]], properties: { name: p.code, ...p } })),
      },
    },
  };
}

const entry = (id: string, provider: string, license = 'CC BY 4.0'): SourceEntry => ({
  id, provider, title: `Datová sada ${id}`, url: `https://example.test/${id}`, license,
  downloadedAt: '2026-09-27T20:00:00.000Z', validFor: '2025', status: 'ok',
});

const d = (id: string, sourceId: string, unit = 'osoby') => ({ id, label: id, unit, higherIsBetter: true, sourceId, decimals: 0 });

function csuFiles(): IndicatorFile[] {
  const kraj: IndicatorFile = {
    level: 'kraj',
    indicators: { obyvatele: d('obyvatele', 'csu-datastat') },
    values: { obyvatele: Object.fromEntries(KRAJE.map((k) => [k, { 2024: 100000, 2025: 100000 }])) },
    national: { obyvatele: { 2024: 1400000, 2025: 1400000 } },
  };
  const orp: IndicatorFile = {
    level: 'orp',
    indicators: { obyvatele: d('obyvatele', 'csu-datastat') },
    values: { obyvatele: Object.fromEntries(ORP.map((o) => [o, { 2025: 19142 }])) },
  };
  const obec: IndicatorFile = {
    level: 'obec',
    indicators: { obyvatele: d('obyvatele', 'csu-datastat') },
    values: { obyvatele: Object.fromEntries(OBCE.map((o) => [o.code, { 2025: 1000 }])) },
  };
  return [kraj, orp, obec];
}

const csu: SourceAdapter = {
  id: 'csu-datastat',
  run: async () => ({ source: entry('csu-datastat', 'Český statistický úřad'), indicators: csuFiles() }),
};

function krokAdapter(value2024: number): SourceAdapter {
  return {
    id: 'krok',
    run: async (): Promise<SourceResult> => ({
      source: entry('krok', 'Český statistický úřad (KROK)'),
      indicators: [
        {
          level: 'kraj',
          indicators: { obyvatele: d('obyvatele', 'krok'), mzda: d('mzda', 'krok', 'Kč') },
          values: {
            obyvatele: Object.fromEntries(KRAJE.map((k) => [k, { 2010: 90000, 2024: k === 'CZ041' ? value2024 : 100000 }])),
            mzda: { CZ041: { 2024: 1 } },
          },
        },
      ],
    }),
  };
}

function geoAdapter(obceCount = 134): SourceAdapter {
  return {
    id: 'cuzk-ruian-hranice',
    run: async () => ({
      source: entry('cuzk-ruian-hranice', 'Český úřad zeměměřický a katastrální (ČÚZK)'),
      geo: [
        { file: 'kraje.topo.json', topology: squaresTopology(KRAJE.map((code) => ({ code }))) },
        { file: 'kv-orp.topo.json', topology: squaresTopology(ORP.map((code) => ({ code, parent: 'CZ041' }))) },
        { file: 'kv-obce.topo.json', topology: squaresTopology(OBCE.slice(0, obceCount)) },
      ],
    }),
  };
}

const skoly: SourceAdapter = {
  id: 'dz-skoly',
  run: async () => ({
    source: entry('dz-skoly', 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)', 'CC0 1.0'),
    points: [
      {
        id: 'skoly', label: 'Školy', sourceId: 'dz-skoly', validFor: '2026',
        features: [
          { id: 's1', name: 'Škola 1', lon: center(0)[0], lat: center(0)[1], obec: '', orp: '', attrs: {} },
          { id: 's2', name: 'Škola 2', lon: center(0)[0], lat: center(0)[1], obec: '', orp: '4101', attrs: {} },
          { id: 's3', name: 'Škola 3', lon: center(8)[0], lat: center(8)[1], obec: '500008', orp: '4102', attrs: {} },
          { id: 's4', name: 'Mimo KV', lon: 50, lat: 50, obec: '', orp: '', attrs: {} },
        ],
      },
    ],
  }),
};

const broken = (id: string): SourceAdapter => ({
  id,
  run: async () => {
    throw new Error('HTTP 503 Service Unavailable');
  },
});

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

let outDir: string;
let rawDir: string;
beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'kt-out-'));
  rawDir = mkdtempSync(join(tmpdir(), 'kt-raw-'));
});

// Každý test spouští celou pipeline (i dvakrát) – pod zátěží celé sady může přesáhnout výchozích 5 s.
vi.setConfig({ testTimeout: 30_000 });

const quiet = { log: () => {} };

describe('runPipeline – úspěšný běh', () => {
  it('zapíše manifest, ukazatele, body, geodata a SOURCES.md; spojí body s obcemi a odvodí ukazatele', async () => {
    const sourcesMdPath = join(outDir, 'SOURCES.md');
    const res = await runPipeline([csu, krokAdapter(100000), skoly, geoAdapter()], {
      outDir, rawDir, prevManifest: null, sourcesMdPath, ...quiet,
    });
    expect(res.errors).toEqual([]);
    expect(res.manifest.map((s) => [s.id, s.status])).toEqual([
      ['csu-datastat', 'ok'], ['krok', 'ok'], ['dz-skoly', 'ok'], ['cuzk-ruian-hranice', 'ok'],
    ]);

    const manifest = read(join(outDir, 'manifest.json'));
    expect(isManifest(manifest)).toBe(true);
    expect(manifest.files).toEqual({
      indicators: { kraj: 'indicators/kraj.json', orp: 'indicators/orp.json', obec: 'indicators/obec.json' },
      points: { skoly: 'points/skoly.json' },
      geo: { kraje: 'geo/kraje.topo.json', 'kv-orp': 'geo/kv-orp.topo.json', 'kv-obce': 'geo/kv-obce.topo.json' },
    });
    for (const rel of [...Object.values(manifest.files.indicators), ...Object.values(manifest.files.points), ...Object.values(manifest.files.geo)] as string[]) {
      expect(existsSync(join(outDir, rel))).toBe(true);
    }

    // body: 3 v KV (2 doplněny bodovým dotazem), 1 mimo zahozen
    const pts = read(join(outDir, 'points/skoly.json'));
    expect(isPointLayer(pts)).toBe(true);
    expect(pts.features.map((f: { obec: string; orp: string }) => [f.obec, f.orp])).toEqual([
      ['500000', '4101'], ['500000', '4101'], ['500008', '4102'],
    ]);
    expect(res.joinStats.skoly).toEqual({ total: 4, joined: 2, dropped: 1, unchanged: 1 });
    expect(res.manifest.find((s) => s.id === 'dz-skoly')!.note).toBe(
      'Pipeline: vrstva skoly – obec/ORP doplněny prostorovým přiřazením k hranicím obcí RÚIAN u 2 z 4 bodů, 1 bodů mimo Karlovarský kraj vyřazeno. ' +
        'Pipeline: ukazatel skoly_na_1000 = počet bodů podle stavu registru k datu stažení (2026-09-27) na 1000 obyvatel ' +
        'podle ČSÚ k 31. 12. 2025 (poslední dostupný rok).',
    );

    const obec = read(join(outDir, 'indicators/obec.json'));
    expect(isIndicatorFile(obec)).toBe(true);
    expect(obec.values.skoly_na_1000['500000']).toEqual({ 2026: 2 });
    expect(obec.values.skoly_na_1000['500001']).toEqual({ 2026: 0 });
    expect(obec.regional.skoly_na_1000[2026]).toBeCloseTo((3 / (7 * 19142)) * 1000, 5); // populace KV z ORP
    expect(obec.regional.obyvatele).toBeUndefined(); // absolutní počet nemá „průměr kraje“

    const orp = read(join(outDir, 'indicators/orp.json'));
    expect(orp.values.skoly_na_1000['4101'][2026]).toBeCloseTo((2 / 19142) * 1000, 5);
    // M3: KV průměr je na ORP i obcích stejný (počty ze všech bodů / populace KV z ORP)
    expect(obec.regional.skoly_na_1000).toEqual(orp.regional.skoly_na_1000);
    // M7: absolutní počty za ČR se do orp/obec nekopírují
    expect(obec.national?.obyvatele).toBeUndefined();
    // M4: temp adresář zápisu leží mimo public/ (v rawDir) a je uklizený
    expect(readdirSync(join(rawDir, '.tmp-write'))).toEqual([]);

    // KROK: doplní chybějící roky obyvatel (2010), mzdu nepřebírá (jen stavebnictví)
    const kraj = read(join(outDir, 'indicators/kraj.json'));
    expect(kraj.values.obyvatele.CZ041).toEqual({ 2010: 90000, 2024: 100000, 2025: 100000 });
    expect(kraj.indicators.mzda).toBeUndefined();
    expect(kraj.indicators.obyvatele.sourceId).toBe('csu-datastat');

    const md = readFileSync(sourcesMdPath, 'utf8');
    expect(md).toContain('Hodnoty z Karlovarského kraje: CC0/CC BY 4.0');
    expect(readdirSync(outDir).filter((n) => n.startsWith('.tmp'))).toEqual([]);
  });
});

describe('runPipeline – selhání zdroje', () => {
  it('adaptér, který vyhodí → záznam z prevManifest se status stale, jeho soubory se nepřepíšou', async () => {
    const first = await runPipeline([csu, krokAdapter(100000), skoly, geoAdapter()], { outDir, rawDir, prevManifest: null, ...quiet });
    expect(first.errors).toEqual([]);
    const prevManifest = read(join(outDir, 'manifest.json')) as Manifest;
    const skolyPath = join(outDir, 'points/skoly.json');
    const before = readFileSync(skolyPath, 'utf8');
    const mtimeBefore = statSync(skolyPath).mtimeMs;
    const geoBefore = readFileSync(join(outDir, 'geo/kv-obce.topo.json'), 'utf8');

    const res = await runPipeline([csu, krokAdapter(100000), broken('dz-skoly'), broken('cuzk-ruian-hranice')], {
      outDir, rawDir, prevManifest, ...quiet,
    });
    expect(res.errors).toEqual([]);
    const stale = res.manifest.find((s) => s.id === 'dz-skoly')!;
    const prevEntry = prevManifest.sources.find((s) => s.id === 'dz-skoly')!;
    // M1: původní poznámka zdroje zůstane za chybovou hláškou
    expect(prevEntry.note).toBeTruthy();
    expect(stale).toEqual({ ...prevEntry, status: 'stale', note: `HTTP 503 Service Unavailable; ${prevEntry.note}` });
    expect(res.manifest.find((s) => s.id === 'cuzk-ruian-hranice')!.status).toBe('stale');

    const manifest = read(join(outDir, 'manifest.json')) as Manifest;
    expect(manifest.sources.find((s) => s.id === 'dz-skoly')!.status).toBe('stale');
    expect(manifest.files.points.skoly).toBe('points/skoly.json');
    expect(manifest.files.geo['kv-obce']).toBe('geo/kv-obce.topo.json');
    expect(readFileSync(skolyPath, 'utf8')).toBe(before);
    expect(statSync(skolyPath).mtimeMs).toBe(mtimeBefore);
    expect(readFileSync(join(outDir, 'geo/kv-obce.topo.json'), 'utf8')).toBe(geoBefore);
    // ukazatel odvozený z ponechaných bodů je stále k dispozici
    const obec = read(join(outDir, 'indicators/obec.json'));
    expect(obec.values.skoly_na_1000['500000']).toEqual({ 2026: 2 });
  });

  it('selhaný adaptér bez předchozího snapshotu → stale záznam s poznámkou, běh doběhne, pokud validace projde', async () => {
    const res = await runPipeline([csu, krokAdapter(100000), broken('dz-skoly'), geoAdapter()], {
      outDir, rawDir, prevManifest: null, ...quiet,
    });
    expect(res.errors).toEqual([]);
    const e = res.manifest.find((s) => s.id === 'dz-skoly')!;
    expect(e.status).toBe('stale');
    expect(e.note).toBe('HTTP 503 Service Unavailable');
    const manifest = read(join(outDir, 'manifest.json')) as Manifest;
    expect(manifest.files.points).toEqual({});
  });
});

describe('runPipeline – selhání validace', () => {
  it('cross-check DataStat × KROK nad tolerancí → errors s vysvětlením, nic se nezapíše', async () => {
    const res = await runPipeline([csu, krokAdapter(101000), skoly, geoAdapter()], { outDir, rawDir, prevManifest: null, ...quiet });
    expect(res.errors.length).toBeGreaterThan(0);
    const msg = res.errors.join('\n');
    expect(msg).toContain('obyvatele');
    expect(msg).toContain('CZ041');
    expect(msg).toContain('2024');
    expect(msg).toContain('100000');
    expect(msg).toContain('101000');
    expect(msg).toContain('1,00 %');
    expect(readdirSync(outDir)).toEqual([]);
  });

  it('špatný počet obcí → errors, předchozí snapshot zůstane beze změny', async () => {
    await runPipeline([csu, krokAdapter(100000), skoly, geoAdapter()], { outDir, rawDir, prevManifest: null, ...quiet });
    const manifestBefore = readFileSync(join(outDir, 'manifest.json'), 'utf8');
    const prevManifest = JSON.parse(manifestBefore) as Manifest;
    const res = await runPipeline([csu, krokAdapter(100000), skoly, geoAdapter(133)], { outDir, rawDir, prevManifest, ...quiet });
    expect(res.errors.join('\n')).toContain('134');
    expect(readFileSync(join(outDir, 'manifest.json'), 'utf8')).toBe(manifestBefore);
    expect(readdirSync(outDir).filter((n) => n.startsWith('.tmp'))).toEqual([]);
  });
});
