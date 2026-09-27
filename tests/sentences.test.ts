import { describe, it, expect } from 'vitest';
import { describe as describeSentence, formatValue } from '../src/lib/sentences.ts';
import type { IndicatorDef } from '../src/lib/types.ts';

const obyvatele: IndicatorDef = {
  id: 'obyvatele',
  label: 'Počet obyvatel',
  unit: 'osoby',
  higherIsBetter: true,
  sourceId: 'fixture',
  decimals: 0,
};

const nezamestnanost: IndicatorDef = {
  id: 'nezamestnanost',
  label: 'Podíl nezaměstnaných',
  unit: '%',
  higherIsBetter: false,
  sourceId: 'fixture',
  decimals: 1,
};

describe('formatValue', () => {
  it('cs-CZ format s nezalomitelnou mezerou v tisicich', () => {
    expect(formatValue(293195, obyvatele)).toBe('293 195');
  });

  it('respektuje pocet desetinnych mist z def.decimals', () => {
    expect(formatValue(4.6, nezamestnanost)).toBe('4,6');
  });

  it('null -> N/A (nikdy NaN/Infinity)', () => {
    expect(formatValue(null, obyvatele)).toBe('N/A');
  });

  it('NaN/Infinity vstup -> N/A', () => {
    expect(formatValue(NaN, obyvatele)).toBe('N/A');
    expect(formatValue(Infinity, obyvatele)).toBe('N/A');
  });
});

describe('describe (sablonove vety)', () => {
  it.each([
    { v: 92, ref: 100, expectSub: 'je o 8 % pod průměrem ČR' },
    { v: 101, ref: 100, expectSub: 'je přibližně na úrovni průměru ČR' },
  ])('hodnota $v vs ref $ref obsahuje "$expectSub"', ({ v, ref, expectSub }) => {
    const series = { 2024: v };
    const refSeries = { 2024: ref };
    const text = describeSentence(nezamestnanost, series, refSeries, 2024);
    expect(text).toContain(expectSub);
  });

  it('trend: rozdil pred 5 lety -10 %, ted -8 % -> "zmensil o 2 procentni body"', () => {
    const series = { 2019: 90, 2024: 92 };
    const ref = { 2019: 100, 2024: 100 };
    const text = describeSentence(nezamestnanost, series, ref, 2024, 'průměrem ČR', 5);
    expect(text).toContain('Rozdíl se za 5 let zmenšil o 2 procentní body');
  });

  it('trend: rozdil se muze i zvetsit ("zvětšil")', () => {
    const series = { 2019: 95, 2024: 92 };
    const ref = { 2019: 100, 2024: 100 };
    // 2019: (95-100)/100*100 = -5 %; 2024: (92-100)/100*100 = -8 % -> magnituda 5 -> 8, zvetsila se o 3
    const text = describeSentence(nezamestnanost, series, ref, 2024, 'průměrem ČR', 5);
    expect(text).toContain('Rozdíl se za 5 let zvětšil o 3 procentní body');
  });

  it('rok bez hodnoty -> "Údaj za rok 2019 není k dispozici."', () => {
    const series = { 2020: 5, 2021: 4.9 };
    const text = describeSentence(nezamestnanost, series, { 2019: 3 }, 2019);
    expect(text).toBe('Údaj za rok 2019 není k dispozici.');
  });

  it('bez ref -> jen hodnota s rokem, zadne srovnani', () => {
    const series = { 2024: 293195 };
    const text = describeSentence(obyvatele, series, undefined, 2024);
    expect(text).toContain('2024');
    expect(text).toContain('293 195');
    expect(text).not.toContain('%');
    expect(text).not.toContain('průměr');
  });

  it('refLabel "prumerem kraje" -> "na urovni prumeru kraje"', () => {
    const series = { 2024: 100.5 };
    const ref = { 2024: 100 };
    const text = describeSentence(nezamestnanost, series, ref, 2024, 'průměrem kraje');
    expect(text).toContain('na úrovni průměru kraje');
  });

  it('nikdy neprodukuje NaN/Infinity text', () => {
    const series = { 2024: 5 };
    const ref = { 2024: 0 }; // deleni nulou by jinak davalo Infinity
    const text = describeSentence(nezamestnanost, series, ref, 2024);
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Infinity');
  });
});
