<script lang="ts">
  /** Výsledky hledání: jeden řádek = jeden obor, klik vybere školu (detail vpravo). */
  import {
    TYP_LABEL,
    asciiBar,
    procenta,
    trend,
    trendChar,
    tridaNaplnenosti,
    type OborVysledek,
  } from '../../lib/skoly.ts';

  interface Props {
    vysledky: OborVysledek[];
    vybrana: string | null;
    maDomov: boolean;
    onselect: (izo: string) => void;
  }
  const { vysledky, vybrana, maDomov, onselect }: Props = $props();

  const LIMIT = 60;
  let vse = $state(false);
  const zobrazene = $derived(vse ? vysledky : vysledky.slice(0, LIMIT));
  const pocetSkol = $derived(new Set(vysledky.map((r) => r.obor.izo)).size);

  function kratce(skola: string): string {
    return skola.replace(/,?\s*příspěvková organizace$/i, '').replace(/,?\s*s\.\s*r\.\s*o\.$/i, '');
  }
</script>

<section class="list" aria-label="Nalezené obory" data-testid="obory-list">
  <h2>
    &gt; NALEZENO {vysledky.length} OBORŮ NA {pocetSkol} ŠKOLÁCH{maDomov ? '' : ' (CELÝ KRAJ)'}
  </h2>
  {#if vysledky.length === 0}
    <p class="empty">Nic nenalezeno. Zkus zvětšit dosah nebo změnit typ studia.</p>
  {:else}
    <ul>
      {#each zobrazene as r (r.obor.izo + r.obor.kodOboru + r.obor.forma)}
        {@const o = r.obor}
        {@const t = tridaNaplnenosti(r.naplnenost)}
        <li>
          <button
            type="button"
            class:sel={vybrana === o.izo}
            aria-pressed={vybrana === o.izo}
            onclick={() => onselect(o.izo)}
            data-testid="obor-row"
          >
            <span class="obor">{o.nazevOboru}</span>
            <span class="meta">
              {kratce(o.skola)} · {o.obec}{r.km !== null ? ` · ${r.km.toFixed(0)} km` : ''}
            </span>
            <span class="nums">
              <span class="typ">{TYP_LABEL[o.typ]}{o.forma && o.forma !== 'denní' ? `, ${o.forma}` : ''}</span>
              <span title="plánovaná místa 2026/27 a vývoj od 2024/25">míst {o.zamer[2026]} {trendChar(trend(o))}</span>
              <span class="bar bar--{t}" title="loni obsazeno: přijatí k 30. 9. 2025 / plán 2025/26">
                {asciiBar(r.naplnenost, 8)} {procenta(r.naplnenost)}
              </span>
              <span title="autobusové zastávky do 500 m">BUS {o.zastavky500m}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
    {#if vysledky.length > LIMIT}
      <button type="button" class="more" onclick={() => (vse = !vse)}>
        [{vse ? 'MÉNĚ' : `ZOBRAZIT VŠECH ${vysledky.length}`}]
      </button>
    {/if}
    <p class="legend">
      Pruh = jak byl obor loni obsazený (přijatí / plánovaná místa).
      <span class="bar--volno">pod 70 % = hodně volno</span>, <span class="bar--ok">70–100 %</span>,
      <span class="bar--pretlak">nad 100 % = přetlak</span>.
    </p>
  {/if}
</section>

<style>
  .list {
    border: 1px solid var(--phosphor-40);
    background: var(--bg-panel);
    padding: 8px 12px;
    margin-top: 10px;
    min-width: 0;
  }
  h2 {
    font-family: var(--font-display);
    font-size: 1.3rem;
    color: var(--phosphor-100);
    margin: 0 0 6px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 60vh;
    overflow-y: auto;
  }
  li + li {
    border-top: 1px dashed var(--phosphor-40);
  }
  li button {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    padding: 6px 4px;
    color: var(--phosphor-80);
    font-family: var(--font-mono);
    font-size: 0.88rem;
    cursor: pointer;
  }
  li button:hover,
  li button.sel {
    background: rgba(51, 255, 102, 0.08);
  }
  li button.sel {
    outline: 1px solid var(--amber);
  }
  .obor {
    color: var(--phosphor-100);
    font-weight: 600;
  }
  .meta {
    color: var(--phosphor-60);
  }
  .nums {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
  }
  .typ {
    color: var(--phosphor-60);
  }
  .bar {
    white-space: pre;
  }
  .bar--volno {
    color: var(--phosphor-100);
  }
  .bar--ok {
    color: var(--phosphor-80);
  }
  .bar--pretlak {
    color: var(--amber);
  }
  .bar--na {
    color: var(--phosphor-60);
  }
  .empty,
  .legend {
    color: var(--phosphor-60);
    font-size: 0.8rem;
    margin: 6px 0 0;
  }
  .more {
    margin-top: 6px;
    background: var(--bg);
    color: var(--amber);
    border: 1px solid var(--amber-dim);
    font-family: var(--font-mono);
    cursor: pointer;
  }
</style>
