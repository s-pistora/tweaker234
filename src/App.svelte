<script lang="ts">
  import './styles/tokens.css';
  import './styles/crt.css';
  import { onDestroy } from 'svelte';
  import Boot from './components/crt/Boot.svelte';
  import Map from './components/Map.svelte';
  import Legend from './components/Legend.svelte';
  import { loadSnapshot, type Snapshot, type OnStep } from './lib/data/loader.ts';
  import { appState, initHashSync } from './lib/state.ts';
  import { areaFeatures } from './lib/map/project.ts';
  import { valuesFor, summaryLines, fitIndicator } from './lib/map/values.ts';
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
  const file = $derived(snap?.indicators[st.level]);
  const def = $derived(file?.indicators[st.indicator]);
  const features = $derived(areaFeatures(snap?.geo.kraje));
  const values = $derived(valuesFor(file, st.indicator, st.year));

  function select(code: AreaCode) {
    appState.update((s) => ({ ...s, area: code, ...fitIndicator(file, s.indicator, s.year) }));
  }
</script>

{#if !booted}
  <Boot {load} ondone={() => (booted = true)} />
{:else}
  <div class="crt-screen app">
    <header>
      <h1 class="crt-glow">KRAJ-TERM</h1>
    </header>
    {#if loadError}
      <p class="error" role="alert">&gt; CHYBA: data nelze načíst ({loadError}).</p>
    {:else if !snap}
      <p role="status">&gt; NAČÍTÁM DATA…</p>
    {:else}
      <main class="layout">
        <section class="map-col" aria-label="Mapa">
          <Map
            {features}
            {values}
            {def}
            year={st.year}
            selected={st.area}
            preview={(c) => summaryLines(file, c, st.indicator, st.year)}
            onselect={select}
            label="Mapa krajů ČR"
          />
          <Legend values={features.map((f) => values[f.properties.code] ?? null)} {def} year={st.year} />
        </section>
      </main>
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
    margin: 0 0 8px;
  }
  .error {
    color: var(--amber);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 16px;
  }
  .map-col {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  @media (max-width: 800px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
