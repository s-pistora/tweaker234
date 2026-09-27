import { describe, it, expect } from 'vitest';
import {
  valuesFor,
  latestValue,
  yearsWithData,
  fitIndicator,
  summaryLines,
} from '../../src/lib/map/values.ts';
import type { IndicatorFile } from '../../src/lib/types.ts';

const file: IndicatorFile = {
  level: 'orp',
  indicators: {
    obyvatele: { id: 'obyvatele', label: 'Počet obyvatel', unit: 'osoby', higherIsBetter: true, sourceId: 's', decimals: 0 },
    skoly: { id: 'skoly', label: 'Školy', unit: 'na 1000 obyv.', higherIsBetter: true, sourceId: 's', decimals: 2 },
  },
  values: {
    obyvatele: { A: { 2020: 100, 2021: 110 }, B: { 2020: 50, 2021: null } },
    skoly: { A: { 2024: 0.8 }, B: { 2024: null } },
  },
};

describe('values', () => {
  it('valuesFor vrací hodnotu za rok, chybějící → null', () => {
    expect(valuesFor(file, 'obyvatele', 2021)).toEqual({ A: 110, B: null });
    expect(valuesFor(file, 'neni', 2021)).toEqual({});
  });

  it('latestValue: poslední nenulová hodnota ≤ upTo, jinak poslední vůbec', () => {
    expect(latestValue({ 2020: 1, 2021: 2, 2022: null })).toEqual({ year: 2021, value: 2 });
    expect(latestValue({ 2020: 1, 2021: 2 }, 2020)).toEqual({ year: 2020, value: 1 });
    expect(latestValue({ 2024: 5 }, 2021)).toEqual({ year: 2024, value: 5 });
    expect(latestValue({ 2024: null })).toBeNull();
    expect(latestValue(undefined)).toBeNull();
  });

  it('yearsWithData', () => {
    expect(yearsWithData(file, 'obyvatele')).toEqual([2020, 2021]);
    expect(yearsWithData(undefined, 'x')).toEqual([]);
  });

  it('fitIndicator zachová ukazatel/rok, jsou-li platné, jinak spadne na výchozí', () => {
    expect(fitIndicator(file, 'skoly', 2024)).toEqual({ indicator: 'skoly', year: 2024 });
    expect(fitIndicator(file, 'skoly', 2020)).toEqual({ indicator: 'skoly', year: 2024 });
    expect(fitIndicator(file, 'mzda', 2021)).toEqual({ indicator: 'obyvatele', year: 2021 });
    expect(fitIndicator(file, 'mzda', 1999)).toEqual({ indicator: 'obyvatele', year: 2021 });
  });

  it('summaryLines: vybraný ukazatel první, max N řádků, s rokem', () => {
    const lines = summaryLines(file, 'A', 'skoly', 2024, 3);
    expect(lines[0]).toBe('Školy: 0,80 na 1000 obyv. (2024)');
    expect(lines[1]).toMatch(/^Počet obyvatel: 110 osoby \(2021\)$/);
    expect(summaryLines(file, 'B', 'skoly', 2024, 1)).toEqual(['Školy: N/A']);
  });
});
