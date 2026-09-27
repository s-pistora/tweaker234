import { describe, it, expect } from 'vitest';
import { countBy, sumBy, perThousand } from '../scripts/aggregate.ts';
import type { PointLayer } from '../src/lib/types.ts';

const layer: PointLayer = {
  id: 'test',
  label: 'Test',
  sourceId: 'test',
  validFor: '2026',
  features: [
    { id: '1', name: 'A', lon: 12.8, lat: 50.2, obec: '554961', orp: '4103', attrs: { pozadovano: 100, prideleno: 50 } },
    { id: '2', name: 'B', lon: 12.9, lat: 50.3, obec: '554961', orp: '4103', attrs: { pozadovano: 200, prideleno: 150 } },
    { id: '3', name: 'C', lon: 12.8, lat: 50.37, obec: '554979', orp: '4106', attrs: { pozadovano: 10, prideleno: 0 } },
  ],
};

describe('countBy', () => {
  it('počítá prvky podle obce', () => {
    expect(countBy(layer, 'obec')).toEqual({ '554961': 2, '554979': 1 });
  });

  it('počítá prvky podle orp', () => {
    expect(countBy(layer, 'orp')).toEqual({ '4103': 2, '4106': 1 });
  });
});

describe('sumBy', () => {
  it('sečte atribut podle obce', () => {
    expect(sumBy(layer, 'prideleno', 'obec')).toEqual({ '554961': 200, '554979': 0 });
  });

  it('sečte atribut podle orp', () => {
    expect(sumBy(layer, 'pozadovano', 'orp')).toEqual({ '4103': 300, '4106': 10 });
  });
});

describe('perThousand', () => {
  it('vrátí null pro nulovou populaci', () => {
    expect(perThousand({ a: 2 }, { a: 0 })).toEqual({ a: null });
  });

  it('vrátí null pro chybějící (null) populaci', () => {
    expect(perThousand({ a: 2 }, { a: null })).toEqual({ a: null });
  });

  it('vrátí null pro chybějící (undefined) populaci', () => {
    expect(perThousand({ a: 2 }, {})).toEqual({ a: null });
  });

  it('spočítá poměr na 1000 obyvatel', () => {
    expect(perThousand({ a: 5 }, { a: 1000 })).toEqual({ a: 5 });
  });

  it('nikdy nevrátí Infinity/NaN', () => {
    expect(perThousand({ a: 5 }, { a: Number.NaN })).toEqual({ a: null });
    expect(perThousand({ a: 5 }, { a: Number.POSITIVE_INFINITY })).toEqual({ a: null });
  });
});
