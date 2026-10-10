<script lang="ts">
  /**
   * Plánovač přihlášek: až 3 obory v pořadí priority, odhad šance podle loňské obsazenosti,
   * záloha, termíny 2027 a nejbližší poradna. Výstup do kalendáře (.ics) a k tisku pro rodiče.
   */
  import type { Obor, Poradna } from '../../lib/types.ts';
  import { TYP_LABEL, vzdalenostKm, type Domov } from '../../lib/skoly.ts';
  import {
    PLAN_MAX,
    TERMINY_ZDROJ,
    datumTerminu,
    maJpz,
    odeber,
    planDoIcs,
    planId,
    posun,
    pridej,
    sanceOboru,
    terminyProPlan,
    zalohaPlanu,
  } from '../../lib/planovac.ts';
  import { stahniSoubor } from '../../lib/csv.ts';

  interface Props {
    /** obory plánu v pořadí priority */
    plan: Obor[];
    /** všechny obory pro žáky ze ZŠ (na návrh zálohy) */
    obory: Obor[];
    domov: Domov | null;
    domovNazev: string;
    maxKm: number;
    poradny: Poradna[];
    onchange: (plan: string[]) => void;
    onselect: (izo: string) => void;
  }
  const { plan, obory, domov, domovNazev, maxKm, poradny, onchange, onselect }: Props = $props();

  const ids = $derived(plan.map(planId));
  const rada = $derived(zalohaPlanu(plan, obory, domov, maxKm));
  const terminy = $derived(terminyProPlan(plan));
  const poradna = $derived.by(() => {
    if (!domov) return null;
    const ppp = poradny
      .filter((p) => /psychologick/i.test(p.typ) && p.lat !== null && p.lon !== null)
      .map((p) => ({ p, km: vzdalenostKm(domov.lat, domov.lon, p.lat as number, p.lon as number) }))
      .sort((a, b) => a.km - b.km);
    return ppp[0] ?? null;
  });
  const km = (o: Obor) => (domov ? vzdalenostKm(domov.lat, domov.lon, o.lat, o.lon) : null);
  const kmTxt = (k: number) => `${k < 10 ? k.toFixed(1).replace('.', ',') : k.toFixed(0)} km`;
  const kratce = (s: string) => s.replace(/,?\s*příspěvková organizace$/i, '');

  let stav = $state('');
  function kalendar() {
    const ok = stahniSoubor('prijimacky-2027', planDoIcs(plan, terminy), 'text/calendar;charset=utf-8', 'ics');
    stav = ok ? 'Kalendář stažen – otevřete soubor a termíny se přidají do kalendáře.' : 'Stažení se nepodařilo.';
    setTimeout(() => (stav = ''), 4000);
  }
  function tisk() {
    try {
      window.print();
    } catch {
      /* testovací prostředí */
    }
  }
</script>

<section class="plan" aria-labelledby="plan-h" data-testid="planovac">
  <header>
    <h2 id="plan-h">Můj plán přihlášek</h2>
    <p class="lead">
      Do 1. kola můžete podat až {PLAN_MAX} přihlášky. Pořadí je vaše priorita: když vás vezmou na více škol,
      nastoupíte na tu výš v pořadí.
    </p>
  </header>

  {#if plan.length === 0}
    <p class="empty" data-testid="plan-prazdny">
      Plán je zatím prázdný. Otevřete školu v seznamu a u oboru klikněte na <strong>„Přidat do plánu přihlášek“</strong>.
    </p>
  {:else}
    <ol class="items">
      {#each plan as o, i (planId(o))}
        {@const s = sanceOboru(o)}
        {@const k = km(o)}
        <li class="item" data-testid="plan-polozka">
          <span class="poradi" aria-hidden="true">{i + 1}.</span>
          <div class="body">
            <button type="button" class="nazev" onclick={() => onselect(o.izo)}>{o.nazevOboru}</button>
            <span class="skola">{kratce(o.skola)}, {o.obec}{k !== null ? ` · ${kmTxt(k)}` : ''}</span>
            <span class="meta">
              {TYP_LABEL[o.typ]} · {o.delka} · {o.zamer[2026] ?? 0} míst · {maJpz(o) ? 'jednotná přijímací zkouška' : 'bez jednotné zkoušky'}
            </span>
            <span class="sance sance--{s.trida}"><strong>{s.nazev}.</strong> {s.veta}</span>
          </div>
          <div class="ctrl noprint">
            <button type="button" aria-label="Posunout výš" disabled={i === 0} onclick={() => onchange(posun(ids, planId(o), -1))}>↑</button>
            <button type="button" aria-label="Posunout níž" disabled={i === plan.length - 1} onclick={() => onchange(posun(ids, planId(o), 1))}
              >↓</button
            >
            <button type="button" aria-label="Odebrat z plánu" onclick={() => onchange(odeber(ids, planId(o)))} data-testid="plan-odebrat"
              >✕</button
            >
          </div>
        </li>
      {/each}
    </ol>

    {#if rada.upozorneni.length}
      <ul class="warn" data-testid="plan-upozorneni">
        {#each rada.upozorneni as u (u)}<li>{u}</li>{/each}
      </ul>
    {/if}
    {#if rada.alternativy.length}
      <div class="alt" data-testid="plan-alternativy">
        <h3>Záloha: obory se stejným zaměřením, kde loni zbyla místa</h3>
        <ul>
          {#each rada.alternativy as a (planId(a.obor))}
            <li>
              <span>
                <strong>{a.obor.nazevOboru}</strong> – {kratce(a.obor.skola)}{a.km !== null ? ` (${kmTxt(a.km)})` : ''}.
                {sanceOboru(a.obor).veta}
              </span>
              <button
                type="button"
                class="btn-secondary noprint"
                disabled={ids.length >= PLAN_MAX}
                onclick={() => onchange(pridej(ids, planId(a.obor)))}>Přidat</button
              >
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}

  <h3>Termíny 2027</h3>
  <table class="terminy" data-testid="plan-terminy">
    <tbody>
      {#each terminy as t (t.id)}
        <tr>
          <th scope="row">{datumTerminu(t)}</th>
          <td><strong>{t.nazev}</strong><br /><span class="meta">{t.popis}</span></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="src">
    Termíny nejsou z otevřených dat kraje – zdroj:
    <a href={TERMINY_ZDROJ.url} target="_blank" rel="noopener noreferrer">{TERMINY_ZDROJ.nazev}</a>. Šance je odhad
    z loňské obsazenosti (DATAZÁPAD), ne pravděpodobnost přijetí – rozhodují body z přijímaček.
  </p>

  {#if poradna}
    <p class="por">
      <strong>Nevíte si rady?</strong> Nejbližší pedagogicko-psychologická poradna{domovNazev ? ` od obce ${domovNazev}` : ''}:
      {poradna.p.nazev}, {poradna.p.adresa} ({kmTxt(poradna.km)}). Poradí zdarma s výběrem oboru.
    </p>
  {/if}

  <div class="actions noprint">
    <button type="button" class="btn-primary" onclick={kalendar} data-testid="plan-ics">Přidat termíny do kalendáře (.ics)</button>
    <button type="button" class="btn-secondary" onclick={tisk} data-testid="plan-tisk">Vytisknout / uložit jako PDF pro rodiče</button>
    {#if stav}<span class="st" role="status">{stav}</span>{/if}
  </div>
</section>

<style>
  .plan {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 18px 20px 20px;
    margin: 16px 0;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.3rem;
  }
  h3 {
    margin: 18px 0 8px;
    font-size: 1rem;
  }
  .lead {
    margin: 0 0 12px;
    color: var(--text-muted);
  }
  .empty {
    background: var(--brand-ice);
    border-radius: 8px;
    padding: 12px 14px;
    margin: 0;
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px;
  }
  .poradi {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--brand);
    line-height: 1;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .nazev {
    font: inherit;
    font-weight: 700;
    text-align: left;
    background: none;
    border: 0;
    padding: 0;
    color: var(--brand-dark);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .skola {
    font-size: 0.92rem;
  }
  .meta {
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .sance {
    margin-top: 4px;
    font-size: 0.9rem;
    border-left: 3px solid var(--st-na);
    padding-left: 8px;
  }
  .sance--volno {
    border-color: var(--st-volno);
  }
  .sance--ok {
    border-color: var(--st-ok);
  }
  .sance--pretlak {
    border-color: var(--st-pretlak);
  }
  .ctrl {
    display: flex;
    gap: 4px;
  }
  .ctrl button {
    font: inherit;
    min-width: 44px;
    min-height: 44px;
    border: 1px solid var(--line-strong);
    background: #fff;
    border-radius: 4px;
    cursor: pointer;
  }
  .ctrl button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .warn {
    margin: 12px 0 0;
    padding: 10px 14px 10px 30px;
    background: var(--st-ok-soft);
    border-radius: 8px;
    font-size: 0.92rem;
  }
  .alt ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .alt li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 0.92rem;
  }
  .terminy {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
  }
  .terminy th,
  .terminy td {
    text-align: left;
    vertical-align: top;
    padding: 8px 10px 8px 0;
    border-top: 1px solid var(--line);
  }
  .terminy th {
    white-space: nowrap;
    font-weight: 500;
    color: var(--brand);
    width: 1%;
  }
  .src {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .por {
    font-size: 0.92rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
  }
  .st {
    font-size: 0.85rem;
    color: var(--st-volno);
  }
  @media (max-width: 560px) {
    .item {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .ctrl {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }
    .terminy th {
      white-space: normal;
    }
    .plan {
      padding: 14px;
    }
  }
  @media print {
    .plan {
      border: 0;
      padding: 0;
    }
  }
</style>
