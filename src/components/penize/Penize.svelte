<script lang="ts">
  /**
   * Režim „Peníze kraje“ – co kraj buduje (projekty), komu dává (vouchery pro firmy)
   * a podle čeho plánuje (strategické dokumenty). Čísla první, vždy se srovnáním.
   */
  import type { AreaCode } from '../../lib/types.ts';
  import type { PenizeState } from '../../lib/state.ts';
  import {
    VOUCHER_TYP,
    formatDatum,
    kc,
    platiVRoce,
    podle,
    prubeh,
    souhrn,
    type PenizeFile,
    type Projekt,
    type Voucher,
    type VoucherTyp,
  } from '../../lib/penize.ts';

  interface Props {
    data: PenizeFile;
    vouchery: Voucher[];
    /** kód obce/ORP → název */
    names: Record<AreaCode, string>;
    stav: PenizeState;
    /** dnešní datum ISO (kvůli testům předávané zvenku) */
    dnes: string;
    onchange: (patch: Partial<PenizeState>) => void;
  }
  const { data, vouchery, names, stav, dnes, onchange }: Props = $props();

  const rok = $derived(Number(dnes.slice(0, 4)));
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '—');
  const fmt = (n: number) => new Intl.NumberFormat('cs-CZ').format(n);
  const pl = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);

  // --- projekty ---
  const aktualni = $derived(
    data.projekty.filter((p) => p.stav === 'probiha').sort((a, b) => (b.vydaje ?? 0) - (a.vydaje ?? 0)),
  );
  const ukoncene = $derived(
    data.projekty.filter((p) => p.stav === 'ukonceno').sort((a, b) => (b.do || '').localeCompare(a.do || '')),
  );
  const vydajeCelkem = $derived(aktualni.reduce((s, p) => s + (p.vydaje ?? 0), 0));
  const dotaceCelkem = $derived(aktualni.reduce((s, p) => s + (p.dotace ?? 0), 0));
  const terminMinul = (p: Projekt) => !!p.do && p.do.length === 10 && p.do < dnes;
  const obdobi = (p: Projekt) => [p.od, p.do].map((d) => (d.length === 10 ? formatDatum(d) : d)).filter(Boolean).join(' – ');

  // --- vouchery ---
  const vFiltr = $derived(
    vouchery.filter((v) => (!stav.typ || v.typ === stav.typ) && (!stav.orp || v.orp === stav.orp)),
  );
  const vSouhrn = $derived(souhrn(vFiltr));
  const vVse = $derived(souhrn(vouchery));
  const roky = $derived(podle(vFiltr, (v) => v.rok).sort((a, b) => a.klic - b.klic));
  const maxRok = $derived(Math.max(1, ...roky.map((r) => r.prideleno)));
  const typy = $derived(podle(vouchery.filter((v) => !stav.orp || v.orp === stav.orp), (v) => v.typ));
  const orpy = $derived(
    podle(vouchery.filter((v) => !stav.typ || v.typ === stav.typ), (v) => v.orp || null).sort((a, b) => b.prideleno - a.prideleno),
  );
  const maxOrp = $derived(Math.max(1, ...orpy.map((r) => r.prideleno)));
  const vsechnyOrp = $derived(
    [...new Set(vouchery.map((v) => v.orp).filter(Boolean))].sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b, 'cs')),
  );
  const rokyRozsah = $derived.by(() => {
    const r = vouchery.map((v) => v.rok).filter((x): x is number => x !== null);
    return r.length ? `${Math.min(...r)}–${Math.max(...r)}` : '';
  });
  let limit = $state(12);
  const podporene = $derived(vFiltr.filter((v) => v.uspesna).sort((a, b) => b.prideleno - a.prideleno));

  // --- strategie ---
  let oblast = $state('');
  let jenPlatne = $state(true);
  const oblasti = $derived([...new Set(data.strategie.flatMap((s) => s.oblasti))].sort((a, b) => a.localeCompare(b, 'cs')));
  const platnych = $derived(data.strategie.filter((s) => platiVRoce(s, rok)).length);
  const strategieFiltr = $derived(
    data.strategie.filter((s) => (!oblast || s.oblasti.includes(oblast)) && (!jenPlatne || platiVRoce(s, rok))),
  );

  const TABY: [PenizeState['tab'], string][] = [
    ['projekty', 'Projekty kraje'],
    ['vouchery', 'Vouchery pro firmy'],
    ['strategie', 'Strategie kraje'],
  ];
</script>

<section class="hero">
  <div class="wrap">
    <p class="kicker">Peníze kraje · Karlovarský kraj</p>
    <h1>Co kraj buduje a komu dává</h1>
    <p class="perex">
      Projekty, na které kraj čerpá evropské dotace, vouchery, kterými podporuje místní firmy, a strategie,
      podle kterých plánuje. Všechno z otevřených dat kraje.
    </p>
    <div class="kpis">
      <div class="kpi">
        <span class="kpi__v">{kc(vydajeCelkem)}</span>
        <span class="kpi__l">plánované výdaje {aktualni.length} {pl(aktualni.length, 'běžícího projektu', 'běžících projektů', 'běžících projektů')}</span>
      </div>
      <div class="kpi">
        <span class="kpi__v">{kc(dotaceCelkem)}</span>
        <span class="kpi__l">z toho dotace ({pct(dotaceCelkem, vydajeCelkem)} rozpočtu)</span>
      </div>
      <div class="kpi">
        <span class="kpi__v">{kc(vVse.prideleno)}</span>
        <span class="kpi__l">vouchery pro {vVse.uspesne} firemních projektů ({rokyRozsah})</span>
      </div>
      <div class="kpi">
        <span class="kpi__v">{platnych}</span>
        <span class="kpi__l">strategií platí v roce {rok} (z {data.strategie.length})</span>
      </div>
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
        data-testid="penize-tab-{id}">{label}</button
      >
    {/each}
  </div>

  {#if stav.tab === 'projekty'}
    <h2>Běžící projekty</h2>
    <div class="cards" data-testid="projekty-aktualni">
      {#each aktualni as p (p.id)}
        {@const pr = prubeh(p, dnes)}
        <article class="card">
          <p class="card__k">{p.program || 'Projekt kraje'}</p>
          <h3>{p.nazev}</h3>
          <div class="nums">
            <div><span class="n">{kc(p.vydaje)}</span><span class="l">rozpočet</span></div>
            <div>
              <span class="n">{kc(p.dotace)}</span><span class="l"
                >dotace{p.vydaje && p.dotace ? ` (${pct(p.dotace, p.vydaje)})` : ''}</span
              >
            </div>
          </div>
          {#if p.vydaje && p.dotace}
            <div class="split" aria-hidden="true" title="podíl dotace na rozpočtu">
              <span style="width: {Math.min(100, (p.dotace / p.vydaje) * 100)}%"></span>
            </div>
          {/if}
          <p class="term">
            {obdobi(p)}
            {#if terminMinul(p)}<span class="chip chip--warn">plánovaný konec už minul</span>{/if}
          </p>
          {#if pr !== null}
            <div class="prog" aria-label="Uplynulo {Math.round(pr * 100)} % doby projektu">
              <span style="width: {pr * 100}%"></span>
            </div>
            <p class="prog__t">uplynulo {Math.round(pr * 100)} % plánované doby</p>
          {/if}
          {#if p.popis}<p class="popis">{p.popis}</p>{/if}
          {#if p.web}<a class="more" href={p.web} target="_blank" rel="noopener noreferrer">Více o projektu</a>{/if}
        </article>
      {/each}
    </div>

    <h2 class="h2-gap">Dokončené projekty <span class="cnt">{ukoncene.length}</span></h2>
    <ol class="timeline" data-testid="projekty-ukoncene">
      {#each ukoncene as p (p.id)}
        <li>
          <span class="tl__rok">{p.do.slice(0, 4)}</span>
          <div>
            <strong>{p.nazev}</strong>
            <span class="tl__m">
              {obdobi(p)}{p.program ? ` · ${p.program}` : ''}{p.role ? ` · ${p.role}` : ''}
            </span>
            {#if p.popis}<span class="tl__p">{p.popis}</span>{/if}
          </div>
        </li>
      {/each}
    </ol>
  {:else if stav.tab === 'vouchery'}
    <div class="filtr">
      <div class="chips" role="group" aria-label="Typ voucheru">
        <button type="button" class:on={!stav.typ} onclick={() => onchange({ typ: '' })}>Všechny vouchery</button>
        {#each Object.entries(VOUCHER_TYP) as [id, t] (id)}
          <button type="button" class:on={stav.typ === id} onclick={() => onchange({ typ: id })} data-testid="voucher-{id}">{t.nazev}</button>
        {/each}
      </div>
      <label>
        <span>Území</span>
        <select value={stav.orp} onchange={(e) => onchange({ orp: e.currentTarget.value })} data-testid="voucher-orp">
          <option value="">Celý kraj</option>
          {#each vsechnyOrp as o (o)}
            <option value={o}>ORP {names[o] ?? o}</option>
          {/each}
        </select>
      </label>
    </div>

    <p class="lead" data-testid="voucher-souhrn">
      Kraj podpořil <strong>{vSouhrn.uspesne}</strong> z {vSouhrn.zadosti} žádostí ({pct(vSouhrn.uspesne, vSouhrn.zadosti)})
      a rozdělil <strong>{kc(vSouhrn.prideleno, false)}</strong>{stav.orp ? ` v ORP ${names[stav.orp] ?? stav.orp}` : ''}.
    </p>

    <div class="two">
      <section class="panel">
        <h3>Kolik kraj rozdělil v jednotlivých letech</h3>
        <div class="bars" role="img" aria-label="Přidělené částky podle roku">
          {#each roky as r (r.klic)}
            <div class="bar">
              <span class="bar__v">{kc(r.prideleno)}</span>
              <span class="bar__c" style="height: {(r.prideleno / maxRok) * 100}%"></span>
              <span class="bar__r">{r.klic}</span>
            </div>
          {/each}
        </div>
      </section>
      <section class="panel">
        <h3>Podle typu voucheru</h3>
        <ul class="typy">
          {#each typy.sort((a, b) => b.prideleno - a.prideleno) as t (t.klic)}
            <li>
              <strong>{VOUCHER_TYP[t.klic as VoucherTyp].nazev}</strong>
              <span>{VOUCHER_TYP[t.klic as VoucherTyp].popis}</span>
              <span class="typy__n">{kc(t.prideleno)} · {t.pocet} {pl(t.pocet, 'projekt', 'projekty', 'projektů')}</span>
            </li>
          {/each}
        </ul>
      </section>
    </div>

    <section class="panel">
      <h3>Kam peníze šly (podle ORP)</h3>
      <table class="hbars">
        <tbody>
          {#each orpy as o (o.klic)}
            <tr>
              <th scope="row">{names[o.klic] ?? o.klic}</th>
              <td><span class="hb"><span style="width: {(o.prideleno / maxOrp) * 100}%"></span></span></td>
              <td class="num">{kc(o.prideleno)}</td>
              <td class="num dim">{o.pocet} {pl(o.pocet, 'projekt', 'projekty', 'projektů')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h3>Podpořené projekty firem <span class="cnt">{podporene.length}</span></h3>
      <ul class="vlist" data-testid="voucher-list">
        {#each podporene.slice(0, limit) as v (v.id)}
          <li>
            <div>
              <strong>{v.nazev}</strong>
              <span>{VOUCHER_TYP[v.typ].nazev} · {v.rok ?? '—'} · {names[v.obec] ?? ''}</span>
            </div>
            <span class="vlist__k">{kc(v.prideleno, false)}</span>
          </li>
        {/each}
      </ul>
      {#if podporene.length > limit}
        <button type="button" class="btn-secondary more-btn" onclick={() => (limit += 24)}>
          Zobrazit další ({podporene.length - limit})
        </button>
      {/if}
    </section>
  {:else}
    <div class="filtr">
      <label>
        <span>Oblast</span>
        <select bind:value={oblast} data-testid="strategie-oblast">
          <option value="">Všechny oblasti</option>
          {#each oblasti as o (o)}
            <option value={o}>{o}</option>
          {/each}
        </select>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={jenPlatne} data-testid="strategie-platne" />
        <span>Jen platné v roce {rok}</span>
      </label>
    </div>
    <p class="lead">
      <strong>{strategieFiltr.length}</strong>
      {pl(strategieFiltr.length, 'dokument', 'dokumenty', 'dokumentů')}{jenPlatne ? ` platných v roce ${rok}` : ''}{oblast ? ` v oblasti ${oblast}` : ''}.
    </p>
    <ul class="slist" data-testid="strategie-list">
      {#each strategieFiltr as s (s.id)}
        {@const plati = platiVRoce(s, rok)}
        <li>
          <div class="slist__h">
            <strong>{s.nazev}</strong>
            <span class="chip" class:chip--ok={plati}>{plati ? 'platí' : 'skončila'} · {s.od ?? '?'}–{s.do ?? '?'}</span>
          </div>
          <span class="slist__m">{s.druh}</span>
          {#if s.oblasti.length}
            <span class="tags">{#each s.oblasti as o (o)}<span>{o}</span>{/each}</span>
          {/if}
          {#if s.web}<a href={s.web} target="_blank" rel="noopener noreferrer">Dokument na webu</a>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if data.chybyDat.length}
    <section class="chyby" aria-labelledby="chyby-h">
      <h3 id="chyby-h">Co jsme v datech kraje našli</h3>
      <ul>
        {#each data.chybyDat as c (c)}<li>{c}</li>{/each}
      </ul>
    </section>
  {/if}
  <p class="foot">
    Zdroj: Karlovarský kraj, DATAZÁPAD – aktuální a ukončené projekty kraje, seznam strategických dokumentů,
    vouchery (inovační, kreativní, asistenční, startovací). Částky jsou plánované nebo přidělené, ne vyplacené.
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
    max-width: 70ch;
    font-size: 1.1rem;
    line-height: 1.5;
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
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-left: 1px solid var(--line);
  }
  .kpi:first-child {
    border-left: 0;
  }
  .kpi__v {
    font-size: 1.9rem;
    font-weight: 700;
    line-height: 1.1;
    color: var(--brand-dark);
    letter-spacing: -0.02em;
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
  h2 {
    font-size: 1.35rem;
    margin: 0 0 12px;
  }
  .h2-gap {
    margin-top: 32px;
  }
  .cnt {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-muted);
    background: #e8eef6;
    border-radius: 999px;
    padding: 1px 9px;
    vertical-align: middle;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .card {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .card__k {
    margin: 0;
    font-size: 0.8rem;
    color: var(--brand);
    font-weight: 500;
  }
  h3 {
    margin: 0;
    font-size: 1.15rem;
    line-height: 1.3;
  }
  .nums {
    display: flex;
    gap: 28px;
  }
  .nums div {
    display: flex;
    flex-direction: column;
  }
  .n {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--brand-dark);
  }
  .l {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .split,
  .prog,
  .hb {
    display: block;
    height: 8px;
    border-radius: 3px;
    background: #e3edf8;
    overflow: hidden;
  }
  .split span,
  .hb span {
    display: block;
    height: 100%;
    background: var(--data-1);
  }
  .prog span {
    display: block;
    height: 100%;
    background: var(--data-2);
  }
  .term {
    margin: 4px 0 0;
    font-size: 0.92rem;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
  }
  .prog__t {
    margin: -2px 0 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .chip {
    font-size: 0.78rem;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--st-na-soft);
    color: var(--st-na);
    white-space: nowrap;
  }
  .chip--warn {
    background: #fff1d1;
    color: #8a5a00;
  }
  .chip--ok {
    background: var(--st-volno-soft);
    color: var(--st-volno);
  }
  .popis {
    margin: 0;
    font-size: 0.92rem;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .more {
    font-weight: 500;
    margin-top: auto;
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    border-left: 2px solid var(--line);
  }
  .timeline li {
    display: grid;
    grid-template-columns: 4em minmax(0, 1fr);
    gap: 12px;
    padding: 10px 0 10px 16px;
    position: relative;
  }
  .timeline li::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 16px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--brand);
    box-shadow: 0 0 0 3px var(--bg);
  }
  .tl__rok {
    font-weight: 700;
    color: var(--brand);
  }
  .timeline strong {
    display: block;
    color: var(--brand-dark);
  }
  .tl__m,
  .tl__p {
    display: block;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .tl__p {
    color: var(--text);
    margin-top: 2px;
  }
  .filtr {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 20px;
    margin-bottom: 14px;
  }
  .filtr label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .filtr label span {
    font-weight: 500;
    color: var(--brand-dark);
    font-size: 0.9rem;
  }
  .filtr .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  .filtr .check input {
    -webkit-appearance: checkbox;
    appearance: auto;
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--brand);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips button {
    font: inherit;
    font-size: 0.92rem;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 4px;
    border: 1px solid var(--brand);
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  .chips button.on {
    background: var(--brand);
    color: #fff;
  }
  .lead {
    font-size: 1.05rem;
    margin: 0 0 16px;
  }
  .lead strong {
    color: var(--brand-dark);
  }
  .two {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 16px;
    margin-bottom: 16px;
  }
  .panel {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 16px;
    min-width: 0;
  }
  .two .panel {
    margin-bottom: 0;
  }
  .panel h3 {
    font-size: 1.05rem;
    margin-bottom: 12px;
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 220px;
    padding-top: 20px;
  }
  .bar {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    min-width: 0;
  }
  .bar__c {
    width: 100%;
    max-width: 42px;
    background: var(--data-1);
    border-radius: 3px 3px 0 0;
    min-height: 2px;
  }
  .bar__v {
    font-size: 0.68rem;
    color: var(--text-muted);
    white-space: nowrap;
    margin-bottom: 3px;
  }
  .bar__r {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 4px;
  }
  .typy {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .typy li {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .typy li:last-child {
    border-bottom: 0;
  }
  .typy strong {
    color: var(--brand-dark);
  }
  .typy span {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .typy .typy__n {
    color: var(--brand);
    font-weight: 500;
    font-size: 0.92rem;
  }
  .hbars {
    width: 100%;
    border-collapse: collapse;
  }
  .hbars th {
    text-align: left;
    font-weight: 400;
    padding: 6px 12px 6px 0;
    white-space: nowrap;
  }
  .hbars td {
    padding: 6px 4px;
  }
  .hbars td:nth-child(2) {
    width: 55%;
  }
  .num {
    text-align: right;
    white-space: nowrap;
    font-weight: 500;
  }
  .dim {
    color: var(--text-muted);
    font-weight: 400;
  }
  .vlist {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .vlist li {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }
  .vlist strong {
    display: block;
    font-weight: 500;
    color: var(--brand-dark);
    font-size: 0.95rem;
  }
  .vlist span {
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .vlist .vlist__k {
    flex: none;
    font-weight: 700;
    color: var(--brand-dark);
    font-size: 0.95rem;
  }
  .more-btn {
    width: 100%;
    margin-top: 12px;
  }
  .slist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .slist li {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .slist__h {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }
  .slist strong {
    color: var(--brand-dark);
  }
  .slist__m {
    font-size: 0.85rem;
    color: var(--text-muted);
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
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .kpi:nth-child(3) {
      border-left: 0;
    }
    .kpi:nth-child(n + 3) {
      border-top: 1px solid var(--line);
    }
    .cards,
    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 560px) {
    .wrap {
      padding: 0 16px;
    }
    .bar__v {
      display: none;
    }
    .hbars td:nth-child(4) {
      display: none;
    }
  }
</style>
