// Projekce geodat do souřadnic SVG.
//
// Záměrně PLANÁRNÍ (ekvidistantní válcová s korekcí cos(φ₀)), ne sférická geoMercator:
// pro území velikosti ČR je rozdíl vizuálně zanedbatelný a planární cesta nezávisí na
// orientaci (winding) polygonů v TopoJSONu – sférická d3 projekce by při opačném
// windingu vykreslila "celý svět minus polygon".
import { geoPath, geoTransform, type GeoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { AreaCode, AreaProps } from '../types.ts';

export type AreaFeature = Feature<Geometry, AreaProps>;

/** Prvky TopoJSON objektu `areas`; volitelně jen ty s daným `parent`. */
export function areaFeatures(topo: Topology | undefined, parent?: AreaCode | null): AreaFeature[] {
  const obj = topo?.objects?.areas as GeometryCollection<AreaProps> | undefined;
  if (!topo || !obj) return [];
  const fc = feature(topo, obj) as FeatureCollection<Geometry, AreaProps>;
  return fc.features.filter((f) => f.properties && (parent == null || f.properties.parent === parent));
}

export interface Projector {
  path: GeoPath;
  project: (lonLat: [number, number]) => [number, number];
  width: number;
  height: number;
}

export function makeProjector(features: AreaFeature[], width: number, height: number, pad = 8): Projector {
  const fc: FeatureCollection<Geometry, AreaProps> = { type: 'FeatureCollection', features };
  // střední zeměpisná šířka pro korekci délky
  const rawBounds = geoPath().bounds(fc);
  const lat0 = Number.isFinite(rawBounds[0][1]) ? (rawBounds[0][1] + rawBounds[1][1]) / 2 : 50;
  const k = Math.cos((lat0 * Math.PI) / 180);

  const raw = geoTransform({
    point(x, y) {
      this.stream.point(x * k, -y);
    },
  });
  const [[x0, y0], [x1, y1]] = geoPath(raw).bounds(fc);
  const bw = x1 - x0 || 1;
  const bh = y1 - y0 || 1;
  const s = Math.min((width - 2 * pad) / bw, (height - 2 * pad) / bh);
  const ox = (width - bw * s) / 2;
  const oy = (height - bh * s) / 2;
  const project = ([lon, lat]: [number, number]): [number, number] => [
    (lon * k - x0) * s + ox,
    (-lat - y0) * s + oy,
  ];
  const tr = geoTransform({
    point(x, y) {
      const [px, py] = project([x, y]);
      this.stream.point(px, py);
    },
  });
  return { path: geoPath(tr), project, width, height };
}
