// Středy území (planárně v lon/lat) – pro režim „Kam na střední“ (vzdálenost obec → škola).
// Planární geoPath bez projekce nezávisí na windingu polygonů (viz project.ts).
import { geoPath } from 'd3-geo';
import type { AreaCode } from '../types.ts';
import type { AreaFeature } from './project.ts';

export interface LatLon {
  lat: number;
  lon: number;
}

export function centroidy(features: AreaFeature[]): Record<AreaCode, LatLon> {
  const path = geoPath();
  const out: Record<AreaCode, LatLon> = {};
  for (const f of features) {
    const [lon, lat] = path.centroid(f);
    if (Number.isFinite(lon) && Number.isFinite(lat)) out[f.properties.code] = { lat, lon };
  }
  return out;
}
