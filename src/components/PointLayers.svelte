<script lang="ts">
  /** Přepínače bodových vrstev (generické přes PointLayer ze snapshotu). */
  import type { PointLayer } from '../lib/types.ts';
  import { styleOf, GLYPH_CHAR } from '../lib/map/pointStyle.ts';

  interface Props {
    layers: PointLayer[];
    active: Record<string, boolean>;
    /** počet bodů vrstvy v aktuálním výřezu */
    counts?: Record<string, number>;
    ontoggle: (id: string) => void;
  }
  const { layers, active, counts = {}, ontoggle }: Props = $props();

</script>

{#if layers.length}
  <fieldset class="layers">
    <legend>Zobrazit na mapě</legend>
    {#each layers as l, i (l.id)}
      {@const st = styleOf(i)}
      <button
        type="button"
        aria-pressed={!!active[l.id]}
        class:on={!!active[l.id]}
        onclick={() => ontoggle(l.id)}
        data-testid="layer-{l.id}"
      >
        <span class="box" aria-hidden="true">{active[l.id] ? '✓' : ''}</span> <span class="glyph glyph--{st.tone}" aria-hidden="true">{GLYPH_CHAR[st.glyph]}</span>
        {l.label}
        <span class="cnt">({counts[l.id] ?? l.features.length})</span>
      </button>
    {/each}
  </fieldset>
{/if}

<style>
  .layers {
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: #fff;
    margin: 0;
    padding: 10px 14px 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  legend {
    font-weight: 500;
    color: var(--brand-dark);
    padding: 0 4px;
  }
  button {
    font: inherit;
    font-size: 0.9rem;
    min-height: 40px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #fff;
    color: var(--text);
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    cursor: pointer;
  }
  button.on {
    border-color: var(--brand);
    background: var(--brand-ice);
    color: var(--brand-dark);
  }
  .box {
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--brand);
    border-radius: 3px;
    font-size: 0.75rem;
    color: #fff;
    background: #fff;
  }
  button.on .box {
    background: var(--brand);
  }
  .glyph {
    font-weight: 900;
  }
  .glyph--amber {
    color: var(--data-6);
  }
  .glyph--phosphor {
    color: var(--brand-dark);
  }
  .cnt {
    color: var(--text-muted);
  }
</style>
