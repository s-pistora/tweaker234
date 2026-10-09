<script lang="ts">
  /** Výsledky hledání jako karty: jeden obor = jedna karta, klik otevře detail školy. */
  import { trend, type OborVysledek, type Razeni } from '../../lib/skoly.ts';
  import Naplnenost from './Naplnenost.svelte';

  interface Props {
    vysledky: OborVysledek[];
    vybrana: string | null;
    maDomov: boolean;
    razeni: Razeni;
    onrazeni: (r: Razeni) => void;
    onselect: (izo: string) => void;
  }
  const { vysledky, vybrana, maDomov, razeni, onrazeni, onselect }: Props = $props();

  const LIMIT = 40;
  let vse = $state(false);
  const zobrazene = $derived(vse ? vysledky : vysledky.slice(0, LIMIT));
  const pocetSkol = $derived(new Set(vysledky.map((r) => r.obor.izo)).size);

  function kratce(skola: string): string {
    return skola
      .replace(/,?\s*příspěvková organizace$/i, '')
      .replace(/,?\s*s\.\s*r\.\s*o\.$/i, '')
      .replace(/,?\s*o\.\s*p\.\s*s\.$/i, '');
  }
  function oboru(n: number): string {
    return n === 1 ? 'obor' : n >= 2 && n <= 4 ? 'obory' : 'oborů';
  }
  function skol(n: number): string {
    return n === 1 ? 'škole' : 'školách';
  }
  function zastavek(n: number): string {
    return n === 1 ? '1 zastávka' : n <= 4 ? `${n} zastávky` : `${n} zastávek`;
  }
  const TYP_TXT = { maturita: 's maturitou', vyucni: 's výučním listem', jine: 'jiné' } as const;
  const TREND_TXT = { '1': 'víc míst než dřív', '-1': 'méně míst než dřív', '0': '' } as const;
</script>

<section class="list" aria-label="Nalezené obory" data-testid="obory-list">
  <div class="head">
    <h2>
      {vysledky.length}
      {oboru(vysledky.length)} na {pocetSkol}
      {skol(pocetSkol)}
    </h2>
    <div class="sort" role="radiogroup" aria-label="Řazení">
      <span>Seřadit:</span>
      <button
        type="button"
        role="radio"
        aria-checked={razeni === 'vzdalenost'}
        class:on={razeni === 'vzdalenost'}
        onclick={() => onrazeni('vzdalenost')}>{maDomov ? 'Nejblíž' : 'Podle školy'}</button
      >
      <button
        type="button"
        role="radio"
        aria-checked={razeni === 'volno'}
        class:on={razeni === 'volno'}
        onclick={() => onrazeni('volno')}>Nejvíc volných míst</button
      >
    </div>
  </div>
  {#if !maDomov}
    <p class="tip">💡 Zatím ukazujeme celý kraj. Vyber v kroku 1, kde bydlíš, a uvidíš, co máš v dosahu.</p>
  {/if}

  {#if vysledky.length === 0}
    <p class="empty">Nic jsme nenašli. Zkus dojíždět dál nebo změnit typ školy či obor.</p>
  {:else}
    <ul>
      {#each zobrazene as r (r.obor.izo + r.obor.kodOboru + r.obor.forma)}
        {@const o = r.obor}
        {@const t = trend(o)}
        <li>
          <button
            type="button"
            class="card"
            class:sel={vybrana === o.izo}
            aria-pressed={vybrana === o.izo}
            onclick={() => onselect(o.izo)}
            data-testid="obor-row"
          >
            <span class="top">
              <span class="obor">{o.nazevOboru}</span>
              {#if r.km !== null}<span class="km">{r.km < 1 ? '< 1' : r.km.toFixed(0)} km</span>{/if}
            </span>
            <span class="skola">{kratce(o.skola)} · {o.obec}</span>
            <span class="facts">
              <span>🎓 {TYP_TXT[o.typ]}, {o.delka}{o.forma !== 'denní' ? `, ${o.forma}` : ''}</span>
              <span>👥 {o.zamer[2026]} míst pro 2026/27{t !== null && t !== 0 ? ` (${TREND_TXT[String(t) as '1' | '-1']})` : ''}</span>
              <span>🚌 {o.zastavky500m > 0 ? `${zastavek(o.zastavky500m)} do 500 m` : 'zastávka dál než 500 m'}</span>
            </span>
            <Naplnenost podil={r.naplnenost} prijato={o.prijato2025} zamer={o.zamer[2025] ?? null} />
          </button>
        </li>
      {/each}
    </ul>
    {#if vysledky.length > LIMIT}
      <button type="button" class="more" onclick={() => (vse = !vse)}>
        {vse ? 'Zobrazit méně' : `Zobrazit všech ${vysledky.length}`}
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
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    margin-bottom: 8px;
  }
  h2 {
    font-size: 1.15rem;
    margin: 0;
    color: var(--c-text);
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--c-muted);
  }
  .sort button,
  .more {
    font: inherit;
    font-size: 0.85rem;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--c-border);
    background: #fff;
    color: var(--c-text);
    cursor: pointer;
  }
  .sort button.on {
    background: var(--c-text);
    border-color: var(--c-text);
    color: #fff;
  }
  .tip {
    background: var(--c-accent-soft);
    color: #1e3a8a;
    border-radius: 8px;
    padding: 8px 12px;
    margin: 0 0 10px;
    font-size: 0.9rem;
  }
  .empty {
    color: var(--c-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    text-align: left;
    font: inherit;
    color: var(--c-text);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--c-radius);
    box-shadow: var(--c-shadow);
    padding: 14px 16px;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .card:hover {
    border-color: #b8c4d4;
    box-shadow: 0 4px 12px rgba(16, 24, 40, 0.08);
  }
  .card.sel {
    border-color: var(--c-accent);
    box-shadow: 0 0 0 2px var(--c-accent-soft);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  .obor {
    font-size: 1.05rem;
    font-weight: 700;
  }
  .km {
    flex: none;
    font-weight: 700;
    color: var(--c-accent);
    background: var(--c-accent-soft);
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.85rem;
  }
  .skola {
    color: var(--c-muted);
    font-size: 0.92rem;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 0.85rem;
    color: var(--c-text);
  }
  .more {
    margin-top: 12px;
    width: 100%;
    padding: 10px;
  }
</style>
