// Ciste funkce pro rezim "Kde by se mi dobre zilo?" (vazene skore z percentilu).
import { describe, it, expect } from 'vitest';
import { percentileRank, score, eligibleIndicators } from '../src/lib/score.ts';
import type { IndicatorFile } from '../src/lib/types.ts';

describe('percentileRank', () => {
  it('3 území, higherIsBetter=true → percentily [0,50,100]', () => {
    expect(percentileRank({ a: 10, b: 20, c: 30 }, true)).toEqual({ a: 0, b: 50, c: 100 });
  });

  it('higherIsBetter=false → inverze pořadí', () => {
    expect(percentileRank({ a: 10, b: 20, c: 30 }, false)).toEqual({ a: 100, b: 50, c: 0 });
  });

  it('shodné hodnoty dostanou stejný (průměrný) percentil', () => {
    // sorted: a=10 (rank0), b=10 (rank0) -> avg rank 0.5; c=30 (rank2). n=3, n-1=2.
    expect(percentileRank({ a: 10, b: 10, c: 30 }, true)).toEqual({ a: 25, b: 25, c: 100 });
  });

  it('n=1 → 100 (bez ohledu na higherIsBetter)', () => {
    expect(percentileRank({ a: 42 }, true)).toEqual({ a: 100 });
    expect(percentileRank({ a: 42 }, false)).toEqual({ a: 100 });
  });

  it('n=0 (vše null) → nic k výpočtu, null zůstává null', () => {
    expect(percentileRank({ a: null, b: null }, true)).toEqual({ a: null, b: null });
  });

  it('chybějící (null) hodnota → null, ostatní se počítají mezi sebou', () => {
    expect(percentileRank({ a: 10, b: null, c: 30 }, true)).toEqual({ a: 0, b: null, c: 100 });
  });
});

describe('eligibleIndicators', () => {
  it('vyloučí "obyvatele" a ukazatele s jednotkou "počet" nebo "osoby" (absolutní počty, ne kritéria "životní úrovně", review finding #2)', () => {
    const file: IndicatorFile = {
      level: 'kraj',
      indicators: {
        obyvatele: {
          id: 'obyvatele',
          label: 'Počet obyvatel',
          unit: 'osoby',
          higherIsBetter: true,
          sourceId: 's',
          decimals: 0,
        },
        pocetSkol: {
          id: 'pocetSkol',
          label: 'Počet škol',
          unit: 'počet',
          higherIsBetter: true,
          sourceId: 's',
          decimals: 0,
        },
        uchazeci: {
          id: 'uchazeci',
          label: 'Uchazeči o zaměstnání',
          unit: 'osoby',
          higherIsBetter: false,
          sourceId: 's',
          decimals: 0,
        },
        nezamestnanost: {
          id: 'nezamestnanost',
          label: 'Podíl nezaměstnaných',
          unit: '%',
          higherIsBetter: false,
          sourceId: 's',
          decimals: 1,
        },
      },
      values: {},
    };
    expect(eligibleIndicators(file).map((d) => d.id)).toEqual(['nezamestnanost']);
  });
});

function makeFile(): IndicatorFile {
  return {
    level: 'kraj',
    indicators: {
      a: { id: 'a', label: 'A', unit: 'j', higherIsBetter: true, sourceId: 's', decimals: 0 },
      b: { id: 'b', label: 'B', unit: 'j', higherIsBetter: false, sourceId: 's', decimals: 0 },
      c: { id: 'c', label: 'C', unit: 'j', higherIsBetter: true, sourceId: 's', decimals: 0 },
    },
    values: {
      // 'a' má data ve dvou letech - poslední rok s daty je 2024, bez ohledu na
      // globálně vybraný rok předaný do score().
      a: {
        X: { 2020: 5, 2024: 10 },
        Y: { 2020: 15, 2024: 20 },
        Z: { 2020: 25, 2024: 30 },
      },
      // 'b' má data jen za 2023 (jiný "poslední rok" než 'a') a chybí pro Z.
      b: {
        X: { 2023: 5 },
        Y: { 2023: 15 },
        Z: { 2023: null },
      },
      // 'c' není v žádném testu vážené - slouží jen k tomu, aby území 'W' bylo
      // součástí souboru, i když nemá žádnou hodnotu pro 'a' ani 'b'.
      c: {
        W: { 2024: 1 },
      },
    },
  };
}

describe('score', () => {
  it('používá poslední rok s daty KAŽDÉHO ukazatele, ne globálně vybraný rok', () => {
    const file = makeFile();
    const out = score(file, 2000 /* rok bez jakýchkoli dat */, { a: 1, b: 1 });
    // 'a' 2024: X=10,Y=20,Z=30 -> percentily 0,50,100
    // 'b' 2023 (higherIsBetter:false): X=5,Y=15,Z=null -> X nejnižší=nejlepší=100, Y=0, Z chybí
    expect(out.X.score).toBe(50); // (0+100)/2
    expect(out.Y.score).toBe(25); // (50+0)/2
    expect(out.Z.score).toBe(100); // jen 'a' (b vynechán), (100)/1
    expect(out.Z.skipped).toEqual(['b']);
  });

  it('váhy {a:1,b:0} = jen a (b úplně vynechán, ne jen s nulovou vahou)', () => {
    const file = makeFile();
    const out = score(file, 2024, { a: 1, b: 0 });
    expect(out.X.parts).toEqual([{ id: 'a', p: 0, w: 1 }]);
    expect(out.Y.parts).toEqual([{ id: 'a', p: 50, w: 1 }]);
    expect(out.Z.parts).toEqual([{ id: 'a', p: 100, w: 1 }]);
    expect(out.X.skipped).toEqual([]);
    expect(out.X.score).toBe(0);
    expect(out.Z.score).toBe(100);
  });

  it('chybějící hodnota → ukazatel je ve `skipped` a váhy se renormalizují', () => {
    const file = makeFile();
    const out = score(file, 2024, { a: 1, b: 1 });
    expect(out.Z.skipped).toEqual(['b']);
    expect(out.Z.parts).toEqual([{ id: 'a', p: 100, w: 1 }]);
    expect(out.Z.score).toBe(100); // ne (100+?)/2 - jmenovatel je jen 1 (renormalizace)
  });

  it('všechny váhy 0 → score:null pro všechna území', () => {
    const file = makeFile();
    const out = score(file, 2024, { a: 0, b: 0 });
    for (const code of ['X', 'Y', 'Z']) {
      expect(out[code].score).toBeNull();
      expect(out[code].parts).toEqual([]);
    }
  });

  it('území bez žádných hodnot pro vážené ukazatele → score:null', () => {
    const file = makeFile();
    const out = score(file, 2024, { a: 1, b: 1 });
    expect(out.W).toBeDefined();
    expect(out.W.score).toBeNull();
    expect(out.W.skipped.sort()).toEqual(['a', 'b']);
  });
});
