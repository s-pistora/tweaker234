<script lang="ts">
  /**
   * Detail místa jako vysouvací panel zprava (na mobilu přes celou obrazovku).
   * Esc zavírá globálně App, tady klik na pozadí nebo ×.
   */
  import type { Misto, SourceEntry } from '../../lib/types.ts';
  import { KATEGORIE_BY_ID, fmtDatum, fmtKm, stitky, vetaOMiste, vodaLabel } from '../../lib/vylety.ts';
  import { vzdalenostKm } from '../../lib/skoly.ts';
  import Ikona from './Ikona.svelte';

  interface Props {
    misto: Misto;
    km: number | null;
    domovNazev: string;
    /** všechna místa (pro „V okolí“) */
    vsechna: Misto[];
    source: SourceEntry | undefined;
    vodaSource: SourceEntry | undefined;
    onclose: () => void;
    onselect: (id: string) => void;
  }
  const { misto: m, km, domovNazev, vsechna, source, vodaSource, onclose, onselect }: Props = $props();

  const def = $derived(KATEGORIE_BY_ID[m.kat]);
  const okoli = $derived(
    vsechna
      .filter((x) => x.id !== m.id)
      .map((x) => ({ x, km: vzdalenostKm(m.lat, m.lon, x.lat, x.lon) }))
      .filter((o) => o.km <= 5)
      .sort((a, b) => a.km - b.km)
      .slice(0, 6),
  );
  const mapyUrl = $derived(`https://mapy.cz/turisticka?q=${encodeURIComponent(m.nazev)}&x=${m.lon}&y=${m.lat}&z=15`);
  const webHost = $derived(m.web ? m.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') : '');

  let closeBtn = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    void m.id;
    closeBtn?.focus();
  });
</script>

<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
<div class="drawer" role="dialog" aria-modal="true" aria-label="Detail: {m.nazev}" data-testid="misto-detail">
  <header>
    <span class="ico" style="--c: {def.barva}"><Ikona d={def.ikona} size={24} /></span>
    <div class="ttl">
      <p class="kicker">{def.label}{m.obecNazev ? ` · ${m.obecNazev}` : ''}</p>
      <h2>{m.nazev}</h2>
    </div>
    <button type="button" class="x" bind:this={closeBtn} onclick={onclose} aria-label="Zavřít detail">✕</button>
  </header>

  <div class="tiles">
    <div class="tile">
      <span class="v">{km !== null ? fmtKm(km) : '—'}</span>
      <span class="l">{km !== null ? `od obce ${domovNazev}` : 'vyberte, odkud vyrážíte'}</span>
    </div>
    {#if m.kat === 'sjezdovky'}
      <div class="tile">
        <span class="v">{(m.cisla.vleky ?? 0) + (m.cisla.lanovky ?? 0)}</span>
        <span class="l">vleků a lanovek</span>
      </div>
    {:else if m.voda}
      <div class="tile tile--voda tile--{m.voda.trida}">
        <span class="v v--sm">{vodaLabel(m.voda.trida)}</span>
        <span class="l">{m.voda.datum ? `odběr ${fmtDatum(m.voda.datum)}` : 'kontrola kvality vody'}</span>
      </div>
    {:else if m.kat === 'dobroty' && m.cisla.vyrobky}
      <div class="tile">
        <span class="v">{m.cisla.vyrobky}×</span>
        <span class="l">oceněno{m.cisla.rok ? `, naposledy ${m.cisla.rok}` : ''}</span>
      </div>
    {:else if m.kat === 'rozhledny' && m.cisla.vznik}
      <div class="tile">
        <span class="v">{m.cisla.vznik}</span>
        <span class="l">rok vzniku</span>
      </div>
    {:else if def.vstupne}
      <div class="tile">
        <span class="v v--sm">{m.vstupne === null ? 'neuvedeno' : m.vstupne ? 'placené' : 'zdarma'}</span>
        <span class="l">vstupné</span>
      </div>
    {/if}
  </div>

  <p class="veta">{vetaOMiste(m, km, domovNazev)}</p>
  {#if stitky(m).length}
    <p class="tags">{#each stitky(m) as s (s)}<span class="tag">{s}</span>{/each}</p>
  {/if}
  {#if m.popis}<p class="popis">{m.popis}</p>{/if}
  {#if m.poznamka}<p class="pozn"><strong>Provoz a přístup:</strong> {m.poznamka}</p>{/if}

  <div class="actions">
    {#if m.web}
      <a class="btn btn--pri" href={m.web} target="_blank" rel="noopener noreferrer">Otevřít web ({webHost})</a>
    {/if}
    <a class="btn" href={mapyUrl} target="_blank" rel="noopener noreferrer">Naplánovat cestu na Mapy.cz</a>
  </div>

  <dl class="kontakt">
    {#if m.adresa}<dt>Adresa</dt><dd>{m.adresa}</dd>{/if}
    {#if m.provozovatel}<dt>Provozovatel</dt><dd>{m.provozovatel}</dd>{/if}
    {#if m.tel}<dt>Telefon</dt><dd><a href="tel:{m.tel}">{m.tel}</a></dd>{/if}
    {#if m.email}<dt>E-mail</dt><dd><a href="mailto:{m.email}">{m.email}</a></dd>{/if}
  </dl>

  {#if okoli.length}
    <h3>Do 5 km odsud</h3>
    <ul class="okoli">
      {#each okoli as o (o.x.id)}
        {@const d = KATEGORIE_BY_ID[o.x.kat]}
        <li>
          <button type="button" onclick={() => onselect(o.x.id)} style="--c: {d.barva}">
            <span class="dot" aria-hidden="true"></span>
            <span class="on">{o.x.nazev}<small>{d.label}</small></span>
            <span class="okm">{fmtKm(o.km)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="src">
    Zdroj: {source?.provider ?? 'Karlovarský kraj (datazapad.cz)'} – {source?.title ?? ''} ({source?.license ?? 'CC BY 4.0'}).
    {#if m.voda}
      Kvalita vody: {vodaSource?.provider ?? 'KHS Karlovarského kraje'},
      <a href={m.voda.zdroj} target="_blank" rel="noopener noreferrer">stránka koupacího místa</a>.
    {/if}
  </p>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    z-index: 20;
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(520px, 100vw);
    background: #fff;
    z-index: 21;
    overflow-y: auto;
    padding: 20px 22px 32px;
    box-sizing: border-box;
    box-shadow: -8px 0 24px rgba(15, 23, 42, 0.15);
    color: var(--brand-dark);
    animation: slide 0.2s ease-out;
  }
  @keyframes slide {
    from {
      transform: translateX(30px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .drawer {
      animation: none;
    }
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 12%, #fff);
  }
  .ttl {
    flex: 1;
    min-width: 0;
  }
  .kicker {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  h2 {
    margin: 2px 0 0;
    font-size: 1.35rem;
    line-height: 1.25;
  }
  .x {
    font: inherit;
    font-size: 1.1rem;
    min-width: 44px;
    min-height: 44px;
    border-radius: 4px;
    border: 1px solid var(--line-strong);
    background: #fff;
    cursor: pointer;
    flex: none;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 16px 0 10px;
  }
  .tile {
    background: var(--brand-ice);
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tile .v {
    font-size: 1.35rem;
    font-weight: 700;
  }
  .tile .v--sm {
    font-size: 1rem;
    line-height: 1.3;
  }
  .tile .l {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .tile--vhodna,
  .tile--mirne {
    background: var(--st-volno-soft);
    color: var(--st-volno);
  }
  .tile--zhorsena {
    background: var(--st-ok-soft);
    color: var(--st-ok);
  }
  .tile--nevhodna,
  .tile--nebezpecna {
    background: var(--st-pretlak-soft);
    color: var(--st-pretlak);
  }
  .veta {
    margin: 8px 0;
    font-size: 1.02rem;
    line-height: 1.55;
    color: var(--text);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 8px 0;
  }
  .tag {
    font-size: 0.8rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--brand-ice);
  }
  .popis,
  .pozn {
    color: var(--text);
    line-height: 1.55;
    font-size: 0.95rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 14px 0;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 4px;
    border: 1px solid var(--brand);
    color: var(--brand);
    background: #fff;
    font-weight: 500;
    text-decoration: none;
  }
  .btn--pri {
    background: var(--brand);
    color: #fff;
  }
  .btn--pri:hover {
    background: var(--brand-hover);
  }
  .btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .kontakt {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 14px;
    margin: 10px 0;
    font-size: 0.92rem;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
    color: var(--text);
    overflow-wrap: anywhere;
  }
  h3 {
    margin: 20px 0 8px;
    font-size: 1rem;
  }
  .okoli {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .okoli button {
    font: inherit;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 8px 10px;
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    color: var(--brand-dark);
  }
  .okoli button:hover {
    border-color: var(--brand);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
    flex: none;
  }
  .on {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .on small {
    color: var(--text-muted);
    font-size: 0.78rem;
  }
  .okm {
    font-weight: 700;
    color: var(--brand);
    flex: none;
  }
  .src {
    margin-top: 18px;
    color: var(--text-muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }
</style>
