import { describe, it, expect } from 'vitest';
import { kartaObce, kartaDoRadku, radaUkazatele } from '../src/lib/karta.ts';
import { proZakyZeZs } from '../src/lib/skoly.ts';
import { realnaData } from './helpers/snapshot.ts';
import type { IndicatorFile } from '../src/lib/types.ts';

describe('radaUkazatele', () => {
  it('první a poslední rok s číslem (null se přeskočí)', () => {
    const f = { values: { x: { A: { 2020: null, 2021: 5, 2023: 7, 2024: null } } } } as unknown as IndicatorFile;
    expect(radaUkazatele(f, 'x', 'A')).toEqual({ prvni: { rok: 2021, v: 5 }, posledni: { rok: 2023, v: 7 } });
    expect(radaUkazatele(f, 'x', 'B')).toEqual({ prvni: null, posledni: null });
  });
});

describe('karta obce nad reálnými daty', () => {
  it('Cheb: všechny sekce, čísla bez NaN', async () => {
    const { snap, ctx, names } = await realnaData();
    const obory = (snap.skoly?.obory ?? []).filter(proZakyZeZs);
    const k = kartaObce({ snap, ctx, kod: '554481', orpNazev: 'Cheb', obory });
    expect(k.nazev).toBe(names['554481']);
    expect(k.sekce.map((s) => s.id)).toEqual(['lide', 'sluzby', 'skoly', 'penize', 'urady']);
    expect(k.shrnuti.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(k)).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('všech 134 obcí: karta se sestaví a CSV má řádky', async () => {
    const { snap, ctx, names } = await realnaData();
    const obory = (snap.skoly?.obory ?? []).filter(proZakyZeZs);
    expect(Object.keys(names)).toHaveLength(134);
    for (const kod of Object.keys(names)) {
      const k = kartaObce({ snap, ctx, kod, orpNazev: '', obory });
      expect(JSON.stringify(k)).not.toMatch(/NaN|undefined|Infinity/);
      expect(kartaDoRadku(k).length).toBeGreaterThan(3);
    }
  }, 30000);
});
