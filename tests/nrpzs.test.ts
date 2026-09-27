import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { nrpzsUrl, parseNrpzs, nrpzs, makeIndicatorFile } from '../scripts/sources/nrpzs.ts';
import { isIndicatorFile, isPointLayer } from '../src/lib/types.ts';

describe('nrpzsUrl', () => {
  it('sestaví URL pro aktuální měsíc', () => {
    expect(nrpzsUrl(new Date('2026-09-27'))).toBe('https://nrpzs.uzis.cz/res/file/export/export-2026-09.csv');
  });

  it('monthsBack=1 posune měsíc zpět', () => {
    expect(nrpzsUrl(new Date('2026-09-27'), 1)).toBe('https://nrpzs.uzis.cz/res/file/export/export-2026-08.csv');
  });

  it('monthsBack přes hranici roku', () => {
    expect(nrpzsUrl(new Date('2026-01-15'), 1)).toBe('https://nrpzs.uzis.cz/res/file/export/export-2025-12.csv');
  });
});

describe('parseNrpzs', () => {
  const buf = readFileSync('tests/fixtures/nrpzs_sample.csv');
  const { features, countsByObec, countsByOrp } = parseNrpzs(buf);

  it('dekóduje CP1250 – attrs.obecNazev obsahuje správně "Mariánské Lázně"', () => {
    const mlFeature = features.find((f) => String(f.attrs.obecNazev ?? '').includes('Mariánské Lázně'));
    expect(mlFeature).toBeDefined();
  });

  it('řádky s prázdným GPS jsou vynechány z features', () => {
    for (const f of features) {
      expect(Number.isFinite(f.lon)).toBe(true);
      expect(Number.isFinite(f.lat)).toBe(true);
    }
  });

  it('řádky s prázdným GPS jsou přesto započítány do countsByOrp/countsByObec', () => {
    const totalFeatureCount = features.length;
    const totalOrpCount = Object.values(countsByOrp).reduce((a, b) => a + b, 0);
    expect(totalOrpCount).toBeGreaterThan(totalFeatureCount);
  });

  it('souřadnice jsou v rozumném rozsahu pro ČR (lon 10-16, lat 48-52)', () => {
    for (const f of features) {
      expect(f.lon).toBeGreaterThan(10);
      expect(f.lon).toBeLessThan(16);
      expect(f.lat).toBeGreaterThan(48);
      expect(f.lat).toBeLessThan(52);
    }
  });

  it('vrací platné PointFeature (kontrakt)', () => {
    const layer = { id: 'zdravotnictvi', label: 'x', sourceId: 'nrpzs', validFor: '2026', features };
    expect(isPointLayer(layer)).toBe(true);
  });
});

describe('nrpzs adapter', () => {
  it('má id "nrpzs"', () => {
    expect(nrpzs.id).toBe('nrpzs');
  });

  it.skipIf(!process.env.LIVE)('LIVE: stáhne a naparsuje reálný export (1380 míst v KV)', async () => {
    const res = await nrpzs.run({ rawDir: 'data-raw/_live-test', now: new Date() });
    expect(res.source.status).toBe('ok');
    expect(res.points?.[0]?.features.length).toBeGreaterThan(1000);
    expect(res.indicators?.length).toBe(2);
  }, 60_000);
});

describe('makeIndicatorFile', () => {
  const buf = readFileSync('tests/fixtures/nrpzs_sample.csv');
  const { countsByOrp, countsByObec } = parseNrpzs(buf);

  it('vytvoří platný IndicatorFile pro úroveň orp s indikátorem zdravotnicka_mista', () => {
    const file = makeIndicatorFile('orp', countsByOrp, 2026, 'nrpzs');
    expect(isIndicatorFile(file)).toBe(true);
    expect(file.level).toBe('orp');
    expect(file.indicators.zdravotnicka_mista).toEqual({
      id: 'zdravotnicka_mista',
      label: 'Místa poskytování zdravotních služeb',
      unit: 'počet',
      higherIsBetter: true,
      sourceId: 'nrpzs',
      decimals: 0,
    });
    const total = Object.values(file.values.zdravotnicka_mista!).reduce((a, byYear) => a + (byYear[2026] ?? 0), 0);
    expect(total).toBe(Object.values(countsByOrp).reduce((a, b) => a + b, 0));
  });

  it('vytvoří platný IndicatorFile i pro úroveň obec (i když může být prázdný – NRPZS bez ČSÚ kódu obce)', () => {
    const file = makeIndicatorFile('obec', countsByObec, 2026, 'nrpzs');
    expect(isIndicatorFile(file)).toBe(true);
    expect(file.level).toBe('obec');
  });
});
