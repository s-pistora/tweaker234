<script lang="ts">
  import './styles/tokens.css';
  import './styles/crt.css';
  import { onDestroy } from 'svelte';
  import Boot from './components/crt/Boot.svelte';
  import Drilldown from './components/Drilldown.svelte';
  import Detail from './components/Detail.svelte';
  import Sources from './components/Sources.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import { loadSnapshot, type Snapshot, type OnStep } from './lib/data/loader.ts';
  import { appState, initHashSync } from './lib/state.ts';
  import { areaFeatures } from './lib/map/project.ts';
  import { fitIndicator, yearsWithData } from './lib/map/values.ts';
  import { resolveView, detailTarget, type View } from './lib/map/drill.ts';
  import type { AreaCode } from './lib/types.ts';

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

  let drill = $state<ReturnType<typeof Drilldown> | null>(null);
  let sourcesOpen = $state(false);
  let sourcesTrigger: HTMLElement | null = null;

  function openSources() {
    sourcesTrigger = document.activeElement as HTMLElement | null;
    sourcesOpen = true;
  }
  function closeSources() {
    sourcesOpen = false;
    sourcesTrigger?.focus?.();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !booted || !snap) return;
    if (sourcesOpen) {
      closeSources();
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
          onindicator={setIndicator}
          onyear={setYear}
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
          <Drilldown
            bind:this={drill}
            {snap}
            {view}
            indicator={st.indicator}
            year={st.year}
            names={geoIndex.names}
            onnavigate={navigate}
          />
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
