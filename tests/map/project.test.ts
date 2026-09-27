import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { areaFeatures, makeProjector } from '../../src/lib/map/project.ts';

const load = (f: string) => JSON.parse(readFileSync(`public/data/_fixtures/geo/${f}`, 'utf8'));

describe('project', () => {
  it('areaFeatures načte objekt areas a filtruje podle parent', () => {
    expect(areaFeatures(load('kraje.topo.json')).map((f) => f.properties.code)).toEqual(['CZ041', 'CZ042', 'CZ032']);
    expect(areaFeatures(load('kv-obce.topo.json'), '4103').map((f) => f.properties.code)).toEqual(['554961', '555215']);
    expect(areaFeatures(undefined)).toEqual([]);
  });

  it('projekce se vejde do rozměrů a zachová orientaci (sever nahoře, západ vlevo)', () => {
    const feats = areaFeatures(load('kraje.topo.json'));
    const p = makeProjector(feats, 600, 400);
    const [[x0, y0], [x1, y1]] = p.path.bounds({ type: 'FeatureCollection', features: feats });
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(600.001);
    expect(y1).toBeLessThanOrEqual(400.001);
    const kv = p.path.centroid(feats[0]);
    const ul = p.path.centroid(feats[1]);
    expect(kv[0]).toBeLessThan(ul[0]); // KV západně od Ústeckého
    const [ax, ay] = p.project([12.3, 50.5]);
    const [bx, by] = p.project([12.3, 49.5]);
    expect(ax).toBeCloseTo(bx);
    expect(ay).toBeLessThan(by); // sever nahoře
  });
});
