<script lang="ts">
  /**
   * Navigovatelná mapa: kraje ČR → (klik na KV) 7 ORP → (klik na ORP) obce ORP.
   * Přechod dolů = radarový zoom (600 ms) na území, pak přepnutí mapy; nahoru =
   * nová mapa začne na výřezu předchozího území a oddálí se. Bez animace při
   * `.crt-off` / prefers-reduced-motion. Bodové vrstvy jen na úrovních KV.
   *
   * Stav (level/area) drží rodič v appState; lokální ORP obcí přichází ve `view.orp`.
   * `up()` = Esc / [↑ ÚROVEŇ VÝŠ].
   */
  import type { AreaCode, IndicatorFile } from '../lib/types.ts';
  import type { Snapshot } from '../lib/data/loader.ts';
  import { areaFeatures } from '../lib/map/project.ts';
  import { valuesFor, summaryLines } from '../lib/map/values.ts';
  import { selectArea, levelUp, KV, type View } from '../lib/map/drill.ts';
  import Map, { type MapPoint } from './Map.svelte';
  import Legend from './Legend.svelte';
  import PointLayers, { styleOf } from './PointLayers.svelte';

  interface Props {
    snap: Snapshot;
    view: View;
    indicator: string;
    year: number;
    names: Record<AreaCode, string>;
    onnavigate: (v: View) => void;
  }
  const { snap, view, indicator, year, names, onnavigate }: Props = $props();

  const file = $derived<IndicatorFile | undefined>(snap.indicators[view.level]);
  const def = $derived(file?.indicators[indicator]);
  // primitivní klíč → prvky se přepočítají jen při změně úrovně/ORP (ne při každé změně výběru),
  // jinak by Map resetovala viewBox/zoom
  const featKey = $derived(`${view.level}|${view.orp ?? ''}`);
  const features = $derived.by(() => {
    const [lvl, orp] = featKey.split('|');
    if (lvl === 'kraj') return areaFeatures(snap.geo.kraje);
    if (lvl === 'orp') return areaFeatures(snap.geo['kv-orp']);
    return areaFeatures(snap.geo['kv-obce'], orp);
  });
  const values = $derived(valuesFor(file, indicator, year));

  // --- bodové vrstvy ---
  const layers = $derived(Object.values(snap.points));
  let active = $state<Record<string, boolean>>({});
  const onKV = $derived(view.level !== 'kraj');
  const inView = $derived(
    Object.fromEntries(
      layers.map((l) => [
        l.id,
        view.level === 'obec' ? l.features.filter((f) => f.orp === view.orp) : l.features,
      ]),
    ),
  );
  const counts = $derived(Object.fromEntries(layers.map((l) => [l.id, inView[l.id].length])));
  const points = $derived<MapPoint[]>(
    onKV
      ? layers.flatMap((l, i) => {
          if (!active[l.id]) return [];
          const provider = snap.manifest.sources.find((s) => s.id === l.sourceId)?.provider ?? l.sourceId;
          const { tone, glyph } = styleOf(i);
          return inView[l.id].map((f) => ({
            id: `${l.id}:${f.id}`,
            name: f.name,
            lon: f.lon,
            lat: f.lat,
            layerLabel: l.label,
            provider,
            tone,
            glyph,
          }));
        })
      : [],
  );

  // --- navigace + zoom ---
  let zoomTarget = $state<AreaCode | null>(null);
  let zoomFrom = $state<AreaCode | null>(null);
  let pending: View | null = null;

  function select(code: AreaCode) {
    if (pending) return;
    const next = selectArea(view, code);
    if (next.level !== view.level || next.orp !== view.orp) {
      pending = next;
      zoomFrom = null;
      zoomTarget = code;
    } else {
      onnavigate(next);
    }
  }

  function zoomDone() {
    const next = pending;
    pending = null;
    zoomTarget = null;
    if (next) onnavigate(next);
  }

  /** O úroveň výš. Vrací false, když už není kam. */
  export function up(): boolean {
    if (pending) return true;
    const next = levelUp(view);
    if (!next) return false;
    zoomFrom = next.level !== view.level ? (view.level === 'obec' ? view.orp : KV) : null;
    onnavigate(next);
    return true;
  }

  const mapLabel = $derived(
    view.level === 'kraj'
      ? 'Mapa krajů ČR'
      : view.level === 'orp'
        ? 'Mapa ORP Karlovarského kraje'
        : `Mapa obcí ORP ${names[view.orp ?? ''] ?? view.orp}`,
  );
  const crumbs = $derived(
    [
      'ČR',
      view.level !== 'kraj' ? (names[KV] ?? 'Karlovarský kraj') : null,
      view.level === 'obec' && view.orp ? `ORP ${names[view.orp] ?? view.orp}` : null,
    ].filter((x): x is string => !!x),
  );
</script>

<div class="drill">
  <nav class="crumbs" aria-label="Úroveň mapy">
    <span>&gt; {crumbs.join(' › ')}</span>
    {#if view.level !== 'kraj' || view.area}
      <button type="button" onclick={() => up()} data-testid="level-up">[↑ ÚROVEŇ VÝŠ]</button>
    {/if}
  </nav>
  <Map
    {features}
    {values}
    {def}
    {year}
    selected={view.area}
    preview={(c) => summaryLines(file, c, indicator, year)}
    {points}
    {zoomTarget}
    {zoomFrom}
    onzoomend={zoomDone}
    onselect={select}
    label={mapLabel}
  />
  <Legend values={features.map((f) => values[f.properties.code] ?? null)} {def} {year} />
  {#if onKV}
    <PointLayers {layers} {active} {counts} ontoggle={(id) => (active = { ...active, [id]: !active[id] })} />
  {:else}
    <p class="hint">Tip: klikněte na Karlovarský kraj pro ORP, obce a bodové vrstvy.</p>
  {/if}
</div>

<style>
  .drill {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    font-family: var(--font-display);
    font-size: 1.2rem;
    color: var(--phosphor-100);
    min-height: 1.9rem;
  }
  button {
    background: var(--bg-panel);
    color: var(--amber);
    border: 1px solid var(--amber-dim);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    padding: 3px 8px;
    cursor: pointer;
  }
  .hint {
    color: var(--phosphor-60);
    font-size: 0.85rem;
    margin: 0;
  }
</style>
