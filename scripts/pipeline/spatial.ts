// Prostorové přiřazení bodů k obcím KV kraje (point-in-polygon nad kv-obce.topo.json).
// Koordinátorovo rozhodnutí: body s prázdnou (nebo neznámou) obcí/ORP dostanou obec = `code`
// a ORP = `parent` polygonu, ve kterém leží. Body mimo všechny obce KV kraje se zahodí a spočítají.
import { geoArea, geoBounds, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, Geometry } from 'geojson';
import type { AreaCode, PointFeature, PointLayer } from '../../src/lib/types.ts';

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

export interface JoinStats {
  total: number;
  /** body, kterým byla obec/ORP doplněna bodovým dotazem */
  joined: number;
  /** body mimo všechny obce KV kraje – zahozeny */
  dropped: number;
  /** body s platnou obcí (jen případně doplněné ORP z číselníku obce) */
  unchanged: number;
}

/**
 * Vrátí kopii vrstvy s doplněnými kódy. `obecToOrp` = platné obce KV kraje (kód → ORP) z geometrie.
 * Bod, jehož obec je v `obecToOrp`, zůstane (ORP se doplní/opraví podle obce). Ostatní se
 * přiřadí bodovým dotazem; nenalezené se zahodí.
 */
export function spatialJoinLayer(
  layer: PointLayer,
  locate: ObecLocator,
  obecToOrp: Map<AreaCode, AreaCode>,
): { layer: PointLayer; stats: JoinStats } {
  const stats: JoinStats = { total: layer.features.length, joined: 0, dropped: 0, unchanged: 0 };
  const features: PointFeature[] = [];
  for (const f of layer.features) {
    const knownOrp = f.obec ? obecToOrp.get(f.obec) : undefined;
    if (knownOrp !== undefined) {
      stats.unchanged++;
      features.push({ ...f, orp: f.orp && f.orp === knownOrp ? f.orp : knownOrp });
      continue;
    }
    const loc = locate(f.lon, f.lat);
    if (!loc) {
      stats.dropped++;
      continue;
    }
    stats.joined++;
    features.push({ ...f, obec: loc.obec, orp: loc.orp });
  }
  return { layer: { ...layer, features }, stats };
}

/** Kód obce → ORP ze všech polygonů topologie (vlastnosti code/parent). */
export function obecToOrpFromTopology(topology: unknown): Map<AreaCode, AreaCode> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoms = ((topology as any)?.objects?.areas?.geometries ?? []) as Array<{ properties?: { code?: string; parent?: string } }>;
  const out = new Map<AreaCode, AreaCode>();
  for (const g of geoms) {
    if (g.properties?.code) out.set(String(g.properties.code), String(g.properties.parent ?? ''));
  }
  return out;
}
