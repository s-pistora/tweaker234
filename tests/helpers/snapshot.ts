// Reálný snapshot public/data pro testy čistých funkcí (načtený přes loader jako v aplikaci).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadSnapshot, type Snapshot } from '../../src/lib/data/loader.ts';
import { areaFeatures } from '../../src/lib/map/project.ts';
import { centroidy } from '../../src/lib/map/centroids.ts';
import { vytvorKontext, type ZivotKontext } from '../../src/lib/zivot.ts';
import type { AreaCode } from '../../src/lib/types.ts';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function fetchFromPublic(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const full = path.join(PUBLIC_DIR, String(input).replace(/^\.\//, ''));
    if (!existsSync(full)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(full, 'utf8'), { status: 200 });
  }) as unknown as typeof fetch;
}

export interface RealnaData {
  snap: Snapshot;
  ctx: ZivotKontext;
  names: Record<AreaCode, string>;
  /** obec → ORP */
  orp: Record<AreaCode, AreaCode>;
}

let cache: Promise<RealnaData> | null = null;

export function realnaData(): Promise<RealnaData> {
  cache ??= loadSnapshot(undefined, 'data', fetchFromPublic()).then((snap) => {
    const f = areaFeatures(snap.geo['kv-obce']);
    const names = Object.fromEntries(f.map((x) => [x.properties.code, x.properties.name])) as Record<AreaCode, string>;
    const orp = Object.fromEntries(f.map((x) => [x.properties.code, x.properties.parent ?? ''])) as Record<AreaCode, AreaCode>;
    return { snap, ctx: vytvorKontext(snap, centroidy(f), names), names, orp };
  });
  return cache;
}
