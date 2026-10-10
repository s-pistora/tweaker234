<script lang="ts">
  /**
   * „Obec v kostce“: praktické okolí vybrané obce – školy, zastávky, lékař, lékárna,
   * nemocnice, úřady a tipy na výlet. Vzdálenosti vzdušnou čarou od středu obce.
   * Odkazy otevřou příslušnou část s touto obcí (d=, uo=, vd=, zo=).
   */
  import Ikona from '../vylety/Ikona.svelte';
  import type { Blizko, ObecVKostce, TipNaVylet } from '../../lib/domu.ts';
  import { VYLET_KM, ZASTAVKY_KM, otazkaOObci } from '../../lib/domu.ts';
  import type { Cil } from '../../lib/menu.ts';
  import { fmtKm, plural } from '../../lib/vylety.ts';
  import { zeptejSePoradce } from '../../lib/poradce/ovladani.ts';

  interface Props {
    k: ObecVKostce;
    jdi: (c: Cil) => void;
    href: (c: Cil) => string;
    /** AI poradce běží → tlačítko „Zeptat se AI“ */
    ai: boolean;
    /** jednoznačný název obce (u stejných názvů s ORP) */
    nazev?: string;
  }
  const { k, jdi, href, ai, nazev }: Props = $props();
  const jmeno = $derived(nazev ?? k.nazev);

  const fmt = fmtKm;
  /** obec služby, jen když leží jinde než ve vybrané obci */
  const kde = (b: Blizko) => (!b.vObci && b.obecNazev ? b.obecNazev : '');
  const cilVyletu = (t: TipNaVylet): Cil => ({ mode: 'vylety', obec: k.code, kat: t.kat, misto: t.id });

  const klik = (c: Cil) => (e: MouseEvent) => {
    // nový panel/okno (Ctrl, středové tlačítko) nechat prohlížeči
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    jdi(c);
  };

  const skoly = $derived([
    { co: 'Mateřská škola', b: k.ms },
    { co: 'Základní škola', b: k.zs },
    { co: 'Střední škola', b: k.ss },
  ]);
  const zdravi = $derived([
    { co: 'Praktický lékař', b: k.lekar },
    { co: 'Lékárna', b: k.lekarna },
    { co: 'Nemocnice', b: k.nemocnice },
  ]);
  const u = $derived(k.urady);
  const stavebni = $derived(u ? [...new Set(u.obec.stavebni.map((s) => s.nazev))] : []);
</script>

<section class="kostka" aria-labelledby="kostka-h" data-tour="kostka" data-testid="obec-kostka">
  <header class="kostka__head">
    <div>
      <p class="kicker">Obec v kostce</p>
      <h2 id="kostka-h">{jmeno}</h2>
      {#if k.neobydlena}
        <p class="kostka__perex" data-testid="kostka-neobydlena">Vojenský újezd bez stálých obyvatel. Služby v okolí proto neukazujeme.</p>
      {:else}
        <p class="kostka__perex">
          Co máte blízko. Vzdálenosti měříme vzdušnou čarou od {k.stred.zdroj === 'matrika'
            ? 'radnice'
            : k.stred.zdroj === 'zastavky'
              ? 'středu zástavby'
              : 'středu území obce'}.
        </p>
      {/if}
    </div>
    {#if ai && !k.neobydlena}
      <button type="button" class="ai" onclick={() => zeptejSePoradce(otazkaOObci(jmeno))} data-testid="kostka-ai">
        <Ikona d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" size={20} />
        <span>Zeptat se AI na obec {jmeno}</span>
      </button>
    {/if}
  </header>

  <div class="kostka__grid">
    {#if !k.neobydlena}
    <section class="blok" aria-labelledby="k-skoly">
      <h3 id="k-skoly">Školy</h3>
      <ul class="rows">
        {#each skoly as r (r.co)}
          <li>
            {#if r.b}
              <span class="km">{fmt(r.b.km)}</span>
              <span class="co"><strong>{r.co}</strong> {r.b.nazev}{#if kde(r.b)}<span class="obec"> · {kde(r.b)}</span>{/if}</span>
            {:else}
              <span class="km">–</span><span class="co"><strong>{r.co}</strong> v datech chybí</span>
            {/if}
          </li>
        {/each}
      </ul>
      <a class="more" href={href({ mode: 'skoly', obec: k.code })} onclick={klik({ mode: 'skoly', obec: k.code })} data-testid="kostka-skoly">
        Kam na střední z obce {jmeno}
      </a>
    </section>

    <section class="blok" aria-labelledby="k-zdravi">
      <h3 id="k-zdravi">Zdraví</h3>
      <ul class="rows">
        {#each zdravi as r (r.co)}
          <li>
            {#if r.b}
              <span class="km">{fmt(r.b.km)}</span>
              <span class="co"><strong>{r.co}</strong> {r.b.nazev}{#if kde(r.b)}<span class="obec"> · {kde(r.b)}</span>{/if}</span>
            {:else}
              <span class="km">–</span><span class="co"><strong>{r.co}</strong> v datech chybí</span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
    {/if}

    <section class="blok" aria-labelledby="k-urady">
      <h3 id="k-urady">Úřady</h3>
      {#if u}
        <ul class="rows rows--text">
          <li><span class="co"><strong>Obecní úřad</strong> {u.obec.obecniUrad.nazev}</span></li>
          {#if u.matrika}
            <li>
              <span class="co"
                ><strong>Matrika</strong> {u.matrika.matrika.nazev}{#if !u.matrika.vObci && u.matrika.km !== null}<span class="obec"> · nejbližší, {fmtKm(u.matrika.km)}</span>{/if}</span
              >
            </li>
          {/if}
          {#if stavebni.length}
            <li><span class="co"><strong>Stavební úřad</strong> {stavebni.join(', ')}</span></li>
          {/if}
        </ul>
        <a class="more" href={href({ mode: 'urady', obec: k.code })} onclick={klik({ mode: 'urady', obec: k.code })} data-testid="kostka-urady">
          Kontakty a úřední hodiny
        </a>
      {:else}
        <p class="nic">Úřady pro tuto obec v datech nemáme.</p>
      {/if}
    </section>

    {#if !k.neobydlena}
    <section class="blok" aria-labelledby="k-doprava">
      <h3 id="k-doprava">Doprava</h3>
      {#if k.zastavky === null}
        <p class="nic">Data o zastávkách se nenačetla.</p>
      {:else}
        <p class="velke">
          <span class="velke__n" data-testid="kostka-zastavky">{k.zastavky}</span>
          <span>
            {plural(k.zastavky, ['autobusová zastávka', 'autobusové zastávky', 'autobusových zastávek'])} v obci a do
            {ZASTAVKY_KM}&nbsp;km od jejího středu
          </span>
        </p>
      {/if}
    </section>

    <section class="blok blok--vylety" aria-labelledby="k-vylety">
      <h3 id="k-vylety">Na výlet do {VYLET_KM} km</h3>
      {#if k.vylety.length}
        <ul class="rows">
          {#each k.vylety as t (t.id)}
            {@const c = cilVyletu(t)}
            <li>
              <span class="km">{fmtKm(t.km)}</span>
              <span class="co">
                <a href={href(c)} onclick={klik(c)} data-testid="kostka-vylet">{t.nazev}</a>
                <span class="obec">{t.katLabel}{t.obecNazev ? ` · ${t.obecNazev}` : ''}</span>
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="nic">Do {VYLET_KM} km nemáme v datech žádné místo.</p>
      {/if}
      <a class="more" href={href({ mode: 'vylety', obec: k.code, kat: null })} onclick={klik({ mode: 'vylety', obec: k.code, kat: null })}>
        Kam vyrazit z obce {jmeno}
      </a>
    </section>

    <section class="blok blok--dal" aria-labelledby="k-dal">
      <h3 id="k-dal">Jak se tu žije?</h3>
      <p class="nic">Srovnání s ostatními obcemi podle toho, na čem vám záleží.</p>
      <a class="more" href={href({ mode: 'score', obec: k.code })} onclick={klik({ mode: 'score', obec: k.code })} data-testid="kostka-zivot">
        Kde by se mi žilo – detail obce
      </a>
    </section>
    {/if}
  </div>
</section>

<style>
  .kostka {
    background: var(--bg-panel);
    border: 1px solid var(--line);
    border-top: 4px solid var(--brand);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 20px 24px 24px;
  }
  .kostka__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 24px;
    margin-bottom: 8px;
  }
  .kicker {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brand);
  }
  h2 {
    margin: 2px 0 4px;
    font-size: clamp(1.6rem, 3.5vw, 2rem);
    line-height: 1.2;
    color: var(--brand-dark);
  }
  .kostka__perex {
    margin: 0;
    color: var(--text-muted);
  }
  .ai {
    font: inherit;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--brand);
    border-radius: 999px;
    background: #fff;
    color: var(--brand);
    cursor: pointer;
    text-align: left;
  }
  .ai:hover {
    background: #e3edf8;
  }
  .kostka__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0 28px;
  }
  .blok {
    min-width: 0;
    padding: 16px 0 4px;
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 8px;
    font-size: 1.1rem;
    color: var(--brand-dark);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rows li {
    display: grid;
    grid-template-columns: 4.6em minmax(0, 1fr);
    gap: 10px;
    align-items: baseline;
    line-height: 1.4;
  }
  .rows--text li {
    grid-template-columns: minmax(0, 1fr);
  }
  .km {
    font-weight: 700;
    color: var(--brand);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .co {
    color: var(--text);
    overflow-wrap: anywhere;
  }
  .co strong {
    display: block;
    font-weight: 500;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .obec {
    color: var(--text-muted);
  }
  .co a {
    display: block;
    color: var(--brand);
    font-weight: 500;
  }
  .co .obec {
    font-size: 0.9rem;
  }
  .velke {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 0;
  }
  .velke__n {
    font-size: 2.25rem;
    font-weight: 700;
    line-height: 1;
    color: var(--brand-dark);
    font-variant-numeric: tabular-nums;
  }
  .nic {
    margin: 0;
    color: var(--text-muted);
  }
  .more {
    display: inline-block;
    padding: 11px 0;
    margin-top: 4px;
    font-weight: 500;
    color: var(--brand);
  }
  .more::after {
    content: '→';
    margin-left: 6px;
    text-decoration: none;
  }
  a:focus-visible,
  .ai:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 1000px) {
    .kostka__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .kostka {
      padding: 16px 16px 20px;
    }
    .kostka__grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .ai {
      width: 100%;
    }
  }
</style>
