<script lang="ts">
  /**
   * Úvodní stránka: „Co potřebujete vyřešit?“ – rychlé hledání obce s kartou
   * „Obec v kostce“, pět oblastí jako dlaždice a příklady otázek pro AI poradce.
   */
  import Ikona from '../vylety/Ikona.svelte';
  import ObecHledani from './ObecHledani.svelte';
  import ObecKostka from './ObecKostka.svelte';
  import { MENU, OBLIBENE_KATEGORIE, type Cil, type MenuPolozka } from '../../lib/menu.ts';
  import { KATEGORIE_BY_ID } from '../../lib/vylety.ts';
  import type { ObecVKostce } from '../../lib/domu.ts';
  import type { AreaCode } from '../../lib/types.ts';
  import { poradceDostupny, zeptejSePoradce } from '../../lib/poradce/ovladani.ts';
  import type { BehHlidace } from '../../lib/zmeny.ts';

  interface Props {
    names: Record<AreaCode, string>;
    obec: AreaCode | null;
    kostka: ObecVKostce | null;
    onobec: (code: AreaCode) => void;
    /** zrušit vybranou obec (karta zmizí, ho= z adresy) */
    onzrusit: () => void;
    jdi: (c: Cil) => void;
    href: (c: Cil) => string;
    onzdroje: () => void;
    /** poslední běh hlídače změn dat („Co je nového v datech“) */
    novinky?: BehHlidace | null;
  }
  const { names, obec, kostka, onobec, onzrusit, jdi, href, onzdroje, novinky = null }: Props = $props();
  const NOVINEK = 5;

  const RYCHLE: { code: AreaCode; nazev: string }[] = [
    { code: '554961', nazev: 'Karlovy Vary' },
    { code: '554481', nazev: 'Cheb' },
    { code: '560286', nazev: 'Sokolov' },
  ];
  const OTAZKY = [
    'Jaké obory s maturitou jsou do 20 km od Sokolova?',
    'Kde v kraji se dá koupat a jaká je tam voda?',
    'Kolik obyvatel má Cheb a jaká je tam nezaměstnanost?',
  ];

  /** cíl položky menu; obec z hledání se předá dál jako „domov“ */
  const cilPolozky = (p: MenuPolozka): Cil | null => (p.mode ? { mode: p.mode, obec } : null);
  const klik = (c: Cil) => (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    jdi(c);
  };
</script>

<section class="hero">
  <div class="wrap hero__grid">
    <div>
      <p class="kicker">Karlovarský kraj v datech</p>
      <h1>Co potřebujete vyřešit?</h1>
      <p class="perex">
        Školy, úřady, lékaři, výlety i peníze kraje na jednom místě. Vše z otevřených dat kraje a státu.
        Prototyp z hackathonu.
      </p>
    </div>
    <div class="hledani" data-tour="hledani">
      <ObecHledani {names} {obec} onselect={onobec} onclear={onzrusit} />
      {#if !obec}
        <p class="rychle">
          <span>Například:</span>
          {#each RYCHLE.filter((r) => names[r.code]) as r (r.code)}
            <button type="button" onclick={() => onobec(r.code)} data-testid="domu-rychle-{r.code}">{r.nazev}</button>
          {/each}
        </p>
      {/if}
    </div>
  </div>
</section>

<main class="wrap main">
  <p class="sr-only" aria-live="polite">{kostka ? `Obec v kostce: ${names[kostka.code] ?? kostka.nazev}` : ''}</p>
  {#if kostka}
    <ObecKostka k={kostka} nazev={names[kostka.code]} {jdi} {href} ai={$poradceDostupny} />
  {/if}

  <section class="oblasti" aria-labelledby="oblasti-h" data-tour="oblasti">
    <h2 id="oblasti-h">Vyberte, co řešíte</h2>
    <ul class="tiles">
      {#each MENU as g (g.id)}
        <li class="tile tile--{g.id}" data-testid="dlazdice-{g.id}">
          <div class="tile__head">
            <span class="tile__ico"><Ikona d={g.ikona} size={26} /></span>
            <h3>{g.label}</h3>
          </div>
          <p class="tile__veta">{g.veta}</p>
          <ul class="tile__links">
            {#each g.polozky as p (p.label)}
              {@const c = cilPolozky(p)}
              <li>
                {#if c}
                  <a href={href(c)} onclick={klik(c)}>{p.label}</a>
                {:else}
                  <button type="button" class="linkbtn" onclick={onzdroje}>{p.label}</button>
                {/if}
              </li>
            {/each}
          </ul>
          {#if g.kategorie}
            <ul class="chips" aria-label="Oblíbené kategorie">
              {#each OBLIBENE_KATEGORIE as id (id)}
                {@const kat = KATEGORIE_BY_ID[id]}
                {@const c = { mode: 'vylety' as const, obec, kat: id }}
                <li>
                  <a class="chip" href={href(c)} onclick={klik(c)}>
                    <Ikona d={kat.ikona} size={16} color={kat.barva} />
                    {kat.label}
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  {#if novinky?.zmeny.length}
    <section class="news" aria-labelledby="news-h" data-testid="domu-novinky">
      <h2 id="news-h">Co je nového v datech <small>{new Date(novinky.datum).toLocaleDateString('cs-CZ')}</small></h2>
      <ul>
        {#each novinky.zmeny.slice(0, NOVINEK) as z, i (i)}
          <li><span class="oblast">{z.oblast}</span> {z.veta}</li>
        {/each}
      </ul>
      {#if novinky.zmeny.length > NOVINEK}
        <a class="news__vse" href={href({ mode: 'nalezy' })} onclick={klik({ mode: 'nalezy' })}>Všechny změny ({novinky.zmeny.length})</a>
      {/if}
    </section>
  {/if}

  {#if $poradceDostupny}
    <section class="ai" aria-labelledby="ai-h" data-testid="domu-ai">
      <div class="ai__txt">
        <h2 id="ai-h">Nevíte si rady? Zeptejte se AI poradce</h2>
        <p>Odpovídá jen z dat, která tu máme. Co v nich není, to vám řekne.</p>
      </div>
      <ul class="ai__q" aria-label="Příklady otázek">
        {#each OTAZKY as q (q)}
          <li><button type="button" onclick={() => zeptejSePoradce(q)}>{q}</button></li>
        {/each}
      </ul>
    </section>
  {/if}
</main>

<style>
  .news {
    background: #fff;
    border: 1px solid var(--line);
    border-left: 4px solid var(--brand);
    border-radius: 12px;
    padding: 16px 20px;
    margin-top: 24px;
  }
  .news h2 {
    margin: 0 0 8px;
    font-size: 1.15rem;
  }
  .news small {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 0.85rem;
    margin-left: 6px;
  }
  .news ul {
    margin: 0 0 6px;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .oblast {
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--brand-ice);
    color: var(--brand);
    padding: 1px 6px;
    border-radius: 4px;
    margin-right: 4px;
  }
  .wrap {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    box-sizing: border-box;
  }
  .hero {
    background: var(--brand-ice);
    border-bottom: 1px solid var(--line);
    padding: 36px 0 32px;
  }
  .hero__grid {
    display: grid;
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
    gap: 32px;
    align-items: center;
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
    font-size: clamp(2rem, 4.5vw, 2.75rem);
    line-height: 1.15;
    font-weight: 700;
    margin: 6px 0 10px;
    color: var(--brand-dark);
  }
  .perex {
    margin: 0;
    max-width: 52ch;
    font-size: 1.15rem;
    line-height: 1.5;
    color: var(--text);
  }
  .hledani {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 18px 20px;
    box-shadow: var(--shadow);
  }
  .rychle {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 10px 0 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }
  .rychle button {
    font: inherit;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  .rychle button:hover {
    border-color: var(--brand);
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding-top: 28px;
    padding-bottom: 56px;
    flex: 1;
  }
  .oblasti h2,
  .ai h2 {
    margin: 0 0 14px;
    font-size: 1.5rem;
    color: var(--brand-dark);
  }
  /* dlaždice 3 + 2 */
  .tiles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 20px;
    align-items: start;
  }
  .tile {
    grid-column: span 2;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 20px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }
  .tile--prace,
  .tile--data {
    grid-column: span 3;
  }
  .tile__head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .tile__ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--brand-ice);
    color: var(--brand);
  }
  h3 {
    margin: 0;
    font-size: 1.3rem;
    color: var(--brand-dark);
  }
  .tile__veta {
    margin: 0;
    color: var(--text);
    line-height: 1.45;
  }
  .tile__links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0 20px;
  }
  .tile__links a,
  .linkbtn {
    font: inherit;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    font-weight: 500;
    color: var(--brand);
    text-decoration: underline;
    cursor: pointer;
  }
  .tile__links a::after,
  .linkbtn::after {
    content: '→';
    margin-left: 6px;
  }
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    font-size: 0.9rem;
    color: var(--brand-dark);
    text-decoration: none;
  }
  .chip:hover {
    border-color: var(--brand);
    background: var(--brand-ice);
  }
  /* AI poradce */
  .ai {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 16px 32px;
    align-items: center;
    padding: 20px 24px;
    background: var(--brand-dark);
    color: #fff;
    border-radius: var(--radius-lg);
  }
  .ai h2 {
    color: #fff;
    margin-bottom: 4px;
    font-size: 1.3rem;
  }
  .ai__txt p {
    margin: 0;
    color: #dbe5f3;
  }
  .ai__q {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ai__q button {
    font: inherit;
    width: 100%;
    min-height: 44px;
    padding: 8px 14px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    text-align: left;
    cursor: pointer;
  }
  .ai__q button:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  .rychle button:focus-visible,
  .tile__links a:focus-visible,
  .linkbtn:focus-visible,
  .chip:focus-visible,
  .ai__q button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (max-width: 1000px) {
    .hero__grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .tile,
    .tile--prace,
    .tile--data {
      grid-column: span 1;
    }
    /* lichý počet: poslední dlaždice přes celou šířku */
    .tile--data {
      grid-column: 1 / -1;
    }
    .ai {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 640px) {
    .wrap {
      padding: 0 16px;
    }
    .hero {
      padding: 24px 0 20px;
    }
    .perex {
      font-size: 1.02rem;
    }
    .hledani {
      padding: 14px;
    }
    .tiles {
      grid-template-columns: minmax(0, 1fr);
    }
    .tile {
      padding: 16px;
    }
    .main {
      gap: 24px;
      padding-top: 20px;
    }
    .ai {
      padding: 16px;
    }
  }
</style>
