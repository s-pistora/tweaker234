import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isIndicatorFile, isManifest, isPointLayer, isSourceEntry } from '../src/lib/types.ts';

const base = 'public/data/_fixtures';
const read = (p: string) => JSON.parse(readFileSync(`${base}/${p}`, 'utf8'));

describe('datový kontrakt – fixtures', () => {
  const manifest = read('manifest.json');

  it('manifest je platný', () => {
    expect(isManifest(manifest)).toBe(true);
    expect(manifest.sources.every(isSourceEntry)).toBe(true);
  });

  it('každý soubor ukazatelů odpovídá kontraktu a své úrovni', () => {
    for (const [lvl, path] of Object.entries(manifest.files.indicators)) {
      const f = read(path as string);
      expect(isIndicatorFile(f), path as string).toBe(true);
      expect(f.level).toBe(lvl);
    }
  });

  it('bodové vrstvy odpovídají kontraktu', () => {
    for (const path of Object.values(manifest.files.points)) {
      expect(isPointLayer(read(path as string))).toBe(true);
    }
  });

  it('geo soubory mají objekt areas s vlastnostmi code/name', () => {
    for (const path of Object.values(manifest.files.geo)) {
      const t = read(path as string);
      expect(t.type).toBe('Topology');
      const geoms = t.objects.areas.geometries;
      expect(geoms.length).toBeGreaterThan(0);
      for (const g of geoms) {
        expect(typeof g.properties.code).toBe('string');
        expect(typeof g.properties.name).toBe('string');
      }
    }
  });

  it('type-guard odmítne neplatná data', () => {
    expect(isIndicatorFile({ level: 'kraj', indicators: {}, values: { x: {} } })).toBe(false);
    expect(isIndicatorFile({ level: 'okres', indicators: {}, values: {} })).toBe(false);
    expect(isSourceEntry({ id: 'a' })).toBe(false);
    expect(isPointLayer({ id: 'a', label: 'b', sourceId: 'c', validFor: 'd', features: [{ id: 'x', name: 'y', lon: NaN, lat: 1, obec: '1', orp: '2' }] })).toBe(false);
  });
});
