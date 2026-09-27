import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDzCsv, datazapadAdapters, voucherYearRange } from '../scripts/sources/datazapad.ts';
import { perThousand } from '../scripts/aggregate.ts';
import { isPointLayer } from '../src/lib/types.ts';

const fx = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('parseDzCsv – zastávky (bod Abertamy)', () => {
  const features = parseDzCsv(fx('dz-zastavky.csv'), 'zastavky');

  it('BOM na začátku souboru neškodí – vrátí prvky', () => {
    expect(features.length).toBeGreaterThan(0);
  });

  it('bod Abertamy má souřadnice z WGS84 sloupců, NE z WKT (tam je lat/lon prohozeno)', () => {
    const abertamy = features.find((f) => f.name.includes('Abertamy, Barbora'));
    expect(abertamy).toBeDefined();
    expect(abertamy!.lon).toBeCloseTo(12.8636, 3);
    expect(abertamy!.lat).toBeCloseTo(50.374, 3);
    expect(abertamy!.obec).toBe('554979');
    expect(abertamy!.orp).toBe('4106');
  });

  it('všechny prvky mají korektní číselné souřadnice (nikoli prohozené o desítky stupňů)', () => {
    for (const f of features) {
      expect(f.lon).toBeGreaterThan(10);
      expect(f.lon).toBeLessThan(16);
      expect(f.lat).toBeGreaterThan(48);
      expect(f.lat).toBeLessThan(52);
    }
  });
});

describe('parseDzCsv – školy', () => {
  const features = parseDzCsv(fx('dz-skoly.csv'), 'skoly');

  it('vrátí prvky se jménem, obcí a ORP', () => {
    expect(features.length).toBeGreaterThan(0);
    for (const f of features) {
      expect(typeof f.name).toBe('string');
      expect(f.name.length).toBeGreaterThan(0);
    }
  });

  it('škola v Abertamech má obec 554979 a orp 4106', () => {
    const abertamy = features.find((f) => f.name.includes('Abertamy'));
    expect(abertamy).toBeDefined();
    expect(abertamy!.obec).toBe('554979');
    expect(abertamy!.orp).toBe('4106');
  });
});

describe('parseDzCsv – sociální služby (filtrace na CZ041)', () => {
  const features = parseDzCsv(fx('dz-soc.csv'), 'socialni');

  it('odfiltruje poskytovatele mimo Karlovarský kraj', () => {
    // fixture obsahuje 14 řádků, z toho 11 v CZ041 (zbytek Plzeňský kraj)
    expect(features.length).toBe(11);
  });

  it('žádný vrácený prvek nemá orp mimo rozsah 4101-4107', () => {
    for (const f of features) {
      if (f.orp) expect(f.orp).toMatch(/^410[1-7]$/);
    }
  });
});

describe('parseDzCsv – vouchery (přes všechny podtypy)', () => {
  it('inovační vouchery mají attrs.typ, rok, pozadovano, prideleno, uspesna', () => {
    const features = parseDzCsv(fx('dz-vouchery.csv'), 'vch-inovacni');
    expect(features.length).toBeGreaterThan(0);
    const f = features[0];
    expect(f.attrs.typ).toBe('inovacni');
    expect(typeof f.attrs.rok).toBe('number');
    expect(typeof f.attrs.pozadovano).toBe('number');
    expect(typeof f.attrs.prideleno).toBe('number');
    expect(typeof f.attrs.uspesna).toBe('boolean');
  });

  it('kreativní vouchery se parsují a mají typ kreativni', () => {
    const features = parseDzCsv(fx('dz-vouchery-kreativni.csv'), 'vch-kreativni');
    expect(features.length).toBeGreaterThan(0);
    expect(features[0].attrs.typ).toBe('kreativni');
  });

  it('asistenční vouchery se parsují a mají typ asistencni', () => {
    const features = parseDzCsv(fx('dz-vouchery-asistencni.csv'), 'vch-asistencni');
    expect(features.length).toBeGreaterThan(0);
    expect(features[0].attrs.typ).toBe('asistencni');
  });

  it('startovací vouchery 2023/2024 se parsují s rokem', () => {
    const f2023 = parseDzCsv(fx('dz-vouchery-start2023.csv'), 'vch-start2023');
    const f2024 = parseDzCsv(fx('dz-vouchery-start2024.csv'), 'vch-start2024');
    expect(f2023.length).toBeGreaterThan(0);
    expect(f2024.length).toBeGreaterThan(0);
    expect(f2023[0].attrs.rok).toBe(2023);
    expect(f2024[0].attrs.rok).toBe(2024);
  });
});

describe('parseDzCsv – zdravotnictví (nemocnice, pohotovost, ZZS)', () => {
  it('nemocnice mají souřadnice a obec/orp', () => {
    const features = parseDzCsv(fx('dz-nemocnice.csv'), 'nemocnice');
    expect(features.length).toBe(5);
    for (const f of features) {
      expect(Number.isFinite(f.lon)).toBe(true);
      expect(Number.isFinite(f.lat)).toBe(true);
      expect(f.obec).not.toBe('');
    }
  });

  it('pohotovost se parsuje (hlavička OBJEKT ID velkými písmeny)', () => {
    const features = parseDzCsv(fx('dz-pohotovost.csv'), 'pohotovost');
    expect(features.length).toBeGreaterThan(0);
  });

  it('ZZS nemá kódy obce/orp ve zdroji – ponechá je prázdné, ale prvek vrátí', () => {
    const features = parseDzCsv(fx('dz-zzs.csv'), 'zzs');
    expect(features.length).toBe(13);
    for (const f of features) {
      expect(f.orp).toBe('');
      expect(f.obec).toBe('');
      expect(Number.isFinite(f.lon)).toBe(true);
      expect(Number.isFinite(f.lat)).toBe(true);
      expect(f.lon).toBeGreaterThan(10);
      expect(f.lon).toBeLessThan(16);
    }
  });
});

describe('voucherYearRange (review finding #5 - validFor vrstvy vouchery = rok udeleni, ne rok stazeni)', () => {
  it('vrati rozsah min-max attrs.rok napric vsemi podtypy vouchery', () => {
    const inovacni = parseDzCsv(fx('dz-vouchery.csv'), 'vch-inovacni');
    const start2023 = parseDzCsv(fx('dz-vouchery-start2023.csv'), 'vch-start2023');
    const start2024 = parseDzCsv(fx('dz-vouchery-start2024.csv'), 'vch-start2024');
    const range = voucherYearRange([...inovacni, ...start2023, ...start2024], '2026');
    expect(range).toMatch(/^\d{4}–\d{4}$/);
    expect(range.endsWith('2024')).toBe(true);
  });

  it('jediny rok napric prvky -> jen ten rok (bez pomlcky)', () => {
    const features = parseDzCsv(fx('dz-vouchery-start2024.csv'), 'vch-start2024');
    expect(voucherYearRange(features, '2026')).toBe('2024');
  });

  it('zadny prvek s platnym rokem -> fallback (rok stazeni)', () => {
    expect(voucherYearRange([], '2026')).toBe('2026');
  });
});

describe('datazapadAdapters', () => {
  it('exportuje pět adaptérů: skoly, socialni, zastavky, vouchery, zdravotnictvi-kraj', () => {
    const ids = datazapadAdapters.map((a) => a.id).sort();
    expect(ids).toEqual(
      ['dz-skoly', 'dz-socialni', 'dz-zastavky', 'dz-vouchery', 'dz-zdravotnictvi-kraj'].sort(),
    );
  });

  it.skipIf(!process.env.LIVE)('LIVE: každý adaptér reálně stáhne a naparsuje svá data', async () => {
    for (const adapter of datazapadAdapters) {
      const res = await adapter.run({ rawDir: 'data-raw/_live-test', now: new Date() });
      expect(res.source.status).toBe('ok');
      expect(res.points?.[0]?.features.length ?? 0).toBeGreaterThan(0);
    }
  }, 120_000);
});

describe('perThousand – integrační sanity (Task 4 test dle zadání)', () => {
  it('perThousand({a:2},{a:0}) → {a:null}', () => {
    expect(perThousand({ a: 2 }, { a: 0 })).toEqual({ a: null });
  });
  it('perThousand({a:2},{a:null}) → {a:null}', () => {
    expect(perThousand({ a: 2 }, { a: null })).toEqual({ a: null });
  });
  it('perThousand({a:5},{a:1000}) → {a:5}', () => {
    expect(perThousand({ a: 5 }, { a: 1000 })).toEqual({ a: 5 });
  });
});

describe('typové kontrakty (sanity)', () => {
  it('vytvořená vrstva odpovídá isPointLayer', () => {
    const features = parseDzCsv(fx('dz-zastavky.csv'), 'zastavky');
    const layer = { id: 'zastavky', label: 'Zastávky', sourceId: 'dz-zastavky', validFor: '2026', features };
    expect(isPointLayer(layer)).toBe(true);
  });
});
