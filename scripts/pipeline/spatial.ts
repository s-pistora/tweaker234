// Prostorové přiřazení bodů k obcím KV kraje (point-in-polygon nad kv-obce.topo.json).
// Koordinátorovo rozhodnutí: body s prázdnou (nebo neznámou) obcí/ORP dostanou obec = `code`
// a ORP = `parent` polygonu, ve kterém leží. Body mimo všechny obce KV kraje se zahodí a spočítají.
import type { AreaCode, PointFeature, PointLayer } from '../../src/lib/types.ts';
import type { ObecLocator } from '../../src/lib/map/locate.ts';

export { makeObecLocator, type ObecLocation, type ObecLocator } from '../../src/lib/map/locate.ts';

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
