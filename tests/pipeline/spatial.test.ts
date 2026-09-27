import { describe, it, expect } from 'vitest';
import { makeObecLocator, spatialJoinLayer } from '../../scripts/pipeline/spatial.ts';
import type { PointLayer } from '../../src/lib/types.ts';

// Dvě "obce" jako čtverce 1×1° vedle sebe: A (0..1, 0..1) v ORP 9001, B (1..2, 0..1) v ORP 9002.
// Kruh A je zapsán ve směru hodinových ručiček (konvence d3), kruh B naopak – lokátor musí zvládnout obojí.
const topo = {
  type: 'Topology',
  arcs: [
    [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]],
    [[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]],
  ],
  objects: {
    areas: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', arcs: [[0]], properties: { code: 'A', name: 'Obec A', parent: '9001' } },
        { type: 'Polygon', arcs: [[1]], properties: { code: 'B', name: 'Obec B', parent: '9002' } },
      ],
    },
  },
};

function layer(features: Array<Partial<PointLayer['features'][number]> & { lon: number; lat: number }>): PointLayer {
  return {
    id: 'l',
    label: 'L',
    sourceId: 's',
    validFor: '2026',
    features: features.map((f, i) => ({ id: `p${i}`, name: `P${i}`, obec: '', orp: '', attrs: {}, ...f })),
  };
}

describe('makeObecLocator', () => {
  it('najde obec a ORP bodu uvnitř polygonu bez ohledu na orientaci kruhu', () => {
    const locate = makeObecLocator(topo);
    expect(locate(0.5, 0.5)).toEqual({ obec: 'A', orp: '9001' });
    expect(locate(1.5, 0.5)).toEqual({ obec: 'B', orp: '9002' });
    expect(locate(5, 5)).toBeNull();
  });
});

describe('spatialJoinLayer', () => {
  it('doplní prázdnou obec/ORP bodovým dotazem, zahodí body mimo všechny obce a spočítá je', () => {
    const locate = makeObecLocator(topo);
    const l = layer([
      { lon: 0.5, lat: 0.5 }, // bez kódů -> A/9001
      { lon: 1.5, lat: 0.5, orp: '9002' }, // jen ORP -> doplní obec B
      { lon: 30, lat: 30 }, // mimo -> zahodit
      { lon: 1.5, lat: 0.5, obec: 'A', orp: '9001' }, // platné kódy -> beze změny (i když leží v B)
    ]);
    const { layer: out, stats } = spatialJoinLayer(l, locate, new Map([['A', '9001'], ['B', '9002']]));
    expect(out.features.map((f) => [f.obec, f.orp])).toEqual([
      ['A', '9001'],
      ['B', '9002'],
      ['A', '9001'],
    ]);
    expect(stats).toEqual({ total: 4, joined: 2, dropped: 1, unchanged: 1 });
  });

  it('bod s obcí mimo KV číselník geometrie se přepočítá bodovým dotazem; ORP se doplní z obce', () => {
    const locate = makeObecLocator(topo);
    const l = layer([
      { lon: 0.5, lat: 0.5, obec: 'NEZNAMA', orp: '' },
      { lon: 1.5, lat: 0.5, obec: 'B', orp: '' },
    ]);
    const { layer: out, stats } = spatialJoinLayer(l, locate, new Map([['A', '9001'], ['B', '9002']]));
    expect(out.features.map((f) => [f.obec, f.orp])).toEqual([
      ['A', '9001'],
      ['B', '9002'],
    ]);
    expect(stats.dropped).toBe(0);
  });

  it('nemění vstupní vrstvu', () => {
    const locate = makeObecLocator(topo);
    const l = layer([{ lon: 0.5, lat: 0.5 }]);
    spatialJoinLayer(l, locate, new Map([['A', '9001']]));
    expect(l.features[0]!.obec).toBe('');
  });
});
