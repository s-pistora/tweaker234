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
    <legend>BODOVÉ VRSTVY</legend>
    {#each layers as l, i (l.id)}
      {@const st = styleOf(i)}
      <button
        type="button"
        aria-pressed={!!active[l.id]}
        class:on={!!active[l.id]}
        onclick={() => ontoggle(l.id)}
        data-testid="layer-{l.id}"
      >
        [{active[l.id] ? '■' : ' '}] <span class="glyph glyph--{st.tone}" aria-hidden="true">{GLYPH_CHAR[st.glyph]}</span>
        {l.label}
        <span class="cnt">({counts[l.id] ?? l.features.length})</span>
      </button>
    {/each}
  </fieldset>
{/if}

<style>
  .layers {
    border: 1px solid var(--phosphor-40);
    margin: 0;
    padding: 4px 8px 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
  legend {
    color: var(--phosphor-60);
    font-size: 0.85rem;
    padding: 0 4px;
  }
  button {
    background: var(--bg);
    color: var(--phosphor-80);
    border: 1px solid var(--phosphor-40);
    font-family: var(--font-mono);
    font-size: 0.85rem;
    padding: 2px 6px;
    cursor: pointer;
    white-space: pre;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button.on {
    border-color: var(--phosphor-60);
    color: var(--phosphor-100);
  }
  .glyph--amber {
    color: var(--amber);
  }
  .glyph--phosphor {
    color: var(--phosphor-100);
  }
  .cnt {
    color: var(--phosphor-60);
  }
</style>
