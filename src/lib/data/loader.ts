// Loader snapshotu dat: nacte manifest.json a na nej navazujici soubory
// (ukazatele, bodove vrstvy, geodata) podle DATOVEHO KONTRAKTU v `src/lib/types.ts`.
//
// Chovani: selhani manifestu je fatalni (vyhodi vyjimku). Selhani jednotlivych
// dalsich souboru NENI fatalni - dany kus snapshotu proste chybi a `onStep`
// dostane `status:'fail'`. Zdroj oznaceny v manifestu jako `stale` se promita
// do statusu odpovidajiciho kroku jako `'stale'`.

import { isUradyFile, type UradyFile } from '../urady.ts';
import { isPenizeFile, type PenizeFile } from '../penize.ts';
import { isPodnikaniFile, type PodnikaniFile } from '../podnikani.ts';
import type { Level, IndicatorFile, PointLayer, Manifest, SourceEntry, OboryFile, MistaFile } from '../types.ts';
import { isManifest, isIndicatorFile, isPointLayer, isOboryFile, isMistaFile } from '../types.ts';
import type { Topology } from 'topojson-specification';

export type GeoId = 'kraje' | 'kv-orp' | 'kv-obce';

export interface Snapshot {
  manifest: Manifest;
  indicators: Partial<Record<Level, IndicatorFile>>;
  points: Record<string, PointLayer>;
  geo: Partial<Record<GeoId, Topology>>;
  /** obory středních škol (režim „Kam na střední“); null = v manifestu nejsou nebo selhalo načtení */
  skoly: OboryFile | null;
  /** místa pro volný čas (režim „Kam vyrazit“); null = v manifestu nejsou nebo selhalo načtení */
  vylety: MistaFile | null;
  /** příslušné úřady obcí (režim „Úřady“); null = v manifestu nejsou nebo selhalo načtení */
  urady: UradyFile | null;
  /** projekty a strategie kraje (režim „Peníze kraje“) */
  penize: PenizeFile | null;
  /** kreativci, inovační infrastruktura, zóny (režim „Podnikání“) */
  podnikani: PodnikaniFile | null;
  /** = manifest.updatedAt, pro pohodlny pristup */
  updatedAt: string;
}

export type StepStatus = 'ok' | 'stale' | 'fail';

export interface Step {
  label: string;
  status: StepStatus;
}

export type OnStep = (step: Step) => void;

function isTopology(x: unknown): x is Topology {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as { type?: unknown }).type === 'Topology' &&
    typeof (x as { objects?: unknown }).objects === 'object'
  );
}

/** Nejhorsi (nejvic problematicky) status mezi statusy zdroju z manifestu, ktere pouziva dany soubor. */
function statusFromSources(sources: SourceEntry[], sourceIds: Iterable<string>): StepStatus {
  let status: StepStatus = 'ok';
  for (const id of sourceIds) {
    const src = sources.find((s) => s.id === id);
    if (src?.status === 'stale') status = 'stale';
  }
  return status;
}

async function fetchJson(
  fetchImpl: typeof fetch,
  base: string,
  relPath: string,
): Promise<unknown> {
  const res = await fetchImpl(`${base}/${relPath}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} pro ${relPath}`);
  return res.json();
}

export async function loadSnapshot(
  onStep?: OnStep,
  base = 'data',
  fetchImpl: typeof fetch = fetch,
): Promise<Snapshot> {
  const manifestJson = await fetchJson(fetchImpl, base, 'manifest.json');
  if (!isManifest(manifestJson)) {
    throw new Error('Neplatny manifest.json - neodpovida datovemu kontraktu.');
  }
  const manifest = manifestJson;
  onStep?.({ label: 'MANIFEST', status: 'ok' });

  // Všechny soubory začneme stahovat najednou (paralelně); zpracování a kroky boot sekvence
  // ale zůstávají ve stejném pořadí jako dřív.
  const stahovani = new Map<string, Promise<unknown>>();
  const stahni = (relPath: string): Promise<unknown> => {
    let p = stahovani.get(relPath);
    if (!p) {
      p = fetchJson(fetchImpl, base, relPath);
      p.catch(() => {}); // chybu ošetří až místo, které soubor zpracovává
      stahovani.set(relPath, p);
    }
    return p;
  };
  const f = manifest.files;
  for (const relPath of [
    ...Object.values(f.indicators),
    ...Object.values(f.points),
    ...Object.values(f.geo),
    f.skoly,
    f.vylety,
    f.urady,
    f.penize,
    f.podnikani,
  ]) {
    if (relPath) stahni(relPath);
  }

  const snapshot: Snapshot = {
    manifest,
    indicators: {},
    points: {},
    geo: {},
    skoly: null,
    vylety: null,
    urady: null,
    penize: null,
    podnikani: null,
    updatedAt: manifest.updatedAt,
  };

  for (const [level, relPath] of Object.entries(manifest.files.indicators) as [Level, string][]) {
    const label = `UKAZATELE ${level.toUpperCase()}`;
    try {
      const json = await stahni(relPath);
      if (!isIndicatorFile(json)) throw new Error('neplatny IndicatorFile');
      snapshot.indicators[level] = json;
      const sourceIds = Object.values(json.indicators).map((def) => def.sourceId);
      onStep?.({ label, status: statusFromSources(manifest.sources, sourceIds) });
    } catch {
      onStep?.({ label, status: 'fail' });
    }
  }

  for (const [id, relPath] of Object.entries(manifest.files.points)) {
    const label = `BODY ${id.toUpperCase()}`;
    try {
      const json = await stahni(relPath);
      if (!isPointLayer(json)) throw new Error('neplatny PointLayer');
      snapshot.points[id] = json;
      onStep?.({ label, status: statusFromSources(manifest.sources, [json.sourceId]) });
    } catch {
      onStep?.({ label, status: 'fail' });
    }
  }

  for (const [id, relPath] of Object.entries(manifest.files.geo) as [GeoId, string][]) {
    const label = `HRANICE ${id.toUpperCase()}`;
    try {
      const json = await stahni(relPath);
      if (!isTopology(json)) throw new Error('neplatna Topology');
      snapshot.geo[id] = json;
      // geo soubory nemaji vlastni sourceId v kontraktu - status je jen ok/fail.
      onStep?.({ label, status: 'ok' });
    } catch {
      onStep?.({ label, status: 'fail' });
    }
  }

  if (manifest.files.skoly) {
    const label = 'STŘEDNÍ ŠKOLY';
    try {
      const json = await stahni(manifest.files.skoly);
      if (!isOboryFile(json)) throw new Error('neplatny OboryFile');
      snapshot.skoly = json;
      onStep?.({ label, status: statusFromSources(manifest.sources, json.sourceIds) });
    } catch {
      onStep?.({ label, status: 'fail' });
    }
  }

  if (manifest.files.vylety) {
    const label = 'MÍSTA PRO VOLNÝ ČAS';
    try {
      const json = await stahni(manifest.files.vylety);
      if (!isMistaFile(json)) throw new Error('neplatny MistaFile');
      snapshot.vylety = json;
      onStep?.({ label, status: statusFromSources(manifest.sources, json.sourceIds) });
    } catch {
      onStep?.({ label, status: 'fail' });
    }
  }

  if (manifest.files.urady) {
    const label = 'ÚŘADY';
    try {
      const json = await stahni(manifest.files.urady);
      if (!isUradyFile(json)) throw new Error('neplatny UradyFile');
      snapshot.urady = json;
      onStep?.({ label, status: statusFromSources(manifest.sources, json.sourceIds) });
    } catch {
      onStep?.({ label, status: 'fail' });
    }
  }

  if (manifest.files.penize) {
    const label = 'PENÍZE KRAJE';
    try {
      const json = await stahni(manifest.files.penize);
      if (!isPenizeFile(json)) throw new Error('neplatny PenizeFile');
      snapshot.penize = json;
      onStep?.({ label, status: statusFromSources(manifest.sources, json.sourceIds) });
    } catch {
      onStep?.({ label, status: 'fail' });
    }
  }

  if (manifest.files.podnikani) {
    const label = 'PODNIKÁNÍ';
    try {
      const json = await stahni(manifest.files.podnikani);
      if (!isPodnikaniFile(json)) throw new Error('neplatny PodnikaniFile');
      snapshot.podnikani = json;
      onStep?.({ label, status: statusFromSources(manifest.sources, json.sourceIds) });
    } catch {
      onStep?.({ label, status: 'fail' });
    }
  }

  return snapshot;
}
