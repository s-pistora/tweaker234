<script lang="ts">
  /**
   * Věková struktura jako vodorovné pruhy (území modře, ČR šedě) z ukazatelů `podil_<od>[_<do>]`.
   * Když takové ukazatele v souboru nejsou, nevykreslí nic.
   */
  import type { AreaCode, IndicatorFile } from '../../lib/types.ts';
  import { ageGroups } from '../../lib/map/charts.ts';
  import { latestValue } from '../../lib/map/values.ts';
  import { formatValue } from '../../lib/sentences.ts';

  interface Props {
    file: IndicatorFile;
    code: AreaCode;
    year: number;
  }
  const { file, code, year }: Props = $props();

  const rows = $derived(
    ageGroups(file.indicators).map((def) => {
      const lv = latestValue(file.values[def.id]?.[code], year);
      const nat = lv ? file.national?.[def.id]?.[lv.year] : undefined;
      return { def, lv, nat };
    }),
  );
  const max = $derived(
    Math.max(0, ...rows.flatMap((r) => [r.lv?.value ?? 0, r.nat ?? 0]).filter(Number.isFinite)),
  );
  const shown = $derived(rows.filter((r) => r.lv));
  const w = (v: number) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0);
</script>

{#if shown.length}
  <div class="pyr" aria-label="Věková struktura">
    <div class="pyr__title">Věková struktura</div>
    {#each shown as r (r.def.id)}
      <div class="row">
        <span class="lab">{r.def.label}</span>
        <span class="bar" aria-hidden="true"><span class="fill" style="width: {w(r.lv!.value)}%"></span></span>
        <span class="val">{formatValue(r.lv!.value, r.def)} {r.def.unit} ({r.lv!.year})</span>
      </div>
      {#if r.nat !== undefined}
        <div class="row row--ref">
          <span class="lab">ČR</span>
          <span class="bar" aria-hidden="true"><span class="fill" style="width: {w(r.nat)}%"></span></span>
          <span class="val">{formatValue(r.nat, r.def)} {r.def.unit}</span>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .pyr {
    margin-top: 16px;
    font-size: 0.88rem;
  }
  .pyr__title {
    font-weight: 500;
    color: var(--brand-dark);
    margin-bottom: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 9em) minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    margin: 2px 0;
  }
  .lab {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    display: block;
    height: 10px;
    background: var(--brand-ice);
    border-radius: 2px;
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--data-1);
  }
  .row--ref .fill {
    background: var(--data-rest);
  }
  .row--ref .lab,
  .row--ref .val {
    color: var(--text-muted);
  }
  .val {
    white-space: nowrap;
  }
</style>
