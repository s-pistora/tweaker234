<script lang="ts">
  /**
   * „Pro kraj“: podklady pro rozhodování veřejné správy.
   * Bílá místa – kde mají lidé ke službě nejdál a kam by nová služba pomohla nejvíc lidem.
   * Výhled oborů – hrubý odhad, které obory budou příští rok poloprázdné nebo přeplněné.
   */
  import type { AreaCode, IndicatorDef, Obor } from '../../lib/types.ts';
  import type { AreaFeature } from '../../lib/map/project.ts';
  import type { ZivotKontext } from '../../lib/zivot.ts';
  import { PROKRAJ_KM_MAX, PROKRAJ_KM_MIN, type ProKrajState } from '../../lib/state.ts';
  import { SLUZBY, nejlepsiMista, pokryti } from '../../lib/bilamista.ts';
  import { TRIDA_VYHLEDU, rizikoveObory, souhrnVyhledu, vyhledOboru } from '../../lib/odhad.ts';
  import Map from '../Map.svelte';
  import Legend from '../Legend.svelte';
  import StahnoutData from '../common/StahnoutData.svelte';

  interface Props {
    stav: ProKrajState;
    ctx: ZivotKontext;
    obce: AreaFeature[];
    obory: Obor[];
    /** ORP → index vývoje počtu dětí (lib/odhad.ts) */
    indexy: Record<AreaCode, number>;
    names: Record<AreaCode, string>;
    onchange: (patch: Partial<ProKrajState>) => void;
  }
  const { stav, ctx, obce, obory, indexy, names, onchange }: Props = $props();

  const fmt = (n: number, d = 0) =>
    new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n).replace('-', '−');
  const pl = (n: number, f: [string, string, string]) => (n === 1 ? f[0] : n >= 2 && n <= 4 ? f[1] : f[2]);
  const kmTxt = (k: number) => `${k < 10 ? fmt(k, 1) : fmt(k)} km`;

  // --- bílá místa ---
  const sluzba = $derived(SLUZBY.find((s) => s.id === stav.sluzba) ?? SLUZBY[0]);
  const pok = $derived(pokryti(ctx, sluzba.id, stav.km));
  const navrhy = $derived(nejlepsiMista(ctx, sluzba.id, stav.km, 3));
  const values = $derived(Object.fromEntries(pok.obce.map((o) => [o.kod, o.km])) as Record<AreaCode, number | null>);
  const DEF = $derived<IndicatorDef>({
    id: 'bila-mista',
    label: `Vzdálenost: ${sluzba.label.toLowerCase()}`,
    unit: 'km',
    higherIsBetter: false,
    sourceId: 'zivot',
    decimals: 1,
  });
  const nejdal = $derived(pok.obce.filter((o) => o.km !== null && o.km > stav.km).slice(0, 10));
  function preview(code: AreaCode): string[] {
    const o = pok.obce.find((x) => x.kod === code);
    if (!o || o.km === null) return ['Bez údaje.'];
    return [`${sluzba.label}: ${kmTxt(o.km)}`, `${fmt(o.obyvatel)} obyvatel`];
  }

  // --- výhled oborů ---
  const vyhled = $derived(vyhledOboru(obory, indexy));
  const podleSkupin = $derived(souhrnVyhledu(vyhled, 'skupina'));
  const podleOrp = $derived(souhrnVyhledu(vyhled, 'orp', names));
  const poloprazdne = $derived(rizikoveObory(vyhled, 'poloprazdny'));
  const pretlak = $derived(rizikoveObory(vyhled, 'pretlak'));
  const proc = (x: number) => `${fmt((x - 1) * 100, 1)} %`;
  const kratce = (s: string) => s.replace(/,?\s*příspěvková organizace$/i, '');
</script>

<section class="hero">
  <div class="wrap">
    <p class="kicker">Podklady pro krajský úřad a obce</p>
    <h1>Pro kraj: kde chybí služby a které obory čeká změna</h1>
    <p class="perex">
      Data nejen k prohlížení, ale k rozhodování: kam umístit novou ordinaci, školku nebo lékárnu a u kterých oborů
      střední školy příští rok hrozí prázdné lavice nebo nedostatek míst.
    </p>
    <div class="tabs" role="tablist" aria-label="Pohled">
      <button type="button" role="tab" aria-selected={stav.tab === 'bila'} class:on={stav.tab === 'bila'} onclick={() => onchange({ tab: 'bila' })} data-testid="prokraj-tab-bila">Bílá místa</button>
      <button type="button" role="tab" aria-selected={stav.tab === 'vyhled'} class:on={stav.tab === 'vyhled'} onclick={() => onchange({ tab: 'vyhled' })} data-testid="prokraj-tab-vyhled">Výhled oborů</button>
    </div>
  </div>
</section>

<main class="wrap main">
  {#if stav.tab === 'bila'}
    <div class="filtr" data-testid="bila-filtr">
      <label>
        Služba
        <select value={sluzba.id} onchange={(e) => onchange({ sluzba: e.currentTarget.value })} data-testid="bila-sluzba">
          {#each SLUZBY as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
        </select>
      </label>
      <label>
        Rozumná vzdálenost: <strong>{stav.km} km</strong>
        <input
          type="range"
          min={PROKRAJ_KM_MIN}
          max={PROKRAJ_KM_MAX}
          value={stav.km}
          oninput={(e) => onchange({ km: Number(e.currentTarget.value) })}
          data-testid="bila-km"
        />
      </label>
    </div>

    <p class="big" data-testid="bila-souhrn">
      {#if pok.mimo > 0}
        <strong>{fmt(pok.mimo)} obyvatel</strong> ({fmt((100 * pok.mimo) / Math.max(1, pok.celkem), 1)} % kraje) v {pok.mimoObci}
        {pl(pok.mimoObci, ['obci', 'obcích', 'obcích'])} to má k nejbližší službě „{sluzba.label}“ dál než {stav.km} km.
      {:else}
        Všichni obyvatelé kraje to mají k nejbližší službě „{sluzba.label}“ do {stav.km} km.
      {/if}
    </p>

    <div class="split">
      <div>
        {#if navrhy.length}
          <section class="card" data-testid="bila-navrhy">
            <h2>Kde by nová služba pomohla nejvíc</h2>
            <ol class="navrhy">
              {#each navrhy as n, i (n.kod)}
                <li>
                  <strong>{i + 1}. {n.nazev}</strong> – přiblížila by službu pod {stav.km} km
                  <strong>{fmt(n.pomuze)} obyvatelům</strong> v {n.obce.length}
                  {pl(n.obce.length, ['obci', 'obcích', 'obcích'])}{n.obce.length <= 6 ? ` (${n.obce.join(', ')})` : ''}.
                </li>
              {/each}
            </ol>
            <p class="note">
              Každý další návrh už počítá s předchozími. Odhad podle středů obcí vzdušnou čarou – ověřte skutečnou dopravní
              dostupnost.
            </p>
          </section>
        {/if}
        <section class="card">
          <h2>Obce, které to mají nejdál</h2>
          {#if nejdal.length}
            <table>
              <thead><tr><th>Obec</th><th>Vzdálenost</th><th>Obyvatel</th></tr></thead>
              <tbody>
                {#each nejdal as o (o.kod)}
                  <tr><td>{o.nazev}</td><td>{o.km === null ? '—' : kmTxt(o.km)}</td><td>{fmt(o.obyvatel)}</td></tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <p>Žádná obec není dál než {stav.km} km.</p>
          {/if}
          <StahnoutData
            nazev={`bila-mista-${sluzba.id}-${stav.km}km`}
            pocet={pok.obce.length}
            radky={() => pok.obce.map((o) => ({ obec: o.nazev, kod_obce: o.kod, sluzba: sluzba.label, vzdalenost_km: o.km === null ? null : Math.round(o.km * 10) / 10, obyvatel: o.obyvatel, nad_hranici: o.km !== null && o.km > stav.km }))}
          />
        </section>
      </div>
      <section class="mapcard" aria-label="Mapa vzdálenosti ke službě">
        <Map
          features={obce}
          {values}
          def={DEF}
          year={null}
          {preview}
          label={`Mapa obcí podle vzdálenosti: ${sluzba.label}`}
          hint="Najeďte na obec a uvidíte vzdálenost a počet obyvatel."
        />
        <Legend values={obce.map((f) => values[f.properties.code] ?? null)} def={DEF} year={null} />
      </section>
    </div>
  {:else}
    <p class="note warn">
      <strong>Hrubý odhad, ne předpověď.</strong> Loňští přijatí (k 30. 9. 2025) × trend počtu dětí 0–14 let v ORP školy
      (ČSÚ, 2020–2025), porovnané s plánem míst na 2026/27. Data o přijímání máme jen za jeden rok.
    </p>
    <div class="split split--even">
      <section class="card" data-testid="vyhled-poloprazdne">
        <h2>Hrozí poloprázdné obory</h2>
        <ol class="rizika">
          {#each poloprazdne as x (x.obor.izo + x.obor.kodOboru + x.obor.forma)}
            <li><strong>{x.obor.nazevOboru}</strong> – {kratce(x.obor.skola)}<br /><span class="note">odhad {fmt(x.odhad)} zájemců na {x.mist} míst ({fmt(x.pomer * 100)} %)</span></li>
          {/each}
        </ol>
      </section>
      <section class="card" data-testid="vyhled-pretlak">
        <h2>Hrozí nedostatek míst</h2>
        <ol class="rizika">
          {#each pretlak as x (x.obor.izo + x.obor.kodOboru + x.obor.forma)}
            <li><strong>{x.obor.nazevOboru}</strong> – {kratce(x.obor.skola)}<br /><span class="note">odhad {fmt(x.odhad)} zájemců na {x.mist} míst ({fmt(x.pomer * 100)} %)</span></li>
          {/each}
        </ol>
      </section>
    </div>
    {#each [{ nadpis: 'Podle skupin oborů', rows: podleSkupin, id: 'skupiny' }, { nadpis: 'Podle území (ORP školy)', rows: podleOrp, id: 'orp' }] as t (t.id)}
      <section class="card" data-testid="vyhled-{t.id}">
        <h2>{t.nadpis}</h2>
        <table>
          <thead><tr><th>{t.id === 'orp' ? 'ORP' : 'Skupina'}</th><th>Míst 2026/27</th><th>Odhad zájmu</th><th>Výhled</th></tr></thead>
          <tbody>
            {#each t.rows as r (r.klic)}
              <tr>
                <td>{r.nazev}</td>
                <td>{fmt(r.mist)}</td>
                <td>{fmt(r.odhad)} ({fmt(r.pomer * 100)} %)</td>
                <td><span class="chip chip--{r.trida}">{TRIDA_VYHLEDU[r.trida]}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/each}
    <section class="card">
      <h2>Trend počtu dětí podle ORP</h2>
      <p class="note">
        {#each Object.entries(indexy).sort((a, b) => a[1] - b[1]) as [orp, ix], i (orp)}{names[orp] ?? orp}: {proc(ix)} ročně{i < Object.keys(indexy).length - 1 ? ' · ' : ''}{/each}
      </p>
      <StahnoutData
        nazev="vyhled-oboru-2026-27"
        pocet={vyhled.length}
        radky={() => vyhled.map((x) => ({ skola: x.obor.skola, obec: x.obor.obec, obor: x.obor.nazevOboru, kod_oboru: x.obor.kodOboru, mist_2026_27: x.mist, prijato_2025: x.obor.prijato2025, index_deti: Math.round(x.index * 1000) / 1000, odhad_zajmu: Math.round(x.odhad), pomer_pct: Math.round(x.pomer * 100), vyhled: TRIDA_VYHLEDU[x.trida] }))}
      />
    </section>
  {/if}
</main>

<style>
  .wrap {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
    box-sizing: border-box;
  }
  .hero {
    background: var(--brand-ice);
    border-bottom: 1px solid var(--line);
    padding: 32px 0 0;
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
    font-size: clamp(1.7rem, 4vw, 2.3rem);
    margin: 6px 0 8px;
  }
  .perex {
    margin: 0 0 18px;
    max-width: 75ch;
    font-size: 1.05rem;
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tabs button {
    font: inherit;
    min-height: 44px;
    padding: 0 18px;
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    background: transparent;
    cursor: pointer;
    color: var(--brand-dark);
  }
  .tabs button.on {
    background: #fff;
    font-weight: 700;
  }
  .main {
    padding-top: 22px;
    padding-bottom: 48px;
  }
  .filtr {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 28px;
    align-items: end;
    margin-bottom: 14px;
  }
  .filtr label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 500;
    min-width: 240px;
  }
  .filtr select {
    font: inherit;
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: #fff;
  }
  .filtr input[type='range'] {
    min-height: 44px;
  }
  .big {
    font-size: 1.15rem;
    margin: 0 0 16px;
  }
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 16px;
    align-items: start;
  }
  .split--even {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 16px;
  }
  .card,
  .mapcard {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px 18px;
    margin-bottom: 16px;
    min-width: 0;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 1.1rem;
  }
  .navrhy,
  .rizika {
    margin: 0;
    padding-left: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rizika {
    padding-left: 20px;
    list-style: decimal;
  }
  .note {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .warn {
    background: var(--st-ok-soft);
    color: var(--c-text);
    padding: 10px 14px;
    border-radius: 8px;
    margin-top: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
    margin-bottom: 10px;
  }
  th,
  td {
    text-align: left;
    padding: 6px 8px 6px 0;
    border-top: 1px solid var(--line);
  }
  th {
    font-weight: 500;
    color: var(--text-muted);
  }
  .chip {
    font-size: 0.78rem;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .chip--poloprazdny {
    background: var(--st-volno-soft);
    color: var(--st-volno);
  }
  .chip--ok {
    background: var(--st-na-soft);
    color: var(--st-na);
  }
  .chip--pretlak {
    background: var(--st-pretlak-soft);
    color: var(--st-pretlak);
  }
  @media (max-width: 900px) {
    .split,
    .split--even {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 560px) {
    .wrap {
      padding: 0 16px;
    }
    .filtr label {
      min-width: 0;
      width: 100%;
    }
    table {
      font-size: 0.82rem;
    }
  }
</style>
