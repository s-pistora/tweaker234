<script lang="ts">
  /**
   * Úvodní stránka info centra: rozcestník všech částí aplikace s čísly z dat.
   * Po výběru obce ukazují dlaždice čísla pro okolí obce a obec se předvyplní v ostatních částech.
   */
  import type { AreaCode } from '../lib/types.ts';
  import type { Mode } from '../lib/state.ts';

  export interface Dlazdice {
    mode: Mode;
    nazev: string;
    popis: string;
    /** hlavní číslo (celý kraj, nebo okolí obce) */
    cislo: string;
    /** popisek k číslu */
    pod: string;
    ikona: string;
    barva: string;
  }

  interface Props {
    dlazdice: Dlazdice[];
    obce: Record<AreaCode, string>;
    obec: AreaCode | null;
    souhrn: { sady: number; zaznamy: number; nalezy: number };
    onobec: (code: AreaCode | null) => void;
    onmode: (m: Mode) => void;
  }
  const { dlazdice, obce, obec, souhrn, onobec, onmode }: Props = $props();

  const serazene = $derived(Object.entries(obce).sort((a, b) => a[1].localeCompare(b[1], 'cs')));
  const fmt = (n: number) => new Intl.NumberFormat('cs-CZ').format(n);
</script>

<section class="hero">
  <div class="wrap">
    <p class="kicker">Info centrum · otevřená data Karlovarského kraje</p>
    <h1>Vše o Karlovarském kraji na jednom místě</h1>
    <p class="perex">
      Střední školy, výlety, úřady, peníze kraje i to, kde se dobře žije. Všechno z otevřených dat, srozumitelně a
      s mapou. Začněte tím, kde bydlíte – ukážeme, co máte ve svém okolí.
    </p>
    <form class="pick" onsubmit={(e) => e.preventDefault()}>
      <label for="domu-obec">Kde bydlíte?</label>
      <div class="pick__row">
        <select
          id="domu-obec"
          value={obec ?? ''}
          onchange={(e) => onobec(e.currentTarget.value || null)}
          data-testid="domu-obec"
        >
          <option value="">Celý kraj – vyberte obec</option>
          {#each serazene as [code, name] (code)}
            <option value={code}>{name}</option>
          {/each}
        </select>
        {#if obec}
          <button type="button" class="btn-primary" onclick={() => onmode('obec')} data-testid="domu-profil"
            >Profil obce {obce[obec] ?? ''}</button
          >
          <button type="button" class="btn-secondary" onclick={() => onobec(null)}>Zrušit</button>
        {/if}
      </div>
      <small>{obec ? `Čísla níže platí pro okolí obce ${obce[obec] ?? ''}. Obec jsme předvyplnili i v ostatních částech.` : 'Obec se předvyplní ve všech částech aplikace.'}</small>
    </form>
  </div>
</section>

<main class="wrap main">
  <ul class="tiles" data-testid="domu-dlazdice">
    {#each dlazdice as d (d.mode)}
      <li>
        <button type="button" class="tile" style="--c: {d.barva}" onclick={() => onmode(d.mode)} data-testid="domu-{d.mode}">
          <span class="ico" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24"
              ><path d={d.ikona} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg
            >
          </span>
          <span class="body">
            <span class="nazev">{d.nazev}</span>
            <span class="num"><strong>{d.cislo}</strong> {d.pod}</span>
            <span class="popis">{d.popis}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>

  <section class="band" aria-label="Na čem aplikace stojí">
    <div><strong>{fmt(souhrn.sady)}</strong><span>datových sad z katalogu DATAZÁPAD a státních úřadů</span></div>
    <div><strong>{fmt(souhrn.zaznamy)}</strong><span>míst, škol, úřadů a projektů v kraji</span></div>
    <div>
      <strong>{souhrn.nalezy}</strong>
      <span>nálezů v datech kraje – <button type="button" class="link" onclick={() => onmode('nalezy')}>co jsme našli</button></span>
    </div>
  </section>
</main>

<style>
  .wrap {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    box-sizing: border-box;
  }
  .hero {
    background: linear-gradient(180deg, var(--brand-ice) 0%, #e6eef8 100%);
    border-bottom: 1px solid var(--line);
    padding: 40px 0 32px;
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
    font-size: clamp(2rem, 5vw, 3rem);
    line-height: 1.15;
    letter-spacing: -0.02em;
    margin: 8px 0 12px;
    max-width: 20ch;
  }
  .perex {
    margin: 0 0 22px;
    max-width: 64ch;
    font-size: 1.15rem;
    line-height: 1.5;
  }
  .pick {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 560px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px 18px;
    box-shadow: var(--shadow);
  }
  .pick label {
    font-weight: 700;
    color: var(--brand-dark);
    font-size: 1.05rem;
  }
  .pick__row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pick select {
    flex: 1 1 240px;
    min-height: 48px;
    font-size: 1.05rem;
    padding-left: 14px;
  }
  .pick small {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .main {
    padding-top: 28px;
    padding-bottom: 48px;
  }
  .tiles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  @media (max-width: 1240px) {
    .tiles {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  .tile {
    font: inherit;
    text-align: left;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    align-items: start;
    padding: 18px 18px 18px 16px;
    background: #fff;
    border: 1px solid var(--line);
    border-top: 4px solid var(--c);
    border-radius: 12px;
    cursor: pointer;
    color: var(--text);
    transition:
      box-shadow 0.15s,
      transform 0.15s;
  }
  .tile:hover {
    box-shadow: 0 8px 24px rgba(12, 24, 56, 0.1);
    transform: translateY(-2px);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c) 12%, #fff);
    color: var(--c);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .nazev {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--brand-dark);
  }
  .num {
    color: var(--text-muted);
    font-size: 0.92rem;
  }
  .num strong {
    font-size: 1.5rem;
    color: var(--brand);
    margin-right: 2px;
  }
  .popis {
    font-size: 0.9rem;
    color: var(--text);
  }
  .band {
    margin-top: 28px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    background: var(--brand-dark);
    color: #dbe5f3;
    border-radius: 12px;
    overflow: hidden;
  }
  .band div {
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-left: 1px solid rgba(255, 255, 255, 0.12);
  }
  .band div:first-child {
    border-left: 0;
  }
  .band strong {
    font-size: 2rem;
    color: #fff;
  }
  .band span {
    font-size: 0.88rem;
  }
  .link {
    font: inherit;
    color: #fff;
    background: none;
    border: 0;
    padding: 0;
    text-decoration: underline;
    cursor: pointer;
  }
  @media (max-width: 1000px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .wrap {
      padding: 0 16px;
    }
    .tiles,
    .band {
      grid-template-columns: minmax(0, 1fr);
    }
    .band div {
      border-left: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
    }
    .band div:first-child {
      border-top: 0;
    }
  }
</style>
