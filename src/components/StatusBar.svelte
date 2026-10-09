<script lang="ts">
  /**
   * Ovládací lišta režimů „Mapa kraje“ a „Kde by se mi žilo“: výběr ukazatele (obarvuje mapu),
   * roku a datum aktualizace dat. Přepínání režimů a zdroje jsou v hlavní navigaci (App).
   */
  import type { IndicatorDef } from '../lib/types.ts';

  interface Props {
    updatedAt: string;
    indicators: IndicatorDef[];
    indicator: string;
    years: number[];
    year: number;
    onindicator: (id: string) => void;
    onyear: (y: number) => void;
  }
  const { updatedAt, indicators, indicator, years, year, onindicator, onyear }: Props = $props();

  const updated = $derived.by(() => {
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return updatedAt;
    return new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'long', timeZone: 'Europe/Prague' }).format(d);
  });
</script>

<div class="bar" role="toolbar" aria-label="Výběr ukazatele">
  <label class="fld fld--grow">
    <span>Ukazatel</span>
    <select value={indicator} onchange={(e) => onindicator(e.currentTarget.value)} data-testid="indicator-select">
      {#each indicators as d (d.id)}
        <option value={d.id}>{d.label} ({d.unit})</option>
      {/each}
    </select>
  </label>
  {#if years.length > 1}
    <label class="fld">
      <span>Rok</span>
      <select value={String(year)} onchange={(e) => onyear(Number(e.currentTarget.value))}>
        {#each years as y (y)}
          <option value={String(y)}>{y}</option>
        {/each}
      </select>
    </label>
  {/if}
  <span class="upd" data-testid="updated-at">Data aktualizována {updated}</span>
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 16px;
  }
  .fld {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .fld--grow {
    flex: 0 1 26em;
  }
  .fld span {
    font-weight: 500;
    color: var(--brand-dark);
    font-size: 0.9rem;
  }
  select {
    font: inherit;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid #8a94a3;
    border-radius: 4px;
    background: #fff;
    color: var(--text);
    max-width: 100%;
  }
  .upd {
    color: var(--text-muted);
    font-size: 0.85rem;
    padding-bottom: 12px;
  }
</style>
