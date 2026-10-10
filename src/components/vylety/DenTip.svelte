<script lang="ts">
  /** Karta „Naplánujte mi den“ v rozcestníku Kam vyrazit. */
  import type { Den } from '../../lib/den.ts';
  import { KATEGORIE_BY_ID } from '../../lib/vylety.ts';

  interface Props {
    den: Den | null;
    domovNazev: string;
    maxKm: number;
    onjiny: () => void;
    onmisto: (id: string) => void;
  }
  const { den, domovNazev, maxKm, onjiny, onmisto }: Props = $props();
  const km = (x: number) => `${x < 10 ? x.toFixed(1).replace('.', ',') : Math.round(x)} km`;
</script>

<section class="den" aria-labelledby="den-h" data-testid="den-tip">
  <div class="den__head">
    <div>
      <p class="kicker">Tip na celý den</p>
      <h2 id="den-h">{domovNazev ? `Výlet z obce ${domovNazev}` : 'Naplánujte mi den'}</h2>
    </div>
    {#if den}
      <button type="button" class="btn-secondary" onclick={onjiny} data-testid="den-jiny">Jiný tip</button>
    {/if}
  </div>
  {#if !domovNazev}
    <p class="hint">Zvolte výše, odkud vyrážíte, a sestavíme vám okruh na celý den: dopoledne památka, odpoledne příroda nebo rozhledna, na závěr pivovar, pramen nebo zábava pro děti.</p>
  {:else if !den}
    <p class="hint">Do {maxKm} km jsme nenašli dost míst na celodenní výlet. Zkuste vzdálenost zvětšit.</p>
  {:else}
    <ol>
      {#each den.zastavky as z (z.misto.id)}
        {@const k = KATEGORIE_BY_ID[z.misto.kat]}
        <li style="--c: {k.barva}">
          <span class="cas">{z.cas}</span>
          <button type="button" class="misto" onclick={() => onmisto(z.misto.id)}>
            <strong>{z.misto.nazev}</strong>
            <span>{k.label}{z.misto.obecNazev ? ` · ${z.misto.obecNazev}` : ''} · {km(z.km)} od {z === den.zastavky[0] ? 'domova' : 'předchozí zastávky'}</span>
          </button>
        </li>
      {/each}
    </ol>
    <div class="den__foot">
      <span>Celý okruh zhruba <strong>{km(den.celkemKm)}</strong> vzdušnou čarou, včetně cesty zpět.</span>
      <a class="btn-primary" href={den.mapyUrl} target="_blank" rel="noopener noreferrer" data-testid="den-mapy">Trasa v Mapy.cz</a>
    </div>
  {/if}
</section>

<style>
  .den {
    background: #fff;
    border: 1px solid var(--line);
    border-top: 4px solid var(--accent);
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 18px;
  }
  .den__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .kicker {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brand);
  }
  h2 {
    margin: 2px 0 10px;
    font-size: 1.25rem;
  }
  .hint {
    margin: 0;
    color: var(--text-muted);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 7.5em minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 8px 0 8px 12px;
    border-left: 4px solid var(--c);
    margin-bottom: 6px;
  }
  .cas {
    font-weight: 700;
    color: var(--brand-dark);
    font-size: 0.9rem;
  }
  .misto {
    font: inherit;
    text-align: left;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    color: var(--text);
  }
  .misto strong {
    color: var(--brand-dark);
    font-weight: 500;
  }
  .misto:hover strong {
    color: var(--brand);
    text-decoration: underline;
  }
  .misto span {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .den__foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    margin-top: 10px;
    font-size: 0.92rem;
  }
  @media (max-width: 560px) {
    li {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
</style>
