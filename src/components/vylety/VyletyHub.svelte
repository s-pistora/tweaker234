<script lang="ts">
  /** Rozcestník „Kam vyrazit“: dlaždice kategorií (podstránky). Číslo první, pak slova. */
  import type { KategorieId } from '../../lib/types.ts';
  import { KATEGORIE, plural } from '../../lib/vylety.ts';
  import Ikona from './Ikona.svelte';

  interface Props {
    pocty: Record<KategorieId, number>;
    /** počty do zvolené vzdálenosti od bydliště; null = bydliště nezadáno */
    vDosahu: Record<KategorieId, number> | null;
    maxKm: number;
    domovNazev: string;
    onkat: (k: KategorieId) => void;
  }
  const { pocty, vDosahu, maxKm, domovNazev, onkat }: Props = $props();
</script>

<section class="hub" aria-labelledby="hub-h" data-tour="hub">
  <h2 id="hub-h" class="sr-only">Kategorie</h2>
  <ul class="tiles">
    {#each KATEGORIE as k (k.id)}
      {@const n = vDosahu ? vDosahu[k.id] : pocty[k.id]}
      <li>
        <button type="button" class="tile" onclick={() => onkat(k.id)} data-testid="kat-{k.id}">
          <span class="ico" style="--c: {k.barva}"><Ikona d={k.ikona} size={26} /></span>
          <span class="body">
            <span class="lbl">{k.label}</span>
            <span class="num"
              ><strong>{n}</strong>
              {plural(n, k.jednotky)}{#if vDosahu}<span class="near">&nbsp;do {maxKm} km od obce {domovNazev}</span
                >{/if}</span
            >
            <span class="perex">{k.perex}</span>
          </span>
          <span class="go" aria-hidden="true">→</span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .tiles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
  }
  .tile {
    font: inherit;
    text-align: left;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 18px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    color: var(--text);
    cursor: pointer;
    transition:
      border-color 0.15s,
      transform 0.15s;
  }
  .tile:hover {
    border-color: var(--brand);
    transform: translateY(-2px);
  }
  .tile:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 12%, #fff);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .lbl {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--brand-dark);
  }
  .num {
    color: var(--brand);
    font-size: 0.95rem;
  }
  .num strong {
    font-size: 1.35rem;
    font-variant-numeric: tabular-nums;
  }
  .near {
    color: var(--text-muted);
  }
  .perex {
    font-size: 0.88rem;
    color: var(--text-muted);
    line-height: 1.4;
    margin-top: 4px;
  }
  .go {
    font-size: 1.3rem;
    color: var(--brand);
    align-self: center;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .tile {
      transition: none;
    }
    .tile:hover {
      transform: none;
    }
  }
  @media (max-width: 560px) {
    .tiles {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }
    .tile {
      padding: 14px;
    }
    .perex {
      display: none;
    }
  }
</style>
