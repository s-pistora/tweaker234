import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { KROK_KRAJ_TO_NUTS3, buildKrokIndicatorFile } from '../scripts/sources/krok.ts';

const fx = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('KROK_KRAJ_TO_NUTS3 – mapování vlastních kódů krajů KROK na NUTS3', () => {
  it("'0410' -> 'CZ041' (Karlovarský kraj)", () => {
    expect(KROK_KRAJ_TO_NUTS3['0410']).toBe('CZ041');
  });

  it('mapování odpovídá reálnému číselníku území (fixture úryvek krok_uzemi.csv)', () => {
    const rows = Papa.parse<{ koduzemi: string; uzemi: string; typuzemi: string }>(
      fx('krok_uzemi_sample.csv').replace(/\r\n?/g, '\n'),
      { header: true, skipEmptyLines: true },
    ).data;
    const kv = rows.find((r) => r.koduzemi === '0410');
    expect(kv?.uzemi.trim()).toBe('Karlovarský kraj');
    expect(kv?.typuzemi.trim()).toBe('kraj');
    expect(KROK_KRAJ_TO_NUTS3['0410']).toBe('CZ041');

    const praha = rows.find((r) => r.koduzemi === '0110');
    expect(praha?.uzemi.trim()).toBe('Hlavní město Praha');
    expect(KROK_KRAJ_TO_NUTS3['0110']).toBe('CZ010');
  });
});

describe('buildKrokIndicatorFile – nad fixture úryvky reálných ročních dat KROK', () => {
  const file = buildKrokIndicatorFile({
    2023: fx('krok_sample_2023.csv'),
    2024: fx('krok_sample.csv'),
  });

  it('obyvatele KV kraje (kód ukazatele 020401) – shoduje se s ČSÚ DataStat PORKR01', () => {
    expect(file.values.obyvatele.CZ041[2024]).toBe(293195);
    expect(file.values.obyvatele.CZ041[2023]).toBe(295077);
  });

  it('nezaměstnanost KV kraje (kód ukazatele 060231)', () => {
    expect(file.values.nezamestnanost.CZ041[2024]).toBeCloseTo(4.85, 2);
  });

  it('mzda KV kraje (kód ukazatele 111211 – užší definice, jen stavebnictví 50+ zam.)', () => {
    expect(file.values.mzda.CZ041[2024]).toBe(40382);
  });

  it('nekrajová území (ČR/oblast/okres/ORP) se do values nedostanou', () => {
    for (const byArea of Object.values(file.values)) {
      for (const code of Object.keys(byArea)) {
        expect(code).toMatch(/^CZ0\d{2}$/);
      }
    }
  });

  it('level je kraj a všechny ukazatele mají sourceId krok', () => {
    expect(file.level).toBe('kraj');
    for (const def of Object.values(file.indicators)) expect(def.sourceId).toBe('krok');
  });
});

// Lehký živý smoke test (jen 1 rok, ne celý run() přes 2000-2025) – ověří skutečnou síť + reálný
// formát (hlavička "hodnota " s mezerou) mimo fixture.
describe.skipIf(!process.env.LIVE)('KROK – živě proti opendata.czso.cz', () => {
  it('krok_data_2024.csv: obyvatele KV kraje odpovídá ČSÚ DataStat (293195)', async () => {
    const res = await fetch('https://opendata.czso.cz/data/od_krok01/krok_data_2024.csv');
    expect(res.ok).toBe(true);
    const text = await res.text();
    const file = buildKrokIndicatorFile({ 2024: text });
    expect(file.values.obyvatele.CZ041[2024]).toBe(293195);
  }, 30_000);
});
