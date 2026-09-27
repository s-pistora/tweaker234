// Orchestrátor datové pipeline (`npm run data:update`):
//   adaptéry (sekvenčně) → sloučení ukazatelů → prostorové přiřazení bodů → odvozené ukazatele →
//   validace (počty 14/7/134 + cross-check DataStat × KROK) → atomický zápis public/data/** + SOURCES.md.
// Selhání zdroje: ponechá se poslední snapshot jeho souborů a zdroj se označí `stale`.
// Selhání validace: exit 1, nic se nezapíše.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  AreaCode, IndicatorFile, Level, Manifest, PointLayer, SourceEntry,
} from '../src/lib/types.ts';
import { isIndicatorFile, isManifest, isPointLayer, LEVELS } from '../src/lib/types.ts';
import type { GeoOutput, SourceAdapter, SourceResult } from './sources/types.ts';
import { crossCheck, validateCounts, type AreasTopology, type CrossCheckDiff } from './validate.ts';
import { fillMissingYears, mergeIndicatorFiles, restrictAreas } from './pipeline/merge.ts';
import { completeRegionalNational, deriveIndicators, DERIVED, type DerivedMeta } from './pipeline/derive.ts';
import { CROSS_CHECK_IDS } from './sources/csu-datastat.ts';
import { makeObecLocator, obecToOrpFromTopology, spatialJoinLayer, type JoinStats } from './pipeline/spatial.ts';
import { writeFileAtomic, writeSnapshotAtomic } from './pipeline/write.ts';
import { renderSourcesMd } from './sources-md.ts';

/**
 * Ukazatele, které se porovnávají mezi ČSÚ DataStat a KROK (a jen ty se z KROK doplňují do chybějících
 * roků) – `CROSS_CHECK_IDS` z adaptéru DataStat. `mzda` v nich záměrně chybí: ukazatel mzdy v KROK
 * pokrývá jen stavební podniky s 50+ zaměstnanci, takže není srovnatelný s DataStat MZDR.
 */
export const CROSS_CHECK: readonly string[] = CROSS_CHECK_IDS;

/** Zdroje, které se neslučují do výstupu, ale slouží jako sekundární (cross-check + doplnění roků). */
export const SECONDARY_SOURCES = ['krok'] as const;

const CROSS_CHECK_TOL = 0.005;
const PRIMARY_LABEL = 'ČSÚ DataStat';
const SECONDARY_LABEL = 'KROK';

type GeoKey = 'kraje' | 'kv-orp' | 'kv-obce';
const GEO_KEYS: readonly GeoKey[] = ['kraje', 'kv-orp', 'kv-obce'];

export interface PipelineOptions {
  outDir: string;
  rawDir: string;
  prevManifest?: Manifest | null;
  /** kam zapsat SOURCES.md (jen při úspěchu); bez něj se nezapisuje */
  sourcesMdPath?: string;
  now?: Date;
  /** výstup průběhu – dostává text včetně '\n' (CLI: process.stdout.write) */
  log?: (text: string) => void;
}

export interface PipelineResult {
  /** záznamy zdrojů (manifest.sources) tohoto běhu */
  manifest: SourceEntry[];
  /** chyby validace (neprázdné → nic se nezapsalo) */
  errors: string[];
  warnings: string[];
  /** zapsaný manifest (null při chybě) */
  written: Manifest | null;
  joinStats: Record<string, JoinStats>;
  /** lidsky čitelný souhrn běhu */
  summary: string[];
}

function soubory(n: number): string {
  if (n === 1) return '1 soubor';
  if (n >= 2 && n <= 4) return `${n} soubory`;
  return `${n} souborů`;
}

function roky(n: number): string {
  if (n === 1) return '1 rok';
  if (n >= 2 && n <= 4) return `${n} roky`;
  return `${n} roků`;
}

function date(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
}

function pct(rel: number): string {
  return Number.isFinite(rel) ? `${(rel * 100).toFixed(2).replace('.', ',')} %` : '∞ %';
}

function geoKeyOf(file: string): GeoKey | null {
  const key = file.replace(/\.topo\.json$/, '');
  return (GEO_KEYS as readonly string[]).includes(key) ? (key as GeoKey) : null;
}

function areaCodesOfTopology(topo: unknown): AreaCode[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoms = ((topo as any)?.objects?.areas?.geometries ?? []) as Array<{ properties?: { code?: string } }>;
  return geoms.map((g) => String(g.properties?.code ?? '')).filter(Boolean);
}

function areaNamesOfTopology(topo: unknown): Map<AreaCode, string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoms = ((topo as any)?.objects?.areas?.geometries ?? []) as Array<{ properties?: { code?: string; name?: string } }>;
  return new Map(geoms.map((g) => [String(g.properties?.code ?? ''), String(g.properties?.name ?? '')]));
}

/** Podmnožina souboru ukazatelů patřící jednomu zdroji (podle IndicatorDef.sourceId). */
function subsetBySource(file: IndicatorFile, sourceId: string): IndicatorFile | null {
  const out: IndicatorFile = { level: file.level, indicators: {}, values: {} };
  for (const [id, d] of Object.entries(file.indicators)) {
    if (d.sourceId !== sourceId) continue;
    out.indicators[id] = d;
    out.values[id] = file.values[id] ?? {};
    if (file.national?.[id]) (out.national ??= {})[id] = file.national[id]!;
    if (file.regional?.[id]) (out.regional ??= {})[id] = file.regional[id]!;
  }
  return Object.keys(out.indicators).length ? out : null;
}

function roundNumbers<T>(x: T, decimals = 6): T {
  const f = 10 ** decimals;
  return JSON.parse(
    JSON.stringify(x, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * f) / f : v)),
  ) as T;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'));
}

/** Načte části předchozího snapshotu (jen soubory uvedené v prevManifest). Chybějící/poškozené se přeskočí. */
async function loadPrevSnapshot(outDir: string, prev: Manifest | null | undefined, warn: (m: string) => void) {
  const indicators: Partial<Record<Level, IndicatorFile>> = {};
  const points: Record<string, PointLayer> = {};
  const geo: Partial<Record<GeoKey, unknown>> = {};
  if (!prev) return { indicators, points, geo };
  for (const [level, rel] of Object.entries(prev.files.indicators) as [Level, string][]) {
    try {
      const j = await readJson(path.join(outDir, rel));
      if (isIndicatorFile(j)) indicators[level] = j;
    } catch {
      warn(`Předchozí snapshot: nelze načíst ${rel}.`);
    }
  }
  for (const [id, rel] of Object.entries(prev.files.points)) {
    try {
      const j = await readJson(path.join(outDir, rel));
      if (isPointLayer(j)) points[id] = j;
    } catch {
      warn(`Předchozí snapshot: nelze načíst ${rel}.`);
    }
  }
  for (const [key, rel] of Object.entries(prev.files.geo) as [GeoKey, string][]) {
    try {
      geo[key] = await readJson(path.join(outDir, rel));
    } catch {
      warn(`Předchozí snapshot: nelze načíst ${rel}.`);
    }
  }
  return { indicators, points, geo };
}

function staleEntry(id: string, err: unknown, prev: Manifest | null | undefined): SourceEntry {
  const note = err instanceof Error ? err.message : String(err);
  const old = prev?.sources.find((s) => s.id === id);
  if (old) return { ...old, status: 'stale', note: old.note ? `${note}; ${old.note}` : note };
  return { id, provider: id, title: id, url: '', license: '', downloadedAt: '', validFor: '', status: 'stale', note };
}

function describeDiff(d: CrossCheckDiff, names: Map<AreaCode, string>): string {
  const name = names.get(d.area);
  return (
    `Cross-check ${PRIMARY_LABEL} × ${SECONDARY_LABEL} překročil toleranci ${pct(CROSS_CHECK_TOL)}: ` +
    `ukazatel „${d.id}“, území ${d.area}${name ? ` (${name})` : ''}, rok ${d.year} – ` +
    `${PRIMARY_LABEL} ${d.a}, ${SECONDARY_LABEL} ${d.b}, odchylka ${pct(d.rel)}.`
  );
}

export async function runPipeline(adapters: SourceAdapter[], opts: PipelineOptions): Promise<PipelineResult> {
  const log = opts.log ?? ((t: string) => process.stdout.write(t));
  const now = opts.now ?? new Date();
  const warnings: string[] = [];
  const warn = (m: string) => {
    warnings.push(m);
    log(`  ! ${m}\n`);
  };
  const prev = opts.prevManifest ?? null;
  const prevSnap = await loadPrevSnapshot(opts.outDir, prev, warn);

  // ---------- 1) adaptéry (sekvenčně – ČSÚ číselníky nesnesou souběžné requesty) ----------
  const entries: SourceEntry[] = [];
  const primary: Array<{ indicators: IndicatorFile[]; points: PointLayer[] }> = [];
  const secondary: IndicatorFile[] = [];
  const geo: Partial<Record<GeoKey, unknown>> = {};
  const staleIds = new Set<string>();
  const retainedPointIds = new Set<string>();
  const secondaryIds = new Set<string>(SECONDARY_SOURCES);

  for (const adapter of adapters) {
    log(`> STAHUJI ${adapter.id}… `);
    const t0 = Date.now();
    let result: SourceResult;
    try {
      result = await adapter.run({ rawDir: opts.rawDir, now });
    } catch (err) {
      const entry = staleEntry(adapter.id, err, prev);
      entries.push(entry);
      staleIds.add(adapter.id);
      log(`CHYBA – ${entry.note} → ponechávám poslední snapshot (stale)\n`);
      // Ponechané části předchozího snapshotu tohoto zdroje:
      const inds = LEVELS.map((l) => (prevSnap.indicators[l] ? subsetBySource(prevSnap.indicators[l]!, adapter.id) : null))
        .filter((f): f is IndicatorFile => f !== null);
      const pts = Object.values(prevSnap.points).filter((l) => l.sourceId === adapter.id);
      for (const l of pts) retainedPointIds.add(l.id);
      if (!secondaryIds.has(adapter.id)) primary.push({ indicators: inds, points: pts });
      continue;
    }
    const n = (result.indicators?.length ?? 0) + (result.points?.length ?? 0) + (result.geo?.length ?? 0);
    log(`OK (${soubory(n)}, ${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
    entries.push({ ...result.source });
    if (secondaryIds.has(adapter.id)) {
      secondary.push(...(result.indicators ?? []).filter((f) => f.level === 'kraj'));
    } else {
      primary.push({ indicators: result.indicators ?? [], points: result.points ?? [] });
    }
    for (const g of result.geo ?? ([] as GeoOutput[])) {
      const key = geoKeyOf(g.file);
      if (key) geo[key] = g.topology;
      else warn(`Neznámý geo soubor ${g.file} – ignorován.`);
    }
  }
  // Geodata, která tento běh nevyrobil (zdroj selhal), se převezmou z předchozího snapshotu beze změny.
  const retainedGeo = new Set<GeoKey>();
  for (const key of GEO_KEYS) {
    if (geo[key] === undefined && prevSnap.geo[key] !== undefined) {
      geo[key] = prevSnap.geo[key];
      retainedGeo.add(key);
    }
  }

  // ---------- 2) prostorové přiřazení bodů ----------
  log('> SLUČUJI a ODVOZUJI ukazatele…\n');
  const joinStats: Record<string, JoinStats> = {};
  let layers: PointLayer[] = primary.flatMap((p) => p.points);
  if (geo['kv-obce']) {
    const locate = makeObecLocator(geo['kv-obce']);
    const obecToOrp = obecToOrpFromTopology(geo['kv-obce']);
    layers = layers.map((l) => {
      const { layer, stats } = spatialJoinLayer(l, locate, obecToOrp);
      joinStats[l.id] = stats;
      const e = entries.find((x) => x.id === l.sourceId && x.status === 'ok');
      if (e && (stats.joined || stats.dropped)) {
        const txt =
          `Pipeline: vrstva ${l.id} – obec/ORP doplněny prostorovým přiřazením k hranicím obcí RÚIAN u ` +
          `${stats.joined} z ${stats.total} bodů${stats.dropped ? `, ${stats.dropped} bodů mimo Karlovarský kraj vyřazeno` : ''}.`;
        e.note = e.note ? `${e.note} ${txt}` : txt;
      }
      return layer;
    });
  } else {
    warn('Chybí geodata kv-obce – body nelze prostorově přiřadit k obcím.');
  }

  // ---------- 3) sloučení ukazatelů ----------
  const allFiles = primary.flatMap((p) => p.indicators);
  const merged = {} as Record<Level, IndicatorFile>;
  for (const level of LEVELS) merged[level] = mergeIndicatorFiles(level, allFiles, warn);

  // ---------- 4) cross-check + doplnění roků ze sekundárního zdroje (KROK) ----------
  const errors: string[] = [];
  const krajNames = areaNamesOfTopology(geo.kraje);
  const secKraj = secondary.length ? mergeIndicatorFiles('kraj', secondary, warn) : null;
  let crossCheckInfo: string;
  if (secKraj) {
    const cc = crossCheck(merged.kraj, secKraj, [...CROSS_CHECK], CROSS_CHECK_TOL);
    for (const d of cc.diffs) errors.push(describeDiff(d, krajNames));
    crossCheckInfo = cc.ok
      ? `OK (${CROSS_CHECK.join(', ')}; tolerance ${pct(CROSS_CHECK_TOL)})`
      : `SELHAL – ${cc.diffs.length} rozdílů nad ${pct(CROSS_CHECK_TOL)}`;
    const { file, filled } = fillMissingYears(merged.kraj, secKraj, CROSS_CHECK);
    merged.kraj = file;
    const filledTxt = Object.entries(filled).map(([id, ys]) =>
      ys.length === 1 ? `${id} ${ys[0]}` : `${id} ${ys[0]}–${ys[ys.length - 1]} (${roky(ys.length)})`,
    );
    if (filledTxt.length) {
      const e = entries.find((s) => secondaryIds.has(s.id) && s.status === 'ok');
      const txt = `Doplněny chybějící roky do krajských ukazatelů ČSÚ DataStat: ${filledTxt.join('; ')}.`;
      if (e) e.note = e.note ? `${e.note} ${txt}` : txt;
      log(`  KROK: ${txt}\n`);
    }
  } else {
    crossCheckInfo = 'PŘESKOČEN – sekundární zdroj KROK není k dispozici';
    warn(`Cross-check přeskočen: ${SECONDARY_LABEL} není k dispozici.`);
    // KROK selhal → roky doplněné minulým během zůstanou (převezmou se z předchozího kraj souboru).
    const prevKraj = prevSnap.indicators.kraj;
    if (prevKraj) merged.kraj = fillMissingYears(merged.kraj, prevKraj, CROSS_CHECK).file;
  }

  // ---------- 5) území podle geodat, odvozené ukazatele, KV průměr / ČR ----------
  const areasByLevel: Record<Level, AreaCode[] | null> = {
    kraj: geo.kraje ? areaCodesOfTopology(geo.kraje) : null,
    orp: geo['kv-orp'] ? areaCodesOfTopology(geo['kv-orp']) : null,
    obec: geo['kv-obce'] ? areaCodesOfTopology(geo['kv-obce']) : null,
  };
  for (const level of LEVELS) {
    const areas = areasByLevel[level];
    if (!areas) continue;
    const { file, removed } = restrictAreas(merged[level], new Set(areas));
    if (removed.length) {
      warn(`${level}: vyřazena území mimo geodata (${removed.length}): ${removed.slice(0, 10).map((a) => a || '""').join(', ')}${removed.length > 10 ? '…' : ''}`);
    }
    merged[level] = file;
  }
  const derivedMeta: DerivedMeta[] = [];
  for (const level of ['orp', 'obec'] as const) {
    const areas = areasByLevel[level] ?? Object.keys(merged[level].values.obyvatele ?? {});
    merged[level] = deriveIndicators(merged[level], layers, { areas, warn, onDerived: (m) => derivedMeta.push(m) });
  }
  // KV průměr odvozených ukazatelů = počty ze VŠECH bodů/záznamů (vč. míst bez GPS a území bez
  // populace) nad populací KV – spočítaný na úrovni ORP a převzatý i do obcí, aby se obě úrovně shodovaly.
  for (const spec of DERIVED) {
    const reg = merged.orp.regional?.[spec.id];
    if (reg && merged.obec.indicators[spec.id]) (merged.obec.regional ??= {})[spec.id] = { ...reg };
  }
  for (const level of ['orp', 'obec'] as const) {
    merged[level] = completeRegionalNational(merged[level], merged.kraj);
  }
  // Poznámka k odvozeným ukazatelům do záznamu zdroje (→ manifest a SOURCES.md), jednou na ukazatel.
  const notedIds = new Set<string>();
  for (const m of derivedMeta) {
    if (notedIds.has(m.id)) continue;
    notedIds.add(m.id);
    const e = entries.find((x) => x.id === m.sourceId && x.status === 'ok');
    if (!e) continue;
    const txt =
      m.kind === 'per1000'
        ? `Pipeline: ukazatel ${m.id} = počet bodů podle stavu registru k datu stažení (${date(e.downloadedAt)}) ` +
          `na 1000 obyvatel podle ČSÚ k 31. 12. ${m.popYear} (poslední dostupný rok).`
        : `Pipeline: ukazatel ${m.id} = souhrn za roky ${m.fromYear ?? m.year}–${m.year} (podle roku v datech) ` +
          `na obyvatele podle ČSÚ k 31. 12. ${m.popYear}; hodnota uložena pod rokem ${m.year}.`;
    e.note = e.note ? `${e.note} ${txt}` : txt;
  }

  // ---------- 6) validace ----------
  log('> VALIDUJI…\n');
  const countErrors = validateCounts(merged, {
    kraje: geo.kraje as AreasTopology | undefined,
    kvOrp: geo['kv-orp'] as AreasTopology | undefined,
    kvObce: geo['kv-obce'] as AreasTopology | undefined,
  });
  errors.unshift(...countErrors);
  for (const level of LEVELS) {
    if (!isIndicatorFile(merged[level])) errors.push(`Soubor ukazatelů (${level}) neodpovídá datovému kontraktu.`);
  }
  for (const l of layers) {
    if (!isPointLayer(l)) errors.push(`Bodová vrstva ${(l as PointLayer).id} neodpovídá datovému kontraktu.`);
  }

  // ---------- souhrn ----------
  const summary: string[] = [];
  for (const level of LEVELS) {
    const f = merged[level];
    const areas = new Set(Object.values(f.values).flatMap((b) => Object.keys(b)));
    summary.push(`Ukazatele ${level}: ${areas.size} území, ${Object.keys(f.indicators).length} ukazatelů (${Object.keys(f.indicators).join(', ')})`);
  }
  for (const l of layers) {
    const s = joinStats[l.id];
    summary.push(
      `Body ${l.id}: ${l.features.length}` +
        (s ? ` (vstup ${s.total}, doplněno bodovým dotazem ${s.joined}, mimo KV zahozeno ${s.dropped})` : '') +
        (retainedPointIds.has(l.id) ? ' [ponecháno z předchozího snapshotu]' : ''),
    );
  }
  summary.push(`Geodata: ${GEO_KEYS.map((k) => `${k} ${areaCodesOfTopology(geo[k]).length}${retainedGeo.has(k) ? ' (předchozí snapshot)' : ''}`).join(', ')}`);
  summary.push(`Cross-check ${PRIMARY_LABEL} × ${SECONDARY_LABEL}: ${crossCheckInfo}`);
  summary.push(`Zastaralé zdroje (stale): ${staleIds.size ? [...staleIds].join(', ') : 'žádné'}`);

  if (errors.length) {
    return { manifest: entries, errors, warnings, written: null, joinStats, summary };
  }

  // ---------- 7) zápis ----------
  log('> ZAPISUJI snapshot…\n');
  const files = new Map<string, string>();
  const manifest: Manifest = {
    updatedAt: now.toISOString(),
    sources: entries,
    files: { indicators: {}, points: {}, geo: {} },
  };
  for (const level of LEVELS) {
    const rel = `indicators/${level}.json`;
    files.set(rel, JSON.stringify(roundNumbers(merged[level])));
    manifest.files.indicators[level] = rel;
  }
  for (const l of layers) {
    const rel = `points/${l.id}.json`;
    manifest.files.points[l.id] = rel;
    // Vrstva ze selhaného zdroje: soubor předchozího snapshotu zůstane nedotčený.
    if (!retainedPointIds.has(l.id)) files.set(rel, JSON.stringify(l));
  }
  for (const key of GEO_KEYS) {
    if (geo[key] === undefined) continue;
    const rel = `geo/${key}.topo.json`;
    manifest.files.geo[key] = rel;
    if (!retainedGeo.has(key)) files.set(rel, JSON.stringify(geo[key]));
  }
  files.set('manifest.json', JSON.stringify(manifest, null, 1));

  const newRel = new Set([
    ...Object.values(manifest.files.indicators),
    ...Object.values(manifest.files.points),
    ...Object.values(manifest.files.geo),
    'manifest.json',
  ] as string[]);
  const oldRel = prev
    ? ([...Object.values(prev.files.indicators), ...Object.values(prev.files.points), ...Object.values(prev.files.geo)] as string[])
    : [];
  await writeSnapshotAtomic(opts.outDir, files, {
    remove: oldRel.filter((r) => !newRel.has(r)),
    // temp mimo public/ – nikdy se neservíruje ani nedostane do buildu
    tmpRoot: path.join(opts.rawDir, '.tmp-write'),
  });
  if (opts.sourcesMdPath) await writeFileAtomic(opts.sourcesMdPath, renderSourcesMd(manifest));

  return { manifest: entries, errors, warnings, written: manifest, joinStats, summary };
}

// ---------------------------------------------------------------- CLI ----------
async function main(): Promise<void> {
  const root = process.cwd();
  const outDir = path.join(root, 'public', 'data');
  const rawDir = path.join(root, 'data-raw');
  let prevManifest: Manifest | null = null;
  try {
    const j = await readJson(path.join(outDir, 'manifest.json'));
    if (isManifest(j)) prevManifest = j;
  } catch {
    // první běh – žádný předchozí snapshot
  }

  const { csuDataStat } = await import('./sources/csu-datastat.ts');
  const { csuObecNezamestnanost } = await import('./sources/csu-obec-nezamestnanost.ts');
  const { krok } = await import('./sources/krok.ts');
  const { datazapadAdapters } = await import('./sources/datazapad.ts');
  const { nrpzs } = await import('./sources/nrpzs.ts');
  const { makeCuzkGeo } = await import('./sources/cuzk-geo.ts');
  const { loadCodes } = await import('./codes.ts');
  // codes.ts (Codes) splňuje OrpCodeMapper → jeden převodník kódů pro celou pipeline.
  const cuzkGeo = makeCuzkGeo((raw) => loadCodes(path.join(raw, 'codes')));

  // Pořadí = priorita při konfliktu stejného id ukazatele (první vyhrává).
  const adapters: SourceAdapter[] = [csuDataStat, csuObecNezamestnanost, krok, ...datazapadAdapters, nrpzs, cuzkGeo];

  console.log(`KRAJ-TERM data:update – ${new Date().toISOString()}`);
  const t0 = Date.now();
  const res = await runPipeline(adapters, {
    outDir, rawDir, prevManifest, sourcesMdPath: path.join(root, 'SOURCES.md'),
  });
  console.log('\n=== SOUHRN ===');
  for (const line of res.summary) console.log(line);
  if (res.errors.length) {
    console.error(`\nVALIDACE SELHALA (${res.errors.length} chyb) – nic nebylo zapsáno:`);
    for (const e of res.errors) console.error(`  ✗ ${e}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nHOTOVO za ${((Date.now() - t0) / 1000).toFixed(1)} s – zapsáno public/data/ (${Object.keys(res.written!.files.points).length} bodových vrstev) a SOURCES.md.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error('Pipeline selhala:', err);
    process.exitCode = 1;
  });
}
