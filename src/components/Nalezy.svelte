<script lang="ts">
  /** Stránka „Co jsme našli v datech kraje“ – zpětná vazba pro DATAZÁPAD a porotu. */
  import { STATICKE_NALEZY, ZAVAZNOST, souhrnNalezu, zAutomatickychKontrol, type Nalez, type Zavaznost } from '../lib/nalezy.ts';
  import type { SourceEntry } from '../lib/types.ts';
  import { stahni } from '../lib/csv.ts';

  interface Props {
    automaticke: { sada: string; chyby: string[] }[];
    sources: SourceEntry[];
    onzdroje: () => void;
  }
  const { automaticke, sources, onzdroje }: Props = $props();

  const nalezy = $derived<Nalez[]>([...STATICKE_NALEZY, ...automaticke.flatMap((a) => zAutomatickychKontrol(a.chyby, a.sada))]);
  const souhrn = $derived(souhrnNalezu(nalezy));
  const sadKraje = $derived(sources.filter((s) => /Karlovarský kraj/.test(s.provider)).length);
  let filtr = $state<Zavaznost | ''>('');
  const zobrazene = $derived(nalezy.filter((n) => !filtr || n.zavaznost === filtr));
  const pl = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);
</script>

<section class="hero">
  <div class="wrap">
    <p class="kicker">Zpětná vazba pro DATAZÁPAD</p>
    <h1>Co jsme našli v datech kraje</h1>
    <p class="perex">
      Při stavbě aplikace jsme zpracovali {sadKraje} datových sad Karlovarského kraje. Tady je, co v nich nesedí
      nebo chybí – a jak jsme si s tím poradili. Každou položku lze v katalogu opravit nebo doplnit.
    </p>
    <div class="kpis">
      <div class="kpi"><span class="kpi__v">{souhrn.celkem}</span><span class="kpi__l">nálezů celkem</span></div>
      {#each Object.entries(ZAVAZNOST) as [z, info] (z)}
        <button type="button" class="kpi kpi--{z}" class:on={filtr === z} onclick={() => (filtr = filtr === z ? '' : (z as Zavaznost))}>
          <span class="kpi__v">{souhrn.podle[z as Zavaznost]}</span>
          <span class="kpi__l">{info.nazev.toLowerCase()}</span>
        </button>
      {/each}
    </div>
  </div>
</section>

<main class="wrap main">
  <p class="lead">
    {#if filtr}
      Zobrazeno: <strong>{ZAVAZNOST[filtr].nazev}</strong> – {ZAVAZNOST[filtr].popis}.
      <button type="button" class="link" onclick={() => (filtr = '')}>Zobrazit vše</button>
    {:else}
      {zobrazene.length} {pl(zobrazene.length, 'nález', 'nálezy', 'nálezů')}. Kliknutím na číslo nahoře je vyfiltrujete.
    {/if}
  </p>
  <ol class="list" data-testid="nalezy-list">
    {#each zobrazene as n, i (i + n.co)}
      <li class="item item--{n.zavaznost}">
        <span class="chip chip--{n.zavaznost}">{ZAVAZNOST[n.zavaznost].nazev}</span>
        <h3>{n.sada}</h3>
        <p>{n.co}</p>
        <p class="res"><strong>Jak jsme to vyřešili:</strong> {n.reseni}</p>
      </li>
    {/each}
  </ol>
  <div class="actions">
    <button
      type="button"
      class="btn-secondary"
      onclick={() => stahni('nalezy-v-datech-karlovarskeho-kraje', nalezy.map((n) => ({ datova_sada: n.sada, zavaznost: ZAVAZNOST[n.zavaznost].nazev, nalez: n.co, reseni: n.reseni })))}
      data-testid="nalezy-csv">Stáhnout nálezy (CSV)</button
    >
    <button type="button" class="btn-secondary" onclick={onzdroje}>Seznam všech použitých datových sad</button>
  </div>
</main>

<style>
  .wrap {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
    box-sizing: border-box;
  }
  .hero {
    background: var(--brand-ice);
    border-bottom: 1px solid var(--line);
    padding: 32px 0 28px;
  }
  .kicker {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brand);
  }
  h1 {
    font-size: clamp(2rem, 4.5vw, 2.5rem);
    margin: 6px 0 8px;
  }
  .perex {
    margin: 0 0 20px;
    max-width: 70ch;
    font-size: 1.1rem;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }
  .kpi {
    font: inherit;
    text-align: left;
    background: none;
    border: 0;
    border-left: 1px solid var(--line);
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpi:first-child {
    border-left: 0;
  }
  button.kpi {
    cursor: pointer;
  }
  button.kpi:hover,
  .kpi.on {
    background: var(--brand-ice);
  }
  .kpi__v {
    font-size: 2rem;
    font-weight: 700;
    color: var(--brand-dark);
    line-height: 1.1;
  }
  .kpi--chyba .kpi__v {
    color: var(--st-pretlak);
  }
  .kpi--nesoulad .kpi__v {
    color: var(--st-ok);
  }
  .kpi--chybi .kpi__v {
    color: var(--brand);
  }
  .kpi__l {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .main {
    padding-top: 24px;
    padding-bottom: 48px;
  }
  .lead {
    margin: 0 0 14px;
  }
  .link {
    font: inherit;
    background: none;
    border: 0;
    color: var(--brand);
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
    margin-left: 6px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .item {
    background: #fff;
    border: 1px solid var(--line);
    border-left: 4px solid var(--line-strong);
    border-radius: 8px;
    padding: 14px 18px;
  }
  .item--chyba {
    border-left-color: var(--data-6);
  }
  .item--nesoulad {
    border-left-color: var(--data-3);
  }
  .item--chybi {
    border-left-color: var(--data-1);
  }
  .chip {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .chip--chyba {
    background: var(--st-pretlak-soft);
    color: var(--st-pretlak);
  }
  .chip--nesoulad {
    background: var(--st-ok-soft);
    color: var(--st-ok);
  }
  .chip--chybi {
    background: #e3edf8;
    color: var(--brand);
  }
  h3 {
    margin: 8px 0 4px;
    font-size: 1.05rem;
  }
  .item p {
    margin: 0 0 4px;
    font-size: 0.95rem;
  }
  .res {
    color: var(--text-muted);
    font-size: 0.88rem !important;
  }
  .res strong {
    color: var(--brand-dark);
    font-weight: 500;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;
  }
  @media (max-width: 700px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .kpi:nth-child(3) {
      border-left: 0;
    }
    .kpi:nth-child(n + 3) {
      border-top: 1px solid var(--line);
    }
    .wrap {
      padding: 0 16px;
    }
  }
</style>
