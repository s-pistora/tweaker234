// Generuje malá FIKTIVNÍ data dle kontraktu do public/data/_fixtures/ (jen pro vývoj a testy).
// Hodnoty nejsou reálná data – sourceId je vždy 'fixture'.
import { writeFileSync, mkdirSync } from 'node:fs';
import mapshaper from 'mapshaper';

const out = 'public/data/_fixtures';
const sq = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const fc = (features: { props: Record<string, string>; geom: unknown }[]) => ({
  type: 'FeatureCollection',
  features: features.map((f) => ({ type: 'Feature', properties: f.props, geometry: f.geom })),
});

const geo = {
  kraje: fc([
    { props: { code: 'CZ041', name: 'Karlovarský kraj (fixture)' }, geom: sq(12.1, 49.9, 13.2, 50.45) },
    { props: { code: 'CZ042', name: 'Ústecký kraj (fixture)' }, geom: sq(13.2, 50.1, 14.6, 50.9) },
    { props: { code: 'CZ032', name: 'Plzeňský kraj (fixture)' }, geom: sq(12.4, 49.1, 13.9, 49.9) },
  ]),
  'kv-orp': fc([
    { props: { code: '4102', name: 'Cheb (fixture)', parent: 'CZ041' }, geom: sq(12.1, 49.9, 12.6, 50.45) },
    { props: { code: '4103', name: 'Karlovy Vary (fixture)', parent: 'CZ041' }, geom: sq(12.6, 49.9, 13.2, 50.45) },
  ]),
  'kv-obce': fc([
    { props: { code: '554481', name: 'Cheb (fixture)', parent: '4102' }, geom: sq(12.1, 49.9, 12.6, 50.45) },
    { props: { code: '554961', name: 'Karlovy Vary (fixture)', parent: '4103' }, geom: sq(12.6, 50.15, 13.2, 50.45) },
    { props: { code: '555215', name: 'Nejdek (fixture)', parent: '4103' }, geom: sq(12.6, 49.9, 13.2, 50.15) },
  ]),
};

mkdirSync(`${out}/geo`, { recursive: true });
mkdirSync(`${out}/indicators`, { recursive: true });
mkdirSync(`${out}/points`, { recursive: true });

for (const [name, g] of Object.entries(geo)) {
  const res = await mapshaper.applyCommands(`-i in.json name=areas -o format=topojson out.json`, {
    'in.json': JSON.stringify(g),
  });
  writeFileSync(`${out}/geo/${name}.topo.json`, res['out.json'].toString());
}

const def = (id: string, label: string, unit: string, higherIsBetter: boolean, decimals: number) => ({
  id, label, unit, higherIsBetter, sourceId: 'fixture', decimals,
});
const series = (base: number, step: number) =>
  Object.fromEntries([2020, 2021, 2022, 2023, 2024].map((y, i) => [y, +(base + i * step).toFixed(2)]));

const kraj = {
  level: 'kraj',
  indicators: {
    obyvatele: def('obyvatele', 'Počet obyvatel', 'osoby', true, 0),
    nezamestnanost: def('nezamestnanost', 'Podíl nezaměstnaných', '%', false, 1),
    mzda: def('mzda', 'Průměrná hrubá mzda', 'Kč', true, 0),
  },
  values: {
    obyvatele: { CZ041: series(300000, -1500), CZ042: series(820000, -2000), CZ032: series(590000, 1000) },
    nezamestnanost: { CZ041: series(5.0, -0.1), CZ042: series(6.0, -0.2), CZ032: { ...series(3.0, 0), 2024: null } },
    mzda: { CZ041: series(30000, 2000), CZ042: series(32000, 2100), CZ032: series(34000, 2200) },
  },
  national: {
    obyvatele: series(10700000, 20000),
    nezamestnanost: series(3.8, 0),
    mzda: series(36000, 2500),
  },
};
const orp = {
  level: 'orp',
  indicators: {
    obyvatele: def('obyvatele', 'Počet obyvatel', 'osoby', true, 0),
    skoly: def('skoly', 'Školy na 1000 obyvatel', 'na 1000 obyv.', true, 2),
  },
  values: {
    obyvatele: { '4102': series(50000, -200), '4103': series(88000, -400) },
    skoly: { '4102': { 2024: 0.8 }, '4103': { 2024: 0.9 } },
  },
  national: { obyvatele: series(10700000, 20000) },
  regional: { obyvatele: series(69000, -300), skoly: { 2024: 0.85 } },
};
const obec = {
  level: 'obec',
  indicators: {
    obyvatele: def('obyvatele', 'Počet obyvatel', 'osoby', true, 0),
    skoly: def('skoly', 'Školy na 1000 obyvatel', 'na 1000 obyv.', true, 2),
  },
  values: {
    obyvatele: { '554481': series(31000, -100), '554961': series(46000, -300), '555215': series(7500, -50) },
    skoly: { '554481': { 2024: 0.9 }, '554961': { 2024: 1.1 }, '555215': { 2024: null } },
  },
  regional: { obyvatele: series(28000, -150) },
};
for (const [lvl, f] of Object.entries({ kraj, orp, obec })) {
  writeFileSync(`${out}/indicators/${lvl}.json`, JSON.stringify(f, null, 1));
}

const skoly = {
  id: 'skoly',
  label: 'Školy (fixture)',
  sourceId: 'fixture',
  validFor: '2026',
  features: [
    { id: 's1', name: 'ZŠ Fixture 1', lon: 12.87, lat: 50.23, obec: '554961', orp: '4103', attrs: { typ: 'ZŠ' } },
    { id: 's2', name: 'MŠ Fixture 2', lon: 12.37, lat: 50.08, obec: '554481', orp: '4102', attrs: { typ: 'MŠ' } },
  ],
};
writeFileSync(`${out}/points/skoly.json`, JSON.stringify(skoly, null, 1));

const now = '2026-09-27T00:00:00.000Z';
const manifest = {
  updatedAt: now,
  sources: [
    {
      id: 'fixture',
      provider: 'FIKTIVNÍ TESTOVACÍ DATA',
      title: 'Fixtures pro vývoj – nejde o reálná data',
      url: 'about:blank',
      license: 'n/a',
      downloadedAt: now,
      validFor: '2024',
      status: 'ok',
    },
  ],
  files: {
    indicators: { kraj: 'indicators/kraj.json', orp: 'indicators/orp.json', obec: 'indicators/obec.json' },
    points: { skoly: 'points/skoly.json' },
    geo: { kraje: 'geo/kraje.topo.json', 'kv-orp': 'geo/kv-orp.topo.json', 'kv-obce': 'geo/kv-obce.topo.json' },
  },
};
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log('fixtures written');
