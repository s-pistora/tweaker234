<script lang="ts">
  /**
   * Režim „Podnikání“: Galerie kreativců (designéři, fotografové, řemeslníci…), inovační
   * infrastruktura (inkubátory, coworkingy, pobočky VŠ) a průmyslové zóny.
   */
  import type { PodnikaniState } from '../../lib/state.ts';
  import {
    INFRA_TYP,
    filtrKreativci,
    poctyOboru,
    type InfraTyp,
    type PodnikaniFile,
  } from '../../lib/podnikani.ts';
  import StahnoutData from '../common/StahnoutData.svelte';

  interface Props {
    data: PodnikaniFile;
    stav: PodnikaniState;
    onchange: (patch: Partial<PodnikaniState>) => void;
  }
  const { data, stav, onchange }: Props = $props();

  const pl = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);

  // --- kreativci ---
  const obory = $derived(poctyOboru(data.kreativci));
  const vysledky = $derived(filtrKreativci(data.kreativci, stav.obor, stav.q));
  let limit = $state(24);
  $effect(() => {
    void stav.obor;
    void stav.q;
    limit = 24;
  });
  const vObcich = $derived(new Set(data.kreativci.map((k) => k.obec).filter(Boolean)).size);

  // --- centra ---
  let typ = $state<InfraTyp | ''>('');
  const typy = $derived(
    (Object.keys(INFRA_TYP) as InfraTyp[])
      .map((t) => [t, data.infra.filter((i) => i.typy.includes(t)).length] as const)
      .filter(([, n]) => n > 0),
  );
  const centra = $derived(data.infra.filter((i) => !typ || i.typy.includes(typ)));

  // --- zóny ---
  const stavajici = $derived(data.zony.filter((z) => z.stav === 'stavajici'));
  const zamery = $derived(data.zony.filter((z) => z.stav === 'zamer'));
  const mapy = (z: { lat: number | null; lon: number | null; nazev: string; obec: string }) =>
    z.lat !== null && z.lon !== null
      ? `https://mapy.cz/zakladni?source=coor&id=${z.lon}%2C${z.lat}&x=${z.lon}&y=${z.lat}&z=15`
      : `https://mapy.cz/zakladni?q=${encodeURIComponent(`${z.nazev} ${z.obec}`)}`;

  const TABY: [PodnikaniState['tab'], string][] = [
    ['kreativci', 'Kreativci'],
    ['centra', 'Inkubátory a coworkingy'],
    ['zony', 'Průmyslové zóny'],
  ];
</script>

<section class="hero">
  <div class="wrap">
    <p class="kicker">Podnikání · Karlovarský kraj</p>
    <h1>Kdo v kraji tvoří a kde začít podnikat</h1>
    <p class="perex">
      Najděte grafika, fotografa nebo řemeslníka z kraje, místo, kde rozjet firmu, a plochy pro nové investice.
    </p>
    <div class="kpis">
      <button type="button" class="kpi" onclick={() => onchange({ tab: 'kreativci' })}>
        <span class="kpi__v">{data.kreativci.length}</span>
        <span class="kpi__l">kreativců v {obory.length} oborech, z {vObcich} obcí</span>
      </button>
      <button type="button" class="kpi" onclick={() => onchange({ tab: 'centra' })}>
        <span class="kpi__v">{data.infra.length}</span>
        <span class="kpi__l">inkubátorů, coworkingů, poboček VŠ a center podpory</span>
      </button>
      <button type="button" class="kpi" onclick={() => onchange({ tab: 'zony' })}>
        <span class="kpi__v">{stavajici.length} + {zamery.length}</span>
        <span class="kpi__l">průmyslových zón stávajících + plánovaných</span>
      </button>
    </div>
  </div>
</section>

<main class="wrap main">
  <div class="tabs" role="tablist" aria-label="Pohled">
    {#each TABY as [id, label] (id)}
      <button
        type="button"
        role="tab"
        aria-selected={stav.tab === id}
        class:on={stav.tab === id}
        onclick={() => onchange({ tab: id })}
        data-testid="podnikani-tab-{id}">{label}</button
      >
    {/each}
  </div>

  {#if stav.tab === 'kreativci'}
    <div class="filtr">
      <label class="q">
        <span>Hledat</span>
        <input
          type="search"
          value={stav.q}
          oninput={(e) => onchange({ q: e.currentTarget.value })}
          placeholder="např. fotograf, keramika, Cheb"
          data-testid="kreativci-q"
        />
      </label>
      <label>
        <span>Obor</span>
        <select value={stav.obor} onchange={(e) => onchange({ obor: e.currentTarget.value })} data-testid="kreativci-obor">
          <option value="">Všechny obory</option>
          {#each obory as [o, n] (o)}
            <option value={o}>{o} ({n})</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="chips" role="group" aria-label="Nejčastější obory">
      {#each obory.slice(0, 10) as [o, n] (o)}
        <button type="button" class:on={stav.obor === o} onclick={() => onchange({ obor: stav.obor === o ? '' : o })}>
          {o} <span>{n}</span>
        </button>
      {/each}
    </div>
    <p class="lead" data-testid="kreativci-pocet">
      <strong>{vysledky.length}</strong>
      {pl(vysledky.length, 'kreativec', 'kreativci', 'kreativců')}{stav.obor ? ` v oboru ${stav.obor.toLowerCase()}` : ''}
    </p>
    <ul class="grid" data-testid="kreativci-list">
      {#each vysledky.slice(0, limit) as k (k.id)}
        <li class="card">
          <h3>{k.nazev}</h3>
          <p class="meta">{k.obec || 'obec neuvedena'}</p>
          <span class="tags">{#each k.obory as o (o)}<span>{o}</span>{/each}</span>
          <div class="links">
            {#if k.web}<a href={k.web} target="_blank" rel="noopener noreferrer">Web</a>{/if}
            {#if k.profil}<a href={k.profil} target="_blank" rel="noopener noreferrer">Profil v Galerii kreativců</a>{/if}
            {#if k.email}<a href="mailto:{k.email}">E-mail</a>{/if}
          </div>
        </li>
      {/each}
    </ul>
    {#if vysledky.length > limit}
      <button type="button" class="btn-secondary more" onclick={() => (limit += 48)}>Zobrazit další ({vysledky.length - limit})</button>
    {/if}
    <StahnoutData
      nazev={`kreativci${stav.obor ? `-${stav.obor}` : ''}`}
      pocet={vysledky.length}
      radky={() => vysledky.map((k) => ({ nazev: k.nazev, obory: k.obory.join(', '), obec: k.obec, web: k.web, profil: k.profil }))}
    />
  {:else if stav.tab === 'centra'}
    <div class="chips" role="group" aria-label="Typ">
      <button type="button" class:on={!typ} onclick={() => (typ = '')}>Vše <span>{data.infra.length}</span></button>
      {#each typy as [t, n] (t)}
        <button type="button" class:on={typ === t} onclick={() => (typ = t)} data-testid="centra-{t}">{INFRA_TYP[t]} <span>{n}</span></button>
      {/each}
    </div>
    <ul class="grid grid--2" data-testid="centra-list">
      {#each centra as c (c.id)}
        <li class="card">
          <p class="kind">{c.typy.map((t) => INFRA_TYP[t]).join(' · ') || 'Inovační infrastruktura'}</p>
          <h3>{c.nazev}</h3>
          <p class="meta">{c.adresa || c.obec}{c.rok ? ` · od roku ${c.rok}` : ''}{c.sektor ? ` · ${c.sektor} sektor` : ''}</p>
          {#if c.popis}<p class="popis">{c.popis}</p>{/if}
          <div class="links">
            {#if c.web}<a href={c.web} target="_blank" rel="noopener noreferrer">Web</a>{/if}
            <a href={mapy({ lat: null, lon: null, nazev: c.adresa || c.nazev, obec: c.obec })} target="_blank" rel="noopener noreferrer">Mapy.cz</a>
          </div>
        </li>
      {/each}
    </ul>
    <StahnoutData
      nazev="inkubatory-coworkingy"
      pocet={centra.length}
      radky={() => centra.map((c) => ({ nazev: c.nazev, typ: c.typy.map((t) => INFRA_TYP[t]).join(', '), adresa: c.adresa, rok_zalozeni: c.rok, sektor: c.sektor, web: c.web }))}
    />
  {:else}
    <div class="two">
      <section>
        <h2>Stávající zóny <span class="cnt">{stavajici.length}</span></h2>
        <ul class="zlist" data-testid="zony-stavajici">
          {#each stavajici as z (z.id)}
            <li>
              <div><strong>{z.nazev}</strong><span>{z.obec}{z.orp && z.orp !== z.obec ? ` · ORP ${z.orp}` : ''}</span></div>
              <a href={mapy(z)} target="_blank" rel="noopener noreferrer">Mapy.cz</a>
            </li>
          {/each}
        </ul>
      </section>
      <section>
        <h2>Plánované zóny (záměr) <span class="cnt">{zamery.length}</span></h2>
        <ul class="zlist" data-testid="zony-zamery">
          {#each zamery as z (z.id)}
            <li>
              <div><strong>{z.nazev}</strong><span>{z.obec}{z.orp && z.orp !== z.obec ? ` · ORP ${z.orp}` : ''}</span></div>
              <a href={mapy(z)} target="_blank" rel="noopener noreferrer">Mapy.cz</a>
            </li>
          {/each}
        </ul>
      </section>
    </div>
    <StahnoutData
      nazev="prumyslove-zony"
      pocet={data.zony.length}
      radky={() => data.zony.map((z) => ({ nazev: z.nazev, stav: z.stav === 'zamer' ? 'záměr' : 'stávající', obec: z.obec, orp: z.orp, zemepisna_sirka: z.lat, zemepisna_delka: z.lon }))}
    />
  {/if}

  {#if data.chybyDat.length}
    <section class="chyby" aria-labelledby="pchyby-h">
      <h3 id="pchyby-h">Co jsme v datech kraje našli</h3>
      <ul>{#each data.chybyDat as c (c)}<li>{c}</li>{/each}</ul>
      <a class="all" href="#/kraj?m=nalezy">Všechny nálezy ve všech datech kraje →</a>
    </section>
  {/if}
  <p class="foot">
    Zdroj: Karlovarský kraj, DATAZÁPAD – Galerie kreativců (CC BY 4.0), Inovační infrastruktury Karlovarského kraje
    (CC BY 4.0), Průmyslové zóny a parky (CC0). Kontakty kreativců zveřejnili sami v Galerii kreativců.
  </p>
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
    line-height: 1.2;
    margin: 6px 0 8px;
  }
  .perex {
    margin: 0 0 20px;
    max-width: 68ch;
    font-size: 1.1rem;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
    gap: 4px;
    cursor: pointer;
  }
  .kpi:first-child {
    border-left: 0;
  }
  .kpi:hover {
    background: var(--brand-ice);
  }
  .kpi__v {
    font-size: 1.9rem;
    font-weight: 700;
    color: var(--brand-dark);
    line-height: 1.1;
  }
  .kpi__l {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .main {
    padding-top: 24px;
    padding-bottom: 48px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 20px;
    overflow-x: auto;
  }
  .tabs button {
    font: inherit;
    font-weight: 500;
    min-height: 44px;
    padding: 0 16px;
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  .tabs button.on {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }
  .filtr {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 20px;
    margin-bottom: 12px;
  }
  .filtr label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 220px;
  }
  .filtr .q {
    flex: 1 1 320px;
  }
  .filtr span {
    font-weight: 500;
    color: var(--brand-dark);
    font-size: 0.9rem;
  }
  input[type='search'] {
    font: inherit;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid #8a94a3;
    border-radius: 4px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }
  .chips button {
    font: inherit;
    font-size: 0.9rem;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    background: #fff;
    color: var(--brand-dark);
    cursor: pointer;
  }
  .chips button span {
    color: var(--text-muted);
    margin-left: 4px;
  }
  .chips button.on {
    background: var(--brand);
    border-color: var(--brand);
    color: #fff;
  }
  .chips button.on span {
    color: #dbe5f3;
  }
  .lead {
    margin: 0 0 14px;
  }
  .lead strong {
    color: var(--brand-dark);
    font-size: 1.2rem;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .grid--2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .card {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .kind {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--brand);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
    line-height: 1.3;
  }
  .meta {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .popis {
    margin: 0;
    font-size: 0.9rem;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tags span {
    font-size: 0.75rem;
    background: var(--brand-ice);
    color: var(--brand-dark);
    border-radius: 4px;
    padding: 1px 7px;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: auto;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .more {
    width: 100%;
    margin-top: 14px;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }
  h2 {
    font-size: 1.25rem;
    margin: 0 0 10px;
  }
  .cnt {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
    background: #e8eef6;
    border-radius: 999px;
    padding: 1px 9px;
  }
  .zlist {
    list-style: none;
    margin: 0;
    padding: 0;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .zlist li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
  }
  .zlist li:last-child {
    border-bottom: 0;
  }
  .zlist strong {
    display: block;
    color: var(--brand-dark);
  }
  .zlist span {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .zlist a {
    flex: none;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .chyby {
    margin-top: 28px;
    padding: 14px 18px;
    background: #fff8e6;
    border-left: 4px solid var(--accent);
    border-radius: 4px;
  }
  .chyby h3 {
    font-size: 1rem;
    margin-bottom: 6px;
  }
  .all {
    display: inline-block;
    margin-top: 8px;
    font-weight: 500;
    font-size: 0.9rem;
  }
  .chyby ul {
    margin: 0;
    padding-left: 1.2em;
    font-size: 0.9rem;
  }
  .foot {
    margin-top: 20px;
    color: var(--text-muted);
    font-size: 0.82rem;
  }
  @media (max-width: 1000px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .grid--2,
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 600px) {
    .wrap {
      padding: 0 16px;
    }
    .grid,
    .kpis {
      grid-template-columns: minmax(0, 1fr);
    }
    .kpi {
      border-left: 0;
      border-top: 1px solid var(--line);
    }
    .kpi:first-child {
      border-top: 0;
    }
  }
</style>
