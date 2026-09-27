<script lang="ts">
  /**
   * Věková struktura jako ASCII bloky (█▓▒░) z ukazatelů `podil_<od>[_<do>]`.
   * Když takové ukazatele v souboru nejsou, nevykreslí nic.
   */
  import type { AreaCode, IndicatorFile } from '../../lib/types.ts';
  import { ageGroups, asciiBar } from '../../lib/map/charts.ts';
  import { latestValue } from '../../lib/map/values.ts';
  import { formatValue } from '../../lib/sentences.ts';

  interface Props {
    file: IndicatorFile;
    code: AreaCode;
    year: number;
  }
  const { file, code, year }: Props = $props();

  const BAR = 20;
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
</script>

{#if shown.length}
  <div class="pyr" aria-label="Věková struktura">
    <div class="pyr__title">VĚKOVÁ STRUKTURA</div>
    {#each shown as r (r.def.id)}
      <div class="row">
        <span class="lab">{r.def.label}</span>
        <span class="bar" aria-hidden="true">{asciiBar(r.lv!.value, max, BAR)}</span>
        <span class="val">{formatValue(r.lv!.value, r.def)} {r.def.unit} ({r.lv!.year})</span>
      </div>
      {#if r.nat !== undefined}
        <div class="row row--ref">
          <span class="lab">ČR</span>
          <span class="bar" aria-hidden="true">{asciiBar(r.nat, max, BAR).replace(/[█▓▒]/g, '░')}</span>
          <span class="val">{formatValue(r.nat, r.def)} {r.def.unit}</span>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .pyr {
    margin-top: 10px;
    font-size: 0.85rem;
  }
  .pyr__title {
    color: var(--phosphor-60);
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 9em) minmax(0, 1fr) auto;
    gap: 6px;
    align-items: baseline;
  }
  .lab {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    font-family: var(--font-mono);
    color: var(--phosphor-100);
    white-space: pre;
    overflow: hidden;
  }
  .row--ref .bar,
  .row--ref .lab,
  .row--ref .val {
    color: var(--phosphor-60);
  }
</style>
