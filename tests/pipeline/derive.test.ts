import { describe, it, expect } from 'vitest';
import { deriveIndicators, completeRegionalNational, DERIVED } from '../../scripts/pipeline/derive.ts';
import type { IndicatorDef, IndicatorFile, PointLayer } from '../../src/lib/types.ts';

const def = (id: string, unit = 'osoby', sourceId = 'csu'): IndicatorDef => ({
  id, label: id, unit, higherIsBetter: true, sourceId, decimals: 0,
});

function pts(id: string, sourceId: string, validFor: string, list: Array<[string, string, Record<string, number>?]>): PointLayer {
  return {
    id, label: id, sourceId, validFor,
    features: list.map(([obec, orp, attrs], i) => ({ id: `${id}${i}`, name: 'x', lon: 0, lat: 0, obec, orp, attrs: attrs ?? {} })),
  };
}

const orpBase = (): IndicatorFile => ({
  level: 'orp',
  indicators: { obyvatele: def('obyvatele') },
  // 2025 poslední rok s obyvateli (vrstvy jsou validFor 2026 → použije se 2025)
  values: { obyvatele: { '4101': { 2024: 900, 2025: 1000 }, '4102': { 2025: 3000 }, '4103': { 2024: 10 } } },
});

describe('deriveIndicators', () => {
  it('počty bodů na 1000 obyvatel (rok vrstvy, populace posledního roku ≤) včetně 0 pro území bez bodů', () => {
    const skoly = pts('skoly', 'dz-skoly', '2026', [['a', '4101'], ['b', '4101'], ['c', '4102']]);
    const f = deriveIndicators(orpBase(), [skoly], { areas: ['4101', '4102', '4103'], warn: () => {} });
    expect(f.indicators.skoly_na_1000).toMatchObject({
      unit: 'na 1000 obyvatel', decimals: 2, higherIsBetter: true, sourceId: 'dz-skoly',
    });
    expect(f.values.skoly_na_1000).toEqual({
      '4101': { 2026: 2 },
      '4102': { 2026: 1 / 3 },
      '4103': { 2026: null }, // pro rok 2025 chybí populace → null, ne 0 ani Infinity
    });
    // KV průměr = součet počtů / součet populace (jen území s populací) * 1000
    expect(f.regional!.skoly_na_1000).toEqual({ 2026: (3 / 4000) * 1000 });
    expect(f.values.obyvatele).toEqual(orpBase().values.obyvatele); // vstupní ukazatele zůstanou
  });

  it('vouchery = souhrn attrs.prideleno za roky udělení na obyvatele, uložený pod posledním rokem udělení (I1)', () => {
    const v = pts('vouchery', 'dz-vouchery', '2026', [
      ['a', '4101', { prideleno: 50000, rok: 2012 }],
      ['b', '4102', { prideleno: 30000, rok: 2024 }],
    ]);
    const meta: Array<{ id: string; year: number; popYear: number; fromYear?: number }> = [];
    const f = deriveIndicators(orpBase(), [v], { areas: ['4101', '4102'], warn: () => {}, onDerived: (m) => meta.push(m) });
    expect(f.indicators.vouchery_kc_na_obyv).toMatchObject({
      label: 'Krajské vouchery 2012–2024 (souhrn, Kč na obyvatele)', decimals: 0, sourceId: 'dz-vouchery',
    });
    // populace = poslední rok ≤ 2024 → 2024 (4101: 900, 4102 nemá 2024 → null)
    expect(f.values.vouchery_kc_na_obyv).toEqual({ '4101': { 2024: 50000 / 900 }, '4102': { 2024: null } });
    expect(meta).toEqual([expect.objectContaining({ id: 'vouchery_kc_na_obyv', year: 2024, popYear: 2024, fromYear: 2012 })]);
  });

  it('KV průměr počítá VŠECHNY body (i v územích bez populace) nad populací KV (M3)', () => {
    const skoly = pts('skoly', 'dz-skoly', '2026', [['a', '4101'], ['b', '4103'], ['c', '4103']]);
    const f = deriveIndicators(orpBase(), [skoly], { areas: ['4101', '4102', '4103'], warn: () => {} });
    expect(f.values.skoly_na_1000!['4103']).toEqual({ 2026: null });
    expect(f.regional!.skoly_na_1000).toEqual({ 2026: (3 / 4000) * 1000 });
  });

  it('NRPZS: ORP bere počty z adaptéru (vč. řádků bez GPS), ne z bodů; surový ukazatel zůstane', () => {
    const base = orpBase();
    base.indicators.zdravotnicka_mista = def('zdravotnicka_mista', 'počet', 'nrpzs');
    base.values.zdravotnicka_mista = { '4101': { 2026: 10 } };
    const zdr = pts('zdravotnictvi', 'nrpzs', '2026-09', [['a', '4101']]);
    const f = deriveIndicators(base, [zdr], { areas: ['4101', '4102'], warn: () => {} });
    expect(f.values.zdravotnicka_mista).toEqual({ '4101': { 2026: 10 } });
    expect(f.values.zdravotnicka_mista_na_1000).toEqual({ '4101': { 2026: 10 }, '4102': { 2026: 0 } });
    expect(f.indicators.zdravotnicka_mista_na_1000!.sourceId).toBe('nrpzs');
  });

  it('NRPZS obec: prázdné počty adaptéru se přepočítají z (prostorově přiřazených) bodů', () => {
    const base: IndicatorFile = {
      level: 'obec',
      indicators: { obyvatele: def('obyvatele'), zdravotnicka_mista: def('zdravotnicka_mista', 'počet', 'nrpzs') },
      values: { obyvatele: { A: { 2025: 500 }, B: { 2025: 200 } }, zdravotnicka_mista: {} },
    };
    const zdr = pts('zdravotnictvi', 'nrpzs', '2026-09', [['A', '4101'], ['A', '4101'], ['B', '4101']]);
    const f = deriveIndicators(base, [zdr], { areas: ['A', 'B'], warn: () => {} });
    expect(f.values.zdravotnicka_mista).toEqual({ A: { 2026: 2 }, B: { 2026: 1 } });
    expect(f.values.zdravotnicka_mista_na_1000).toEqual({ A: { 2026: 4 }, B: { 2026: 5 } });
  });

  it('chybějící vrstva → ukazatel se nevytvoří a zaloguje se varování', () => {
    const warnings: string[] = [];
    const f = deriveIndicators(orpBase(), [], { areas: ['4101'], warn: (w) => warnings.push(w) });
    expect(Object.keys(f.indicators)).toEqual(['obyvatele']);
    expect(warnings.length).toBe(DERIVED.length);
  });
});

describe('completeRegionalNational', () => {
  const kraj: IndicatorFile = {
    level: 'kraj',
    indicators: { obyvatele: def('obyvatele'), podil_65: def('podil_65', '%') },
    values: { obyvatele: { CZ041: { 2024: 290000 }, CZ010: { 2024: 1 } }, podil_65: { CZ041: { 2024: 22.5 } } },
    national: { obyvatele: { 2024: 10900000 }, podil_65: { 2024: 20.1 } },
  };

  it('national kopíruje z kraj souboru; regional = hodnota CZ041, jinak váž. průměr pro podíly, jinak nic', () => {
    const obec: IndicatorFile = {
      level: 'obec',
      indicators: {
        obyvatele: def('obyvatele'),
        podil_65: def('podil_65', '%'),
        nezam_obec: def('nezam_obec', '%'),
        pocet_neceho: def('pocet_neceho', 'počet'),
        skoly_na_1000: def('skoly_na_1000', 'na 1000 obyvatel'),
      },
      values: {
        obyvatele: { A: { 2023: 100, 2024: 100 }, B: { 2023: 300, 2024: 300 } },
        podil_65: { A: { 2024: 10 } },
        nezam_obec: { A: { 2023: 2 }, B: { 2023: 6 } },
        pocet_neceho: { A: { 2024: 3 } },
        skoly_na_1000: { A: { 2026: 1 } },
      },
      regional: { skoly_na_1000: { 2026: 0.9 } },
    };
    const f = completeRegionalNational(obec, kraj);
    // absolutní počty (osoby/počet) se do orp/obec national nekopírují (M7)
    expect(f.national).toEqual({ podil_65: { 2024: 20.1 } });
    // absolutní počty nemají „průměr kraje“ (hodnota CZ041 je součet, ne průměr)
    expect(f.regional!.obyvatele).toBeUndefined();
    expect(f.regional!.podil_65).toEqual({ 2024: 22.5 });
    expect(f.regional!.nezam_obec).toEqual({ 2023: (2 * 100 + 6 * 300) / 400 });
    expect(f.regional!.pocet_neceho).toBeUndefined();
    expect(f.regional!.skoly_na_1000).toEqual({ 2026: 0.9 }); // existující se nepřepisuje
  });
});
