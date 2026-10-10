// Point-in-polygon nad obcemi KV kraje (kv-obce.topo.json): (lon, lat) → obec a ORP.
// Používá datová pipeline (prostorové přiřazení bodů) i frontend (kontroly kvality dat).
import { geoArea, geoBounds, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, Geometry } from 'geojson';
import type { AreaCode } from '../types.ts';

export interface ObecLocation {
  obec: AreaCode;
  orp: AreaCode;
}

export type ObecLocator = (lon: number, lat: number) => ObecLocation | null;

interface Candidate {
  f: Feature<Geometry>;
  loc: ObecLocation;
  bounds: [[number, number], [number, number]];
}

/** Otočí orientaci všech kruhů – d3 (sférická geometrie) očekává vnější kruh ve směru hodinových ručiček. */
function rewind(f: Feature<Geometry>): Feature<Geometry> {
  const g = f.geometry;
  const rev = (rings: number[][][]) => rings.map((r) => [...r].reverse());
  if (g.type === 'Polygon') return { ...f, geometry: { ...g, coordinates: rev(g.coordinates) } };
  if (g.type === 'MultiPolygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map(rev) } };
  return f;
}

/** Topologie s objektem `areas` (vlastnosti AreaProps: code, parent=ORP) → funkce (lon,lat) → obec/ORP. */
export function makeObecLocator(topology: unknown): ObecLocator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = topology as any;
  const fc = feature(topo, topo.objects.areas) as unknown as { features: Feature<Geometry>[] };
  const candidates: Candidate[] = fc.features.map((raw) => {
    // Kruh v opačné orientaci pokrývá "zbytek zeměkoule" (plocha > 2π sr) → otočit.
    const f = geoArea(raw) > 2 * Math.PI ? rewind(raw) : raw;
    const p = (f.properties ?? {}) as { code?: string; parent?: string };
    return { f, loc: { obec: String(p.code ?? ''), orp: String(p.parent ?? '') }, bounds: geoBounds(f) };
  });
  return (lon, lat) => {
    for (const c of candidates) {
      const [[x0, y0], [x1, y1]] = c.bounds;
      if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      if (geoContains(c.f, [lon, lat])) return { ...c.loc };
    }
    return null;
  };
}
