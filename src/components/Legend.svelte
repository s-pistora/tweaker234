<script lang="ts">
  /** Legenda kartogramu: 5 kvantilových tříd (vzory p0..p4) + N/A (pna). */
  import type { IndicatorDef } from '../lib/types.ts';
  import { classRanges } from '../lib/map/classify.ts';
  import { formatValue } from '../lib/sentences.ts';

  interface Props {
    values: (number | null)[];
    def?: IndicatorDef;
    year: number;
  }
  const { values, def, year }: Props = $props();

  const ranges = $derived(classRanges(values));
  const hasNA = $derived(values.some((v) => v === null));

  function fmt(v: number): string {
    return def ? formatValue(v, def) : String(v);
  }
</script>

<div class="legend" aria-label="Legenda mapy">
  <div class="legend__title">
    {def ? `${def.label} (${def.unit}), ${year}` : `Ukazatel, ${year}`}
  </div>
  <ul>
    {#each ranges as r, i (i)}
      {#if r}
        <li>
          <svg width="22" height="14" aria-hidden="true"><rect x="0.5" y="0.5" width="21" height="13" fill="url(#p{i})" class="sw" /></svg>
          <span>{r.min === r.max ? fmt(r.min) : `${fmt(r.min)} – ${fmt(r.max)}`}</span>
        </li>
      {/if}
    {/each}
    {#if hasNA}
      <li>
        <svg width="22" height="14" aria-hidden="true"><rect x="0.5" y="0.5" width="21" height="13" fill="url(#pna)" class="sw sw--na" /></svg>
        <span class="na">údaj chybí</span>
      </li>
    {/if}
  </ul>
</div>

<style>
  .legend {
    font-size: 0.85rem;
  }
  .legend__title {
    color: var(--brand-dark);
    font-weight: 500;
    margin: 10px 0 6px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    stroke: #fff;
  }
  .sw--na {
    stroke: var(--line-strong);
  }
  .na {
    color: var(--text-muted);
  }
</style>
