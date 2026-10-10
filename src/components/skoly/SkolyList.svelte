<script lang="ts">
  /**
   * Výsledky seskupené podle školy: karta = škola, uvnitř obory odpovídající filtru.
   * Pořadí škol podle prvního výskytu ve vstupu (ten je už seřazený podle vzdálenosti
   * nebo volných míst). Najetí na kartu zvýrazní školu v mapě (onhover).
   */
  import type { Obor } from '../../lib/types.ts';
  import {
    naplnenostSkoly,
    procenta,
    tridaNaplnenosti,
    trend,
    klicOboru,
    type OborVysledek,
    type Razeni,
  } from '../../lib/skoly.ts';

  interface Props {
    vysledky: OborVysledek[];
    vybrana: string | null;
    zvyraznena?: string | null;
    maDomov: boolean;
    domovNazev?: string;
    maxKm?: number;
    razeni: Razeni;
    onrazeni: (r: Razeni) => void;
    onselect: (izo: string) => void;
    onhover?: (izo: string | null) => void;
    /** klíče oborů vybraných ke srovnání */
    porovnani?: string[];
    onporovnat?: (klic: string) => void;
  }
  const {
    vysledky,
    vybrana,
    zvyraznena = null,
    maDomov,
    domovNazev = '',
    maxKm = 0,
    razeni,
    onrazeni,
    onselect,
    onhover,
    porovnani = [],
    onporovnat,
  }: Props = $props();

  interface Skupina {
    izo: string;
    skola: string;
    obec: string;
    km: number | null;
    obory: OborVysledek[];
    mist: number;
    podil: number | null;
    zastavky: number;
  }

  const skupiny = $derived.by((): Skupina[] => {
    const m = new Map<string, Skupina>();
    for (const r of vysledky) {
      let g = m.get(r.obor.izo);
      if (!g) {
        g = {
          izo: r.obor.izo,
          skola: r.obor.skola,
          obec: r.obor.obec,
          km: r.km,
          obory: [],
          mist: 0,
          podil: null,
          zastavky: r.obor.zastavky500m,
        };
        m.set(r.obor.izo, g);
      }
      g.obory.push(r);
      g.mist += r.obor.zamer[2026] ?? 0;
    }
    for (const g of m.values()) g.podil = naplnenostSkoly(g.obory.map((r) => r.obor) as Obor[]);
    return [...m.values()];
  });

  const KROK = 8;
  let limit = $state(KROK);
  $effect(() => {
    void vysledky;
    limit = KROK;
  });
  const zobrazene = $derived(skupiny.slice(0, limit));
  const NAHLED = 4;

  const pl = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);
  function kratce(skola: string): string {
    return skola
      .replace(/,?\s*příspěvková organizace$/i, '')
      .replace(/,?\s*s\.\s*r\.\s*o\.$/i, '')
      .replace(/,?\s*o\.\s*p\.\s*s\.$/i, '');
  }
  const TYP = { maturita: 'Maturita', vyucni: 'Výuční list', jine: 'Bez maturity' } as const;
  const kmTxt = (km: number) => (km < 1 ? '< 1 km' : `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`);
</script>

<section class="list" aria-label="Nalezené školy" data-testid="obory-list">
  <header class="head">
    <h2>
      {#if maDomov}
        {skupiny.length} {pl(skupiny.length, 'škola', 'školy', 'škol')} do {maxKm} km{domovNazev ? ` od ${domovNazev}` : ''}
      {:else}
        {skupiny.length} {pl(skupiny.length, 'škola', 'školy', 'škol')} v kraji
      {/if}
    </h2>
    <p class="sub">
      {vysledky.length} {pl(vysledky.length, 'obor', 'obory', 'oborů')} pro školní rok 2026/27
    </p>
    <div class="sort" role="radiogroup" aria-label="Řazení výsledků">
      <button
        type="button"
        role="radio"
        aria-checked={razeni === 'vzdalenost'}
        class:on={razeni === 'vzdalenost'}
        onclick={() => onrazeni('vzdalenost')}>{maDomov ? 'Nejblíž' : 'Abecedně'}</button
      >
      <button
        type="button"
        role="radio"
        aria-checked={razeni === 'volno'}
        class:on={razeni === 'volno'}
        onclick={() => onrazeni('volno')}>Nejvíc volných míst</button
      >
    </div>
  </header>

  {#if !maDomov}
    <p class="tip">
      <strong>Začněte krokem 1.</strong> Vyberte obec, kde bydlíte – ukážeme školy v dosahu a seřadíme
      je podle vzdálenosti.
    </p>
  {/if}

  {#if skupiny.length === 0}
    <div class="empty">
      <strong>Nic jsme nenašli.</strong>
      <span>Zkuste dojíždět dál, nebo změňte typ školy či zaměření.</span>
    </div>
  {:else}
    <ul class="cards">
      {#each zobrazene as g (g.izo)}
        {@const t = tridaNaplnenosti(g.podil)}
        <li>
          <article
            class="card"
            class:sel={vybrana === g.izo}
            class:hl={zvyraznena === g.izo}
            onmouseenter={() => onhover?.(g.izo)}
            onmouseleave={() => onhover?.(null)}
          >
            <button
              type="button"
              class="card__head"
              aria-pressed={vybrana === g.izo}
              onclick={() => onselect(g.izo)}
              onfocus={() => onhover?.(g.izo)}
              onblur={() => onhover?.(null)}
              data-testid="obor-row"
            >
              <span class="dot dot--{t}" aria-hidden="true"></span>
              <span class="name">
                <span class="skola">{kratce(g.skola)}</span>
                <span class="meta">
                  {kratce(g.skola).includes(g.obec) ? '' : `${g.obec} · `}{g.obory.length}
                  {pl(g.obory.length, 'obor', 'obory', 'oborů')} · {g.mist} míst
                  {#if g.zastavky > 0}· autobus {g.zastavky} {pl(g.zastavky, 'zastávka', 'zastávky', 'zastávek')} u školy{/if}
                </span>
              </span>
              {#if g.km !== null}<span class="km">{kmTxt(g.km)}</span>{/if}
            </button>

            <ul class="obory">
              {#each g.obory.slice(0, NAHLED) as r (r.obor.kodOboru + r.obor.forma)}
                {@const o = r.obor}
                {@const tr = tridaNaplnenosti(r.naplnenost)}
                {@const vyvoj = trend(o)}
                <li class="obor-li">
                  <button type="button" class="obor" onclick={() => onselect(g.izo)}>
                    <span class="obor__n">{o.nazevOboru}</span>
                    <span class="obor__t">{TYP[o.typ]} · {o.delka}</span>
                    <span class="obor__m">
                      {o.zamer[2026]} míst{#if vyvoj === 1}<span class="up" title="víc míst než v 2024/25">&nbsp;↑</span>{:else if vyvoj === -1}<span
                          class="down"
                          title="méně míst než v 2024/25">&nbsp;↓</span
                        >{/if}
                    </span>
                    <span class="obor__p obor__p--{tr}" title="loňská obsazenost">
                      <span class="mini" aria-hidden="true"
                        ><span style="width: {Math.min(100, (r.naplnenost ?? 0) * 100)}%"></span></span
                      >
                      {r.naplnenost === null ? 'nový' : procenta(r.naplnenost)}
                    </span>
                  </button>
                  {#if onporovnat}
                    {@const k = klicOboru(o)}
                    <button
                      type="button"
                      class="cmp"
                      class:on={porovnani.includes(k)}
                      aria-pressed={porovnani.includes(k)}
                      aria-label="Porovnat obor {o.nazevOboru}"
                      title={porovnani.includes(k) ? 'Odebrat ze srovnání' : 'Přidat ke srovnání'}
                      onclick={() => onporovnat(k)}
                      data-testid="porovnat">{porovnani.includes(k) ? '✓' : '+'}</button
                    >
                  {/if}
                </li>
              {/each}
            </ul>
            {#if g.obory.length > NAHLED}
              <button type="button" class="more-in" onclick={() => onselect(g.izo)}>
                + {g.obory.length - NAHLED} {pl(g.obory.length - NAHLED, 'další obor', 'další obory', 'dalších oborů')}
              </button>
            {/if}
          </article>
        </li>
      {/each}
    </ul>
    {#if skupiny.length > limit}
      <button type="button" class="btn-secondary more" onclick={() => (limit += KROK)}>
        Zobrazit další školy ({skupiny.length - limit})
      </button>
    {/if}
    <p class="foot">
      Procento = jak byl obor loni obsazený (přijatí k 30. 9. 2025 / plánovaná místa). „Nový“ = loni
      neotevíral nebo údaj chybí.{#if onporovnat} Tlačítkem + přidáte obor ke srovnání (nejvýš tři).{/if}
    </p>
  {/if}
</section>

<style>
  .list {
    min-width: 0;
  }
  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 2px 16px;
    margin-bottom: 14px;
  }
  .head h2 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }
  .sub {
    margin: 0;
    color: var(--text-muted);
    grid-row: 2;
  }
  .sort {
    grid-row: 1 / span 2;
    grid-column: 2;
    display: flex;
    background: #e8eef6;
    border-radius: 8px;
    padding: 3px;
  }
  .sort button {
    font: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    min-height: 38px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .sort button.on {
    background: #fff;
    color: var(--brand-dark);
    box-shadow: 0 1px 3px rgba(12, 24, 56, 0.12);
  }
  .tip {
    margin: 0 0 14px;
    padding: 12px 16px;
    border-radius: 8px;
    background: #fff8e1;
    border: 1px solid #f5d77a;
    color: var(--brand-dark);
    font-size: 0.95rem;
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 28px;
    text-align: center;
    background: #fff;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius-lg);
    color: var(--text-muted);
  }
  .empty strong {
    color: var(--brand-dark);
    font-size: 1.1rem;
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(12, 24, 56, 0.04);
    overflow: hidden;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .card.hl {
    border-color: #9ec8e9;
    box-shadow: 0 4px 16px rgba(0, 70, 155, 0.1);
  }
  .card.sel {
    border-color: var(--brand);
    box-shadow: 0 0 0 2px rgba(0, 70, 155, 0.15);
  }
  .card__head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
    width: 100%;
    padding: 16px 18px 12px;
    background: none;
    border: 0;
    font: inherit;
    text-align: left;
    cursor: pointer;
    color: inherit;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    margin-top: 6px;
    box-shadow: 0 0 0 3px #fff, 0 0 0 4px var(--line);
  }
  .dot--volno {
    background: var(--data-2);
  }
  .dot--ok {
    background: var(--data-3);
  }
  .dot--pretlak {
    background: var(--data-6);
  }
  .dot--na {
    background: #6b7686;
  }
  .name {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .skola {
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.3;
    color: var(--brand-dark);
  }
  .card__head:hover .skola {
    color: var(--brand);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .meta {
    font-size: 0.88rem;
    color: var(--text-muted);
  }
  .km {
    font-weight: 700;
    color: var(--brand);
    background: var(--brand-ice);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .obory {
    list-style: none;
    margin: 0;
    padding: 0 10px 8px;
  }
  .obor-li {
    display: flex;
    align-items: stretch;
    border-top: 1px solid #edf1f6;
  }
  .obor-li .obor {
    border-top: 0;
    flex: 1;
    min-width: 0;
  }
  .cmp {
    flex: none;
    align-self: center;
    width: 36px;
    height: 36px;
    min-width: 36px;
    margin-left: 4px;
    border: 1px solid var(--brand);
    border-radius: 50%;
    background: #fff;
    color: var(--brand);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .cmp.on {
    background: var(--brand);
    color: #fff;
  }
  .obor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto 7.5em;
    align-items: center;
    gap: 4px 14px;
    width: 100%;
    padding: 9px 8px;
    border: 0;
    border-top: 1px solid #edf1f6;
    background: none;
    font: inherit;
    font-size: 0.92rem;
    text-align: left;
    color: var(--text);
    cursor: pointer;
    border-radius: 6px;
  }
  .obor:hover {
    background: var(--brand-ice);
  }
  .obor__n {
    font-weight: 500;
    color: var(--brand-dark);
  }
  .obor__t,
  .obor__m {
    color: var(--text-muted);
    white-space: nowrap;
    font-size: 0.85rem;
  }
  .up {
    color: var(--st-volno);
  }
  .down {
    color: var(--st-pretlak);
  }
  .obor__p {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    font-weight: 700;
    white-space: nowrap;
    color: var(--brand-dark);
  }
  .mini {
    width: 44px;
    height: 6px;
    border-radius: 3px;
    background: #e3e8ef;
    overflow: hidden;
    display: block;
  }
  .mini span {
    display: block;
    height: 100%;
  }
  .obor__p--volno .mini span {
    background: var(--data-2);
  }
  .obor__p--ok .mini span {
    background: var(--data-3);
  }
  .obor__p--pretlak .mini span {
    background: var(--data-6);
  }
  .obor__p--na {
    color: var(--text-muted);
    font-weight: 500;
  }
  .more-in {
    display: block;
    width: 100%;
    padding: 10px 18px 14px;
    background: none;
    border: 0;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--brand);
    text-align: left;
    cursor: pointer;
  }
  .more-in:hover {
    text-decoration: underline;
  }
  .more {
    width: 100%;
    margin-top: 16px;
  }
  .foot {
    margin: 14px 0 0;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  @media (max-width: 640px) {
    .head {
      grid-template-columns: minmax(0, 1fr);
    }
    .sort {
      grid-row: auto;
      grid-column: 1;
      margin-top: 8px;
      justify-self: start;
    }
    .obor {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .obor__t {
      grid-column: 1;
    }
    .obor__m {
      grid-column: 2;
      grid-row: 1;
    }
    .obor__p {
      grid-column: 2;
    }
  }
</style>
