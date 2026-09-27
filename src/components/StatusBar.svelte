<script lang="ts">
  /**
   * Horní lišta: datum snapshotu, výběr ukazatele (obarvuje mapu) a roku,
   * přepínač režimu PRŮZKUM / KDE BY SE MI DOBŘE ŽILO?, [ZDROJE], CRT přepínač.
   */
  import type { IndicatorDef } from '../lib/types.ts';
  import CrtToggle from './crt/CrtToggle.svelte';

  interface Props {
    updatedAt: string;
    indicators: IndicatorDef[];
    indicator: string;
    years: number[];
    year: number;
    mode: 'explore' | 'score';
    onindicator: (id: string) => void;
    onyear: (y: number) => void;
    onmode: () => void;
    onsources: () => void;
  }
  const { updatedAt, indicators, indicator, years, year, mode, onindicator, onyear, onmode, onsources }: Props =
    $props();

  const updated = $derived.by(() => {
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return updatedAt;
    return new Intl.DateTimeFormat('cs-CZ', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Prague',
    }).format(d);
  });
</script>

<div class="bar" role="toolbar" aria-label="Stavová lišta">
  <span class="upd" data-testid="updated-at">Data aktualizována: {updated}</span>
  <label>
    <span>UKAZATEL</span>
    <select value={indicator} onchange={(e) => onindicator(e.currentTarget.value)}>
      {#each indicators as d (d.id)}
        <option value={d.id}>{d.label} [{d.unit}]</option>
      {/each}
    </select>
  </label>
  {#if years.length > 1}
    <label>
      <span>ROK</span>
      <select value={String(year)} onchange={(e) => onyear(Number(e.currentTarget.value))}>
        {#each years as y (y)}
          <option value={String(y)}>{y}</option>
        {/each}
      </select>
    </label>
  {/if}
  <button type="button" class="btn" onclick={onmode} aria-pressed={mode === 'score'} data-testid="mode-toggle">
    [REŽIM: {mode === 'explore' ? 'PRŮZKUM' : 'KDE BY SE MI DOBŘE ŽILO?'}]
  </button>
  <button type="button" class="btn" onclick={onsources} data-testid="sources-btn">[ZDROJE]</button>
  <CrtToggle />
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    border: 1px solid var(--phosphor-40);
    background: var(--bg-panel);
    padding: 6px 10px;
    font-size: 0.9rem;
    box-sizing: border-box;
    max-width: 100%;
  }
  .upd {
    color: var(--phosphor-60);
    flex: 1 1 14em;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
  }
  label span {
    color: var(--phosphor-60);
  }
  select,
  .btn {
    background: var(--bg);
    color: var(--phosphor-100);
    border: 1px solid var(--phosphor-60);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    padding: 3px 6px;
    max-width: 100%;
    min-width: 0;
  }
  select {
    max-width: min(22em, 70vw);
  }
  .btn {
    color: var(--amber);
    border-color: var(--amber-dim);
    cursor: pointer;
  }
</style>
