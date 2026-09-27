import { describe, it, expect } from 'vitest';
import { asciiBar, ageGroups, seriesPoints } from '../../src/lib/map/charts.ts';
import type { IndicatorDef } from '../../src/lib/types.ts';

const d = (id: string, label = id): IndicatorDef => ({ id, label, unit: '%', higherIsBetter: true, sourceId: 's', decimals: 1 });

describe('asciiBar', () => {
  it('plné bloky + zlomkový znak, délka ≤ width', () => {
    expect(asciiBar(10, 10, 8)).toBe('████████');
    expect(asciiBar(0, 10, 8)).toBe('');
    expect(asciiBar(5, 10, 8)).toBe('████');
    expect(asciiBar(5.5, 10, 8)).toMatch(/^████[▓▒░]$/);
    expect(asciiBar(20, 10, 8).length).toBe(8);
  });
  it('nevalidní vstup → prázdný řetězec', () => {
    expect(asciiBar(NaN, 10, 8)).toBe('');
    expect(asciiBar(5, 0, 8)).toBe('');
  });
});

describe('ageGroups', () => {
  it('najde podil_* věkové skupiny, seřadí od nejstarší', () => {
    const g = ageGroups({ podil_0_14: d('podil_0_14', '0–14'), podil_65: d('podil_65', '65+'), mzda: d('mzda') });
    expect(g.map((x) => x.id)).toEqual(['podil_65', 'podil_0_14']);
  });
  it('bez skupin → prázdné pole', () => {
    expect(ageGroups({ obyvatele: d('obyvatele'), podil_nezam: d('podil_nezam') })).toEqual([]);
  });
});

describe('seriesPoints', () => {
  it('rozdělí řadu na souvislé úseky podle null a namapuje do rozměrů', () => {
    const r = seriesPoints({ 2020: 0, 2021: 10, 2022: null, 2023: 5 }, [2020, 2023], [0, 10], 30, 10);
    expect(r).toEqual([
      [[0, 10], [10, 0]],
      [[30, 5]],
    ]);
  });
});
