<script lang="ts">
  /**
   * Legenda přiblížené obce: jedna položka na vrstvu vybraného požadavku (barva + tvar
   * značky jako na mapě), počet bodů v obci a přepínač zobrazení (aria-pressed).
   */
  import { GLYPH_CHAR } from '../../lib/map/pointStyle.ts';
  import type { Vrstva } from '../../lib/zivot-mapa.ts';

  interface Props {
    vrstvy: (Vrstva & { vObci: number })[];
    skryte: ReadonlySet<string>;
    obecNazev: string;
    ontoggle: (id: string) => void;
  }
  const { vrstvy, skryte, obecNazev, ontoggle }: Props = $props();
</script>

{#if vrstvy.length}
  <div class="vrstvy" data-testid="zivot-vrstvy">
    <p class="ttl">Na mapě v obci {obecNazev} a okolí <span>· klikem vrstvu skryjete</span></p>
    <ul>
      {#each vrstvy as v (v.id)}
        {@const on = !skryte.has(v.id)}
        <li>
          <button
            type="button"
            class:off={!on}
            aria-pressed={on}
            onclick={() => ontoggle(v.id)}
            data-testid="zv-{v.id}"
          >
            <span class="zn" style="color: {v.barva}" aria-hidden="true">{GLYPH_CHAR[v.glyph]}</span>
            <span class="lbl">{v.label}</span>
            <span class="n">v obci {v.vObci}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .vrstvy {
    margin-top: 12px;
  }
  .ttl {
    margin: 0 0 8px;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--brand-dark);
  }
  .ttl span {
    font-weight: 400;
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 6px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--bg-panel);
    color: var(--brand-dark);
    font: 500 0.875rem/1.2 var(--font-display);
    cursor: pointer;
  }
  button:hover {
    border-color: var(--brand);
  }
  button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  button.off {
    background: var(--bg);
    color: var(--text-muted);
    border-style: dashed;
  }
  button.off .zn {
    opacity: 0.35;
  }
  .zn {
    font-size: 1.1rem;
    font-weight: 900;
    line-height: 1;
    -webkit-text-stroke: 0.5px #fff;
  }
  .n {
    font-weight: 400;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
