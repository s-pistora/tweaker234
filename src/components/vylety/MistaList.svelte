<script lang="ts">
  /** Seznam míst kategorie: karta = název, obec a vzdálenost, štítky, stav vody; po 12 kusech. */
  import type { RazeniMist, VysledekMista } from '../../lib/vylety.ts';
  import { KATEGORIE_BY_ID, fmtKm, stitky, vodaLabel } from '../../lib/vylety.ts';

  interface Props {
    vysledky: VysledekMista[];
    vybrane: string | null;
    maDomov: boolean;
    razeni: RazeniMist;
    onrazeni: (r: RazeniMist) => void;
    onselect: (id: string) => void;
    onhover?: (id: string | null) => void;
  }
  const { vysledky, vybrane, maDomov, razeni, onrazeni, onselect, onhover }: Props = $props();

  const KROK = 12;
  let limit = $state(KROK);
  // nový výsledek filtru → zase od začátku
  $effect(() => {
    void vysledky;
    limit = KROK;
  });
  const vidim = $derived(vysledky.slice(0, limit));
</script>

<section class="list" aria-label="Seznam míst" data-testid="mista-list" data-tour="list">
  <div class="head">
    <h2>{vysledky.length ? 'Seznam míst' : 'Nic jsme nenašli'}</h2>
    {#if maDomov && vysledky.length > 1}
      <div class="sort" role="radiogroup" aria-label="Řazení">
        <button type="button" role="radio" aria-checked={razeni === 'vzdalenost'} class:on={razeni === 'vzdalenost'} onclick={() => onrazeni('vzdalenost')}
          >Nejblíž</button
        >
        <button type="button" role="radio" aria-checked={razeni === 'nazev'} class:on={razeni === 'nazev'} onclick={() => onrazeni('nazev')}
          >Podle názvu</button
        >
      </div>
    {/if}
  </div>

  {#if !vysledky.length}
    <p class="empty">Zkuste zvětšit vzdálenost nebo zrušit některý filtr.</p>
  {:else}
    <ol class="cards">
      {#each vidim as { misto: m, km } (m.id)}
        {@const def = KATEGORIE_BY_ID[m.kat]}
        <li>
          <button
            type="button"
            class="card"
            class:sel={vybrane === m.id}
            style="--c: {def.barva}"
            onclick={() => onselect(m.id)}
            onmouseenter={() => onhover?.(m.id)}
            onmouseleave={() => onhover?.(null)}
            onfocus={() => onhover?.(m.id)}
            onblur={() => onhover?.(null)}
            data-testid="misto-{m.id}"
          >
            <span class="top">
              <span class="name">{m.nazev}</span>
              {#if km !== null}<span class="km">{fmtKm(km)}</span>{/if}
            </span>
            <span class="where">{m.obecNazev || 'Karlovarský kraj'}</span>
            {#if m.voda}
              <span class="voda voda--{m.voda.trida}">{vodaLabel(m.voda.trida)}</span>
            {/if}
            <span class="tags">
              {#each stitky(m).slice(0, 4) as s (s)}<span class="tag">{s}</span>{/each}
              {#if def.vstupne && m.vstupne === false}<span class="tag tag--free">zdarma</span>{/if}
            </span>
          </button>
        </li>
      {/each}
    </ol>
    {#if vysledky.length > limit}
      <button type="button" class="more" onclick={() => (limit += KROK)}>
        Zobrazit další ({Math.min(KROK, vysledky.length - limit)} z {vysledky.length - limit})
      </button>
    {/if}
  {/if}
</section>

<style>
  .list {
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--brand-dark);
  }
  .sort {
    display: flex;
    gap: 4px;
  }
  .sort button {
    font: inherit;
    font-size: 0.9rem;
    min-height: 40px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    background: #fff;
    color: var(--text);
    border-radius: 4px;
    cursor: pointer;
  }
  .sort button.on {
    border-color: var(--brand);
    color: var(--brand);
    font-weight: 700;
  }
  .empty {
    padding: 20px;
    background: #fff;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius-lg);
    margin: 0;
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }
  .card {
    font: inherit;
    text-align: left;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 16px 14px 18px;
    background: #fff;
    border: 1px solid var(--line);
    border-left: 5px solid var(--c);
    border-radius: var(--radius);
    color: var(--text);
    cursor: pointer;
  }
  .card:hover {
    border-color: var(--brand);
    border-left-color: var(--c);
  }
  .card.sel {
    border-color: var(--accent);
    border-left-color: var(--c);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .card:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .name {
    font-weight: 700;
    color: var(--brand-dark);
    line-height: 1.3;
  }
  .km {
    flex: none;
    font-weight: 700;
    color: var(--brand);
    font-variant-numeric: tabular-nums;
  }
  .where {
    font-size: 0.88rem;
    color: var(--text-muted);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tag {
    font-size: 0.78rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--brand-ice);
    color: var(--brand-dark);
  }
  .tag--free {
    background: var(--st-volno-soft);
    color: var(--st-volno);
    font-weight: 500;
  }
  .voda {
    align-self: flex-start;
    font-size: 0.82rem;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .voda--vhodna,
  .voda--mirne {
    background: var(--st-volno-soft);
    color: var(--st-volno);
  }
  .voda--zhorsena {
    background: var(--st-ok-soft);
    color: var(--st-ok);
  }
  .voda--nevhodna,
  .voda--nebezpecna {
    background: var(--st-pretlak-soft);
    color: var(--st-pretlak);
  }
  .voda--na {
    background: var(--st-na-soft);
    color: var(--st-na);
  }
  .more {
    font: inherit;
    font-weight: 500;
    margin-top: 14px;
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--brand);
    background: #fff;
    color: var(--brand);
    border-radius: 4px;
    cursor: pointer;
  }
  @media (max-width: 560px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
