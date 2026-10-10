import { describe, it, expect } from 'vitest';
import { SLUZBY, nejlepsiMista, pokryti } from '../src/lib/bilamista.ts';
import { deti, detiPodleOrp, indexyOrp, rizikoveObory, rocniZmena, souhrnVyhledu, tridaVyhledu, vyhledOboru } from '../src/lib/odhad.ts';
import { proZakyZeZs } from '../src/lib/skoly.ts';
import { realnaData } from './helpers/snapshot.ts';
import type { IndicatorFile, Obor } from '../src/lib/types.ts';

describe('bílá místa nad reálnými daty', () => {
  it('nabízí služby s měřením vzdálenosti, mezi nimi praktického lékaře', () => {
    expect(SLUZBY.map((s) => s.id)).toContain('lekar');
    expect(SLUZBY.length).toBeGreaterThan(5);
  });

  it('pokrytí: součet obyvatel nad hranicí odpovídá obcím, víc km = méně lidí mimo', async () => {
    const { ctx } = await realnaData();
    const p5 = pokryti(ctx, 'lekar', 5);
    const p10 = pokryti(ctx, 'lekar', 10);
    const mimo = p5.obce.filter((o) => o.km !== null && o.km > 5).reduce((a, o) => a + o.obyvatel, 0);
    expect(p5.mimo).toBe(mimo);
    expect(p10.mimo).toBeLessThanOrEqual(p5.mimo);
    expect(p5.celkem).toBeGreaterThan(250000);
    // seřazeno od nejvzdálenější
    expect(p5.obce[0].km!).toBeGreaterThanOrEqual(p5.obce[1].km!);
  });

  it('návrhy: každý pomůže lidem nad hranicí a přínos neroste', async () => {
    const { ctx } = await realnaData();
    for (const s of ['lekar', 'lekarna', 'materska-skola']) {
      const n = nejlepsiMista(ctx, s, 5, 3);
      expect(n.length).toBeGreaterThan(0);
      for (let i = 1; i < n.length; i++) expect(n[i].pomuze).toBeLessThanOrEqual(n[i - 1].pomuze);
      expect(n.every((x) => x.pomuze > 0 && x.obce.length > 0)).toBe(true);
      expect(new Set(n.map((x) => x.kod)).size).toBe(n.length);
    }
  });

  it('velká hranice → nikdo mimo a žádné návrhy', async () => {
    const { ctx } = await realnaData();
    expect(nejlepsiMista(ctx, 'zakladni-skola', 30)).toEqual([]);
  });
});

describe('výhled oborů', () => {
  const file = {
    values: {
      obyvatele: { A: { 2020: 1000, 2021: 1000, 2022: 1000 }, B: { 2020: 500, 2021: 500, 2022: 500 } },
      podil_0_14: { A: { 2020: 20, 2021: 18, 2022: 16 }, B: { 2020: 10, 2021: 10, 2022: null } },
    },
  } as unknown as IndicatorFile;

  it('děti = obyvatelé × podíl; chybějící rok v ORP se vynechá', () => {
    expect(deti(file, 'A', 2020)).toBe(200);
    expect(deti(file, 'B', 2022)).toBeNull();
    const d = detiPodleOrp(file, { A: 'X', B: 'X' });
    expect(d.X).toEqual({ 2020: 250, 2021: 230 });
  });

  it('roční změna z lineárního trendu', () => {
    expect(rocniZmena({ 2020: 100, 2021: 90, 2022: 80 })).toBeCloseTo(-10 / 90, 6);
    expect(rocniZmena({ 2020: 100, 2021: 90 })).toBeNull();
    expect(indexyOrp({ X: { 2020: 100, 2021: 100, 2022: 100 } }).X).toBe(1);
  });

  const o = (izo: string, prijato: number | null, mist: number, skupina = '23', orp = 'X') =>
    ({ izo, kodOboru: `${skupina}-51-H/01`, forma: 'denní', skupina, orp, prijato2025: prijato, zamer: { 2026: mist }, nazevOboru: izo, skola: izo }) as unknown as Obor;

  it('odhad = přijatí × index, třídy a rizika', () => {
    const v = vyhledOboru([o('a', 10, 30), o('b', 40, 30), o('c', null, 30), o('d', 20, 0), o('e', 25, 30, '79')], { X: 0.9 });
    expect(v.map((x) => x.obor.izo)).toEqual(['a', 'b', 'e']);
    expect(v[0].odhad).toBeCloseTo(9);
    expect(v[0].trida).toBe('poloprazdny');
    expect(v[1].trida).toBe('pretlak');
    expect(tridaVyhledu(0.85)).toBe('ok');
    expect(rizikoveObory(v, 'poloprazdny').map((x) => x.obor.izo)).toEqual(['a']);
    const sk = souhrnVyhledu(v, 'skupina');
    expect(sk.find((x) => x.klic === '23')!.mist).toBe(60);
  });

  it('reálná data: indexy pro všech 7 ORP v rozumném rozsahu, odhad bez NaN', async () => {
    const { snap, orp } = await realnaData();
    const ix = indexyOrp(detiPodleOrp(snap.indicators.obec, orp));
    expect(Object.keys(ix)).toHaveLength(7);
    for (const v of Object.values(ix)) {
      expect(v).toBeGreaterThan(0.85);
      expect(v).toBeLessThan(1.15);
    }
    const v = vyhledOboru((snap.skoly?.obory ?? []).filter(proZakyZeZs), ix);
    expect(v.length).toBeGreaterThan(50);
    expect(v.every((x) => Number.isFinite(x.odhad) && Number.isFinite(x.pomer))).toBe(true);
  });
});
