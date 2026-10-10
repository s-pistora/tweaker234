import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_BEHU, isZmenyFile, porovnej, pripisBeh, rozdilZaznamu } from '../src/lib/zmeny.ts';

const json = (p: string) => JSON.parse(readFileSync(`public/data/${p}`, 'utf8'));

const obor = (izo: string, mist: number, nazev = 'Strojník') => ({
  izo,
  kodOboru: '23-51-H/01',
  forma: 'denní',
  delka: 'tříleté',
  nazevOboru: nazev,
  skola: `Škola ${izo}, příspěvková organizace`,
  zamer: { 2026: mist },
});

describe('porovnání snapshotů', () => {
  it('stejná data → žádné změny (reálný snapshot)', () => {
    const soubory = {
      'skoly/obory.json': json('skoly/obory.json'),
      'penize/penize.json': json('penize/penize.json'),
      'points/vouchery.json': json('points/vouchery.json'),
      'points/zastavky.json': json('points/zastavky.json'),
      'indicators/obec.json': json('indicators/obec.json'),
      'vylety/mista.json': json('vylety/mista.json'),
      'podnikani/podnikani.json': json('podnikani/podnikani.json'),
    };
    expect(porovnej(soubory, structuredClone(soubory))).toEqual([]);
  });

  it('obory: nový, zrušený a změna počtu míst', () => {
    const z = porovnej(
      { 'skoly/obory.json': { obory: [obor('1', 30), obor('2', 20)], poradny: [] } },
      { 'skoly/obory.json': { obory: [obor('1', 24), obor('3', 15, 'Kuchař')], poradny: [{ nazev: 'PPP Cheb' }] } },
    );
    const vety = z.map((x) => x.veta).join('\n');
    expect(z.every((x) => x.oblast === 'Střední školy')).toBe(true);
    expect(vety).toContain('Nově v datech: 1 obor – Kuchař (Škola 3)');
    expect(vety).toContain('Už v datech není: 1 obor – Strojník (Škola 2)');
    expect(vety).toContain('Strojník (Škola 1) 30 → 24');
    expect(vety).toContain('1 poradna – PPP Cheb');
  });

  it('vouchery: součet přidělených u nových žádostí', () => {
    const v = (id: string, prideleno: number, uspesna = true) => ({ id, name: id, attrs: { prideleno, uspesna } });
    const z = porovnej(
      { 'points/vouchery.json': { features: [v('a', 1)] } },
      { 'points/vouchery.json': { features: [v('a', 1), v('b', 150000), v('c', 50000), v('d', 9, false)] } },
    );
    expect(z).toEqual([{ oblast: 'Peníze kraje', veta: expect.stringMatching(/^Přibyly 3 žádosti o voucher \(přiděleno celkem 200\s000 Kč\)\.$/) }]);
  });

  it('projekty: skončený projekt; ukazatele: nový rok dat', () => {
    const z = porovnej(
      {
        'penize/penize.json': { projekty: [{ id: 'p', nazev: 'Silnice', stav: 'probiha' }] },
        'indicators/obec.json': { indicators: { obyvatele: { label: 'Počet obyvatel' } }, values: { obyvatele: { A: { 2024: 1 } } } },
      },
      {
        'penize/penize.json': { projekty: [{ id: 'p', nazev: 'Silnice', stav: 'ukonceno' }] },
        'indicators/obec.json': { indicators: { obyvatele: { label: 'Počet obyvatel' } }, values: { obyvatele: { A: { 2024: 1, 2025: 2 } } } },
      },
    );
    expect(z.map((x) => x.veta)).toEqual(['Skončil 1 projekt: Silnice.', 'Nová data za obce: Počet obyvatel (2025).']);
  });

  it('bodová vrstva, která v minulé verzi nebyla: všechny body jsou nové, víc než 3 se zkrátí', () => {
    const f = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `Zastávka ${id}` }));
    const [z] = porovnej({}, { 'points/zastavky.json': { label: 'Autobusové zastávky', features: f } });
    expect(z.oblast).toBe('Autobusové zastávky');
    expect(z.veta).toBe('Nově v datech: 5 záznamů – Zastávka a, Zastávka b, Zastávka c a 2 další.');
  });

  it('rozdilZaznamu', () => {
    const r = rozdilZaznamu([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], (z) => String(z.id));
    expect(r.nove).toEqual([{ id: 3 }]);
    expect(r.zrusene).toEqual([{ id: 1 }]);
    expect(r.spolecne).toHaveLength(1);
  });
});

describe('historie běhů', () => {
  it('prázdný běh se nepřipíše, historie má nejvýš MAX_BEHU běhů od nejnovějšího', () => {
    let f = pripisBeh(null, { datum: 'x', zmeny: [] });
    expect(f.behy).toEqual([]);
    for (let i = 0; i < MAX_BEHU + 5; i++) f = pripisBeh(f, { datum: String(i), zmeny: [{ oblast: 'a', veta: 'b' }] });
    expect(f.behy).toHaveLength(MAX_BEHU);
    expect(f.behy[0].datum).toBe(String(MAX_BEHU + 4));
    expect(isZmenyFile(f)).toBe(true);
    expect(isZmenyFile({ behy: [{ datum: 1 }] })).toBe(false);
  });
});
