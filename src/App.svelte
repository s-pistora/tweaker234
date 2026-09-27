<script lang="ts">
  import './styles/tokens.css';
  import './styles/crt.css';
  import { onDestroy } from 'svelte';
  import Boot from './components/crt/Boot.svelte';
  import Drilldown from './components/Drilldown.svelte';
  import Detail from './components/Detail.svelte';
  import Sources from './components/Sources.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import Timeline from './components/Timeline.svelte';
  import Map from './components/Map.svelte';
  import Legend from './components/Legend.svelte';
  import WeightPanel from './components/WeightPanel.svelte';
  import HowModal, { type HowPart } from './components/HowModal.svelte';
  import { loadSnapshot, type Snapshot, type OnStep } from './lib/data/loader.ts';
  import { appState, initHashSync } from './lib/state.ts';
  import { areaFeatures } from './lib/map/project.ts';
  import { fitIndicator, yearsWithData } from './lib/map/values.ts';
  import { resolveView, detailTarget, type View } from './lib/map/drill.ts';
  import { eligibleIndicators, score, scoreIndicatorYear } from './lib/score.ts';
  import type { AreaCode, IndicatorDef } from './lib/types.ts';

  /** Kořen dat (relativně k index.html). Koordinátor přepne na 'data' při integraci. */
  const DATA_BASE = 'data/_fixtures';

  let booted = $state(false);
  let snap = $state<Snapshot | null>(null);
  let loadError = $state<string | null>(null);
  let snapPromise: Promise<Snapshot> | null = null;
  let stopSync: (() => void) | null = null;

  function load(onStep: OnStep): Promise<Snapshot> {
    snapPromise ??= loadSnapshot(onStep, DATA_BASE).then(
      (s) => {
        stopSync = initHashSync(s);
        snap = s;
        return s;
      },
      (e: unknown) => {
        loadError = e instanceof Error ? e.message : String(e);
        throw e;
      },
    );
    return snapPromise;
  }

  onDestroy(() => stopSync?.());

  const st = $derived($appState);

  /** kód → název a obec → ORP ze všech geodat */
  const geoIndex = $derived.by(() => {
    const names: Record<AreaCode, string> = {};
    const obecParent: Record<AreaCode, AreaCode> = {};
    for (const g of ['kraje', 'kv-orp', 'kv-obce'] as const) {
      for (const f of areaFeatures(snap?.geo[g])) {
        names[f.properties.code] = f.properties.name;
        if (g === 'kv-obce' && f.properties.parent) obecParent[f.properties.code] = f.properties.parent;
      }
    }
    return { names, obecParent };
  });

  // Drill-down: ORP, jehož obce se zobrazují, když na úrovni 'obec' není vybraná obec.
  let localOrp = $state<AreaCode | null>(null);
  const view = $derived<View>(
    resolveView(st.level, st.area, localOrp, (c) => geoIndex.obecParent[c] ?? null),
  );
  // hash `#/obec` bez obce a bez známého ORP → spadne na mapu ORP
  $effect(() => {
    if (snap && view.level !== st.level) navigate(view);
  });

  const file = $derived(snap?.indicators[view.level]);
  const years = $derived(yearsWithData(file, st.indicator));
  const target = $derived(detailTarget(view));

  // --- režim „Kde by se mi dobře žilo?“ (Task 16) -------------------------
  const SCORE_DEF: IndicatorDef = {
    id: 'score',
    label: 'Skóre',
    unit: '/100',
    higherIsBetter: true,
    sourceId: 'score',
    decimals: 0,
  };

  const eligible = $derived(file ? eligibleIndicators(file) : []);
  const eligibleIds = $derived(new Set(eligible.map((d) => d.id)));
  /** váhy z appState omezené na ukazatele způsobilé pro skóre (obrana proti ručně upravenému URL) */
  const scoreWeights = $derived(
    Object.fromEntries(Object.entries(st.weights).filter(([id]) => eligibleIds.has(id))),
  );
  const totalWeight = $derived(Object.values(scoreWeights).reduce((a, b) => a + b, 0));
  const scores = $derived(file && totalWeight > 0 ? score(file, st.year, scoreWeights) : {});
  const scoreValues = $derived(
    Object.fromEntries(Object.entries(scores).map(([code, s]) => [code, s.score])) as Record<
      AreaCode,
      number | null
    >,
  );

  const scoreFeatures = $derived.by(() => {
    if (!snap) return [];
    if (view.level === 'kraj') return areaFeatures(snap.geo.kraje);
    if (view.level === 'orp') return areaFeatures(snap.geo['kv-orp']);
    return areaFeatures(snap.geo['kv-obce'], view.orp);
  });
  /** skóre omezené na území aktuálně zobrazená na mapě (např. jen obce vybraného ORP) */
  const scoresInView = $derived.by(() => {
    const codes = new Set(scoreFeatures.map((f) => f.properties.code));
    return Object.fromEntries(Object.entries(scores).filter(([code]) => codes.has(code)));
  });

  function scorePreview(code: AreaCode): string[] {
    const s = scores[code];
    if (!s || s.score === null) return ['SKÓRE: N/A'];
    return [`SKÓRE ${Math.round(s.score)}/100`];
  }

  function setWeight(id: string, w: number) {
    appState.update((s) => {
      const weights = { ...s.weights };
      if (w > 0) weights[id] = w;
      else delete weights[id];
      return { ...s, weights };
    });
  }
  function selectScoreArea(code: AreaCode) {
    appState.update((s) => ({ ...s, area: code }));
  }

  /** rozpad skóre vybraného území obohacený o hodnotu/rok každé části - pro HowModal */
  const selectedParts = $derived.by((): HowPart[] => {
    if (!file || !view.area) return [];
    const s = scores[view.area];
    if (!s) return [];
    return s.parts.map((p) => {
      const y = scoreIndicatorYear(file, p.id);
      const v = y !== null ? (file.values[p.id]?.[view.area as AreaCode]?.[y] ?? null) : null;
      return { ...p, value: v, year: y };
    });
  });
  const selectedSkippedDefs = $derived.by((): IndicatorDef[] => {
    if (!file || !view.area) return [];
    const s = scores[view.area];
    if (!s) return [];
    return s.skipped.map((id) => file.indicators[id]).filter((d): d is IndicatorDef => !!d);
  });
  const howIndicators = $derived.by(() => {
    if (!file) return [];
    return Object.entries(scoreWeights)
      .filter(([id, w]) => w > 0 && id in file.indicators)
      .map(([id, weight]) => ({ def: file.indicators[id], year: scoreIndicatorYear(file, id), weight }));
  });

  /** poslední ukazatel zvolený uživatelem – při návratu na úroveň, kde existuje, se obnoví */
  let preferredIndicator: string | null = null;

  function navigate(v: View) {
    localOrp = v.orp;
    const f = snap?.indicators[v.level];
    appState.update((s) => ({
      ...s,
      level: v.level,
      area: v.area,
      ...fitIndicator(f, f && preferredIndicator && preferredIndicator in f.indicators ? preferredIndicator : s.indicator, s.year),
    }));
  }
  function setIndicator(id: string) {
    preferredIndicator = id;
    appState.update((s) => ({ ...s, ...fitIndicator(file, id, s.year) }));
  }
  function setYear(y: number) {
    appState.update((s) => ({ ...s, year: y }));
  }
  function toggleMode() {
    appState.update((s) => ({ ...s, mode: s.mode === 'explore' ? 'score' : 'explore' }));
  }

  let drill = $state<ReturnType<typeof Drilldown> | null>(null);
  let sourcesOpen = $state(false);
  let sourcesTrigger: HTMLElement | null = null;
  let howOpen = $state(false);
  let howTrigger: HTMLElement | null = null;

  function openSources() {
    sourcesTrigger = document.activeElement as HTMLElement | null;
    sourcesOpen = true;
  }
  function closeSources() {
    sourcesOpen = false;
    sourcesTrigger?.focus?.();
  }
  function openHow() {
    howTrigger = document.activeElement as HTMLElement | null;
    howOpen = true;
  }
  function closeHow() {
    howOpen = false;
    howTrigger?.focus?.();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !booted || !snap) return;
    if (sourcesOpen) {
      closeSources();
      return;
    }
    if (howOpen) {
      closeHow();
      return;
    }
    drill?.up();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if !booted}
  <Boot {load} ondone={() => (booted = true)} />
{:else}
  <div class="crt-screen app">
    <header>
      <h1 class="crt-glow">KRAJ-TERM</h1>
      {#if snap}
        <StatusBar
          updatedAt={snap.updatedAt}
          indicators={Object.values(file?.indicators ?? {})}
          indicator={st.indicator}
          {years}
          year={st.year}
          mode={st.mode}
          onindicator={setIndicator}
          onyear={setYear}
          onmode={toggleMode}
          onsources={openSources}
        />
      {/if}
    </header>
    {#if loadError}
      <p class="error" role="alert">&gt; CHYBA: data nelze načíst ({loadError}).</p>
    {:else if !snap}
      <p role="status">&gt; NAČÍTÁM DATA…</p>
    {:else}
      <main class="layout">
        <section class="map-col" aria-label="Mapa">
          {#if st.mode === 'explore'}
            <Drilldown
              bind:this={drill}
              {snap}
              {view}
              indicator={st.indicator}
              year={st.year}
              names={geoIndex.names}
              onnavigate={navigate}
            />
            <Timeline {years} year={st.year} onyear={setYear} />
          {:else}
            <WeightPanel
              indicators={eligible}
              weights={scoreWeights}
              names={geoIndex.names}
              scores={scoresInView}
              selected={view.area}
              onweight={setWeight}
              onselect={selectScoreArea}
              onhow={openHow}
            />
            {#if totalWeight > 0}
              <Map
                features={scoreFeatures}
                values={scoreValues}
                def={SCORE_DEF}
                year={st.year}
                selected={view.area}
                preview={scorePreview}
                onselect={selectScoreArea}
                label="Mapa skóre"
              />
              <Legend
                values={scoreFeatures.map((f) => scoreValues[f.properties.code] ?? null)}
                def={SCORE_DEF}
                year={st.year}
              />
            {:else}
              <div class="ascii-panel">
                <h2 class="ascii-panel__title">&gt; NASTAV VÁHY KRITÉRIÍ</h2>
                <p>
                  Bez alespoň jedné nenulové váhy nemá obarvení mapy smysl. Nastavte váhy kritérií v panelu
                  vlevo posuvníky 0–5.
                </p>
              </div>
            {/if}
          {/if}
        </section>
        <section class="panel-col" aria-label="Detail území">
          <p class="sr-only" aria-live="polite">
            {target ? `Detail: ${geoIndex.names[target.code] ?? target.code}` : ''}
          </p>
          {#if target}
            {#key `${target.level}:${target.code}`}
              <Detail
                {snap}
                level={target.level}
                code={target.code}
                name={geoIndex.names[target.code] ?? target.code}
                indicator={st.indicator}
                year={st.year}
              />
            {/key}
          {:else}
            <div class="ascii-panel">
              <h2 class="ascii-panel__title">&gt; ČEKÁM NA DOTAZ_</h2>
              <p>
                Vyberte kraj na mapě (klik, nebo Tab a Enter; šipky přeskakují mezi sousedy). Karlovarský kraj
                lze rozkliknout na ORP a obce. Esc = o úroveň výš.
              </p>
            </div>
          {/if}
        </section>
      </main>
      {#if sourcesOpen}
        <Sources sources={snap.manifest.sources} updatedAt={snap.updatedAt} onclose={closeSources} />
      {/if}
      {#if howOpen}
        <HowModal
          indicators={howIndicators}
          selectedName={view.area ? (geoIndex.names[view.area] ?? view.area) : null}
          parts={selectedParts}
          skipped={selectedSkippedDefs}
          onclose={closeHow}
        />
      {/if}
    {/if}
  </div>
{/if}

<style>
  .app {
    min-height: 100vh;
    padding: 12px 16px;
    box-sizing: border-box;
  }
  h1 {
    font-family: var(--font-display);
    color: var(--phosphor-100);
    margin: 0;
  }
  header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }
  .error {
    color: var(--amber);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 16px;
    align-items: start;
  }
  .map-col,
  .panel-col {
    min-width: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (max-width: 800px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 480px) {
    .app {
      padding: 8px;
      border-radius: 0;
    }
  }
</style>
