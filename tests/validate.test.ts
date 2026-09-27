import { describe, it, expect } from 'vitest';
import { crossCheck, validateCounts } from '../scripts/validate.ts';
import type { IndicatorFile } from '../src/lib/types.ts';

function makeFile(level: 'kraj' | 'orp' | 'obec', obyvatele: Record<string, Record<number, number | null>>): IndicatorFile {
  return {
    level,
    indicators: {
      obyvatele: { id: 'obyvatele', label: 'Počet obyvatel', unit: 'osoby', higherIsBetter: true, sourceId: 'x', decimals: 0 },
    },
    values: { obyvatele },
  };
}

function topoWith(n: number) {
  return { objects: { areas: { geometries: Array.from({ length: n }, (_, i) => ({ properties: { code: String(i) } })) } } };
}

describe('validateCounts', () => {
  it('vše v pořádku (14/7/134) → žádné chyby', () => {
    const kraj = makeFile('kraj', Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`K${i}`, { 2024: 1 }])));
    const orp = makeFile('orp', Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`O${i}`, { 2024: 1 }])));
    const obec = makeFile('obec', Object.fromEntries(Array.from({ length: 134 }, (_, i) => [`B${i}`, { 2024: 1 }])));
    const errors = validateCounts({ kraj, orp, obec }, { kraje: topoWith(14), kvOrp: topoWith(7), kvObce: topoWith(134) });
    expect(errors).toEqual([]);
  });

  it('hlásí chybu při 13 krajích (v datech)', () => {
    const kraj = makeFile('kraj', Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`K${i}`, { 2024: 1 }])));
    const orp = makeFile('orp', Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`O${i}`, { 2024: 1 }])));
    const obec = makeFile('obec', Object.fromEntries(Array.from({ length: 134 }, (_, i) => [`B${i}`, { 2024: 1 }])));
    const errors = validateCounts({ kraj, orp, obec }, { kraje: topoWith(13), kvOrp: topoWith(7), kvObce: topoWith(134) });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('13'))).toBe(true);
  });

  it('hlásí chybu, když si data a geodata neodpovídají (i kdyby jedno z nich bylo 14)', () => {
    const kraj = makeFile('kraj', Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`K${i}`, { 2024: 1 }])));
    const orp = makeFile('orp', Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`O${i}`, { 2024: 1 }])));
    const obec = makeFile('obec', Object.fromEntries(Array.from({ length: 134 }, (_, i) => [`B${i}`, { 2024: 1 }])));
    const errors = validateCounts({ kraj, orp, obec }, { kraje: topoWith(13), kvOrp: topoWith(7), kvObce: topoWith(134) });
    expect(errors.some((e) => e.toLowerCase().includes('geodata'))).toBe(true);
  });
});

describe('crossCheck', () => {
  const primary = makeFile('kraj', { CZ041: { 2024: 293195 } });

  it('shoda (stejná hodnota) → ok:true, žádné diffy', () => {
    const secondary = makeFile('kraj', { CZ041: { 2024: 293195 } });
    const r = crossCheck(primary, secondary, ['obyvatele']);
    expect(r.ok).toBe(true);
    expect(r.diffs).toEqual([]);
  });

  it('odchylka přesně na hranici tolerance (0,5 %) → ok:true', () => {
    const secondary = makeFile('kraj', { CZ041: { 2024: 293195 * 1.004 } });
    const r = crossCheck(primary, secondary, ['obyvatele'], 0.005);
    expect(r.ok).toBe(true);
  });

  it('odchylka 1 % → ok:false a diff obsahuje rel≈0.01', () => {
    const secondary = makeFile('kraj', { CZ041: { 2024: 293195 * 1.01 } });
    const r = crossCheck(primary, secondary, ['obyvatele'], 0.005);
    expect(r.ok).toBe(false);
    expect(r.diffs).toHaveLength(1);
    expect(r.diffs[0]).toMatchObject({ id: 'obyvatele', area: 'CZ041', year: 2024 });
    expect(r.diffs[0].rel).toBeCloseTo(0.01, 2);
  });

  it('chybějící hodnota v jednom ze zdrojů se přeskočí (není to diff)', () => {
    const secondary = makeFile('kraj', { CZ041: { 2024: null } });
    const r = crossCheck(primary, secondary, ['obyvatele']);
    expect(r.ok).toBe(true);
  });

  it('ukazatel, který v secondary vůbec není, se přeskočí', () => {
    const secondary = makeFile('kraj', { CZ041: { 2024: 293195 } });
    const r = crossCheck(primary, secondary, ['obyvatele', 'neexistujici']);
    expect(r.ok).toBe(true);
  });
});
