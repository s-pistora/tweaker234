import { describe, it, expect } from 'vitest';
import { mergeIndicatorFiles, fillMissingYears, restrictAreas } from '../../scripts/pipeline/merge.ts';
import type { IndicatorDef, IndicatorFile } from '../../src/lib/types.ts';

const def = (id: string, sourceId: string): IndicatorDef => ({
  id, label: id, unit: 'x', higherIsBetter: true, sourceId, decimals: 0,
});

describe('mergeIndicatorFiles', () => {
  it('sjednotí ukazatele ze všech zdrojů; konflikt id → první vyhrává + varování', () => {
    const a: IndicatorFile = {
      level: 'orp',
      indicators: { obyvatele: def('obyvatele', 'csu') },
      values: { obyvatele: { '4103': { 2024: 100 } } },
      regional: { obyvatele: { 2024: 1000 } },
    };
    const b: IndicatorFile = {
      level: 'orp',
      indicators: { obyvatele: def('obyvatele', 'jiny'), zdravotnicka_mista: def('zdravotnicka_mista', 'nrpzs') },
      values: { obyvatele: { '4103': { 2024: 999 } }, zdravotnicka_mista: { '4103': { 2026: 5 } } },
      national: { obyvatele: { 2024: 5 } },
    };
    const warnings: string[] = [];
    const m = mergeIndicatorFiles('orp', [a, b], (w) => warnings.push(w));
    expect(m.level).toBe('orp');
    expect(Object.keys(m.indicators).sort()).toEqual(['obyvatele', 'zdravotnicka_mista']);
    expect(m.indicators.obyvatele!.sourceId).toBe('csu');
    expect(m.values.obyvatele).toEqual({ '4103': { 2024: 100 } });
    expect(m.values.zdravotnicka_mista).toEqual({ '4103': { 2026: 5 } });
    expect(m.regional).toEqual({ obyvatele: { 2024: 1000 } });
    // national pro konfliktní id pochází jen od vítěze (a ten žádné nemá)
    expect(m.national?.obyvatele).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('obyvatele');
  });

  it('ignoruje soubory jiné úrovně', () => {
    const k: IndicatorFile = { level: 'kraj', indicators: { x: def('x', 's') }, values: { x: {} } };
    const m = mergeIndicatorFiles('obec', [k], () => {});
    expect(m.indicators).toEqual({});
  });
});

describe('fillMissingYears', () => {
  it('doplní chybějící roky ze sekundárního zdroje, nikdy nepřepíše primární hodnotu', () => {
    const primary: IndicatorFile = {
      level: 'kraj',
      indicators: { obyvatele: def('obyvatele', 'csu'), mzda: def('mzda', 'csu') },
      values: {
        obyvatele: { CZ041: { 2024: 100, 2023: null } },
        mzda: { CZ041: { 2024: 40000 } },
      },
    };
    const secondary: IndicatorFile = {
      level: 'kraj',
      indicators: { obyvatele: def('obyvatele', 'krok'), mzda: def('mzda', 'krok') },
      values: {
        obyvatele: { CZ041: { 2024: 101, 2023: 99, 2010: 90 }, CZ010: { 2010: 5 } },
        mzda: { CZ041: { 2010: 20000 } },
      },
    };
    const { file, filled } = fillMissingYears(primary, secondary, ['obyvatele']);
    expect(file.values.obyvatele).toEqual({ CZ041: { 2024: 100, 2023: 99, 2010: 90 }, CZ010: { 2010: 5 } });
    expect(file.values.mzda).toEqual({ CZ041: { 2024: 40000 } }); // mimo seznam ids – nesahá se
    expect(filled).toEqual({ obyvatele: [2010, 2023] });
    expect(primary.values.obyvatele!.CZ041![2023]).toBeNull(); // bez mutace vstupu
  });
});

describe('restrictAreas', () => {
  it('odstraní území mimo povolenou množinu a vrátí jejich počet', () => {
    const f: IndicatorFile = {
      level: 'obec',
      indicators: { x: def('x', 's') },
      values: { x: { A: { 2024: 1 }, '': { 2024: 2 }, Z: { 2024: 3 } } },
    };
    const { file, removed } = restrictAreas(f, new Set(['A']));
    expect(file.values.x).toEqual({ A: { 2024: 1 } });
    expect(removed).toEqual(['', 'Z']);
  });
});
