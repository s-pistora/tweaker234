<script lang="ts">
  /** Výsledky hledání: karta = obor, klik otevře detail školy. Po 12, „Zobrazit další“. */
  import { trend, type OborVysledek, type Razeni } from '../../lib/skoly.ts';
  import Naplnenost from './Naplnenost.svelte';

  interface Props {
    vysledky: OborVysledek[];
    vybrana: string | null;
    maDomov: boolean;
    /** název obce domova ('' = nezadán) */
    domovNazev?: string;
    maxKm?: number;
    razeni: Razeni;
    onrazeni: (r: Razeni) => void;
    onselect: (izo: string) => void;
  }
  const { vysledky, vybrana, maDomov, domovNazev = '', maxKm = 0, razeni, onrazeni, onselect }: Props = $props();

  const KROK = 12;
  let limit = $state(KROK);
  // nový dotaz → znovu od začátku
  $effect(() => {
    void vysledky;
    limit = KROK;
  });
  const zobrazene = $derived(vysledky.slice(0, limit));
  const pocetSkol = $derived(new Set(vysledky.map((r) => r.obor.izo)).size);

  function kratce(skola: string): string {
    return skola
      .replace(/,?\s*příspěvková organizace$/i, '')
      .replace(/,?\s*s\.\s*r\.\s*o\.$/i, '')
      .replace(/,?\s*o\.\s*p\.\s*s\.$/i, '');
  }
  const pl = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);
  const TYP_TXT = { maturita: 'Maturita', vyucni: 'Výuční list', jine: 'Jiné vzdělání' } as const;
  const kmTxt = (km: number) => (km < 1 ? 'do 1 km' : `${km.toFixed(0)} km`);
</script>

<section class="list" aria-label="Nalezené obory" data-testid="obory-list">
  <div class="head">
    <h2>
      {#if maDomov}
        {vysledky.length} {pl(vysledky.length, 'obor', 'obory', 'oborů')} do {maxKm} km{domovNazev ? ` od obce ${domovNazev}` : ''}
      {:else}
        {vysledky.length} {pl(vysledky.length, 'obor', 'obory', 'oborů')} v celém kraji
      {/if}
    </h2>
    <p class="sub">na {pocetSkol} {pl(pocetSkol, 'škole', 'školách', 'školách')}</p>
  </div>

  <div class="sort" role="radiogroup" aria-label="Řazení výsledků">
    <span>Seřadit</span>
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

  {#if !maDomov}
    <p class="tip">Vyberte v kroku 1, kde bydlíte. Ukážeme jen obory v dosahu a seřadíme je podle vzdálenosti.</p>
  {/if}

  {#if vysledky.length === 0}
    <p class="empty">Nenašli jsme žádný obor. Zkuste zvětšit vzdálenost nebo změnit typ školy či zaměření.</p>
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
              {#if r.km !== null}<span class="km">{kmTxt(r.km)}</span>{/if}
            </span>
            <span class="skola">{kratce(o.skola)}{kratce(o.skola).includes(o.obec) ? '' : `, ${o.obec}`}</span>
            <span class="facts">
              <span><b>{TYP_TXT[o.typ]}</b> · {o.delka}{o.forma !== 'denní' ? ` · ${o.forma}` : ''}</span>
              <span>
                <b>{o.zamer[2026]}</b> {pl(o.zamer[2026] ?? 0, 'místo', 'místa', 'míst')} na 2026/27{#if t === 1}<span class="tr"> · víc než v 2024</span>{:else if t === -1}<span class="tr"> · méně než v 2024</span>{/if}
              </span>
              <span>
                Autobus: {o.zastavky500m > 0
                  ? `${o.zastavky500m} ${pl(o.zastavky500m, 'zastávka', 'zastávky', 'zastávek')} do 500 m`
                  : 'nejbližší zastávka dál než 500 m'}
              </span>
            </span>
            <Naplnenost podil={r.naplnenost} prijato={o.prijato2025} zamer={o.zamer[2025] ?? null} />
          </button>
        </li>
      {/each}
    </ul>
    {#if vysledky.length > limit}
      <button type="button" class="btn-secondary more" onclick={() => (limit += KROK)}>
        Zobrazit další obory ({vysledky.length - limit})
      </button>
    {/if}
  {/if}
</section>

<style>
  .list {
    min-width: 0;
  }
  .head h2 {
    font-size: 1.5rem;
    line-height: 1.25;
    margin: 0;
  }
  .sub {
    margin: 2px 0 12px;
    color: var(--text-muted);
  }
  .sort {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .sort > span {
    font-weight: 500;
    color: var(--brand-dark);
    margin-right: 4px;
  }
  .sort button {
    font: inherit;
    font-size: 0.95rem;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 4px;
    border: 1px solid var(--brand);
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  .sort button.on {
    background: var(--brand);
    color: #fff;
  }
  .tip {
    margin: 0 0 14px;
    padding: 12px 14px;
    border-left: 4px solid var(--brand);
    background: #fff;
    color: var(--brand-dark);
  }
  .empty {
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    text-align: left;
    font: inherit;
    color: var(--text);
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: 16px 18px;
    cursor: pointer;
  }
  .card:hover {
    border-color: var(--brand-mid);
  }
  .card.sel {
    border-color: var(--brand);
    box-shadow: inset 4px 0 0 var(--brand);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .obor {
    font-size: 1.15rem;
    line-height: 1.3;
    font-weight: 700;
    color: var(--brand-dark);
  }
  .km {
    flex: none;
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--brand);
  }
  .skola {
    color: var(--text-muted);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 20px;
    font-size: 0.92rem;
  }
  .facts b {
    font-weight: 500;
    color: var(--brand-dark);
  }
  .tr {
    color: var(--text-muted);
  }
  .more {
    margin-top: 16px;
    width: 100%;
  }
</style>
