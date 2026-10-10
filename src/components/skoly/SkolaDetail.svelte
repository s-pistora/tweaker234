<script lang="ts">
  /**
   * Detail vybrané školy jako vysouvací panel zprava (na mobilu přes celou obrazovku).
   * Esc zavírá globálně App (jako u ostatních modálů), tady jen klik na pozadí / ×.
   */
  import type { Obor, SourceEntry } from '../../lib/types.ts';
  import {
    TYP_LABEL,
    naplnenost,
    naplnenostSkoly,
    vetaDoprava,
    vetaNaplnenost,
    vetaTrend,
    klicOboru,
  } from '../../lib/skoly.ts';
  import Naplnenost from './Naplnenost.svelte';
  import { PLAN_MAX, planId } from '../../lib/planovac.ts';

  interface Props {
    obory: Obor[];
    /** vzdálenost od domova v km, null = domov nezadán */
    km: number | null;
    sources: SourceEntry[];
    onclose: () => void;
    porovnani?: string[];
    onporovnat?: (klic: string) => void;
    /** id oborů v plánu přihlášek */
    plan?: string[];
    /** přidá obor do plánu, nebo ho z něj odebere */
    onplan?: (id: string) => void;
  }
  const { obory, km, sources, onclose, porovnani = [], onporovnat, plan = [], onplan }: Props = $props();

  const s = $derived(obory[0]);
  const otevirane = $derived(obory.filter((o) => (o.zamer[2026] ?? 0) > 0));
  const zavrene = $derived(obory.filter((o) => !((o.zamer[2026] ?? 0) > 0)));
  const celkem = $derived(naplnenostSkoly(obory));
  const mist2026 = $derived(otevirane.reduce((a, o) => a + (o.zamer[2026] ?? 0), 0));
  const web = $derived(s?.web ? (/^https?:\/\//.test(s.web) ? s.web : `https://${s.web}`) : '');

  let closeBtn = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    closeBtn?.focus();
  });
</script>

{#if s}
  <div class="backdrop" onclick={onclose} aria-hidden="true"></div>
  <div class="drawer" role="dialog" aria-modal="true" aria-label="Detail školy {s.skola}" data-testid="skola-detail">
    <header>
      <div>
        <p class="kicker">Střední škola, {s.obec}</p>
        <h2>{s.skola.replace(/,?\s*příspěvková organizace$/i, '')}</h2>
      </div>
      <button type="button" class="x" bind:this={closeBtn} onclick={onclose} aria-label="Zavřít detail školy">✕</button>
    </header>

    <div class="tiles">
      <div class="tile">
        <span class="v">{km !== null ? `${km.toFixed(1).replace('.', ',')} km` : '—'}</span>
        <span class="l">{km !== null ? 'od domova vzdušnou čarou' : 'vyberte obec, kde bydlíte'}</span>
      </div>
      <div class="tile">
        <span class="v">{mist2026}</span>
        <span class="l">míst v 1. ročníku 2026/27</span>
      </div>
      <div class="tile">
        <span class="v">{celkem === null ? '—' : `${Math.round(celkem * 100)} %`}</span>
        <span class="l">loni obsazeno</span>
      </div>
      <div class="tile">
        <span class="v">{s.zastavky500m}</span>
        <span class="l">zastávek do 500 m</span>
      </div>
    </div>

    <p class="bus">{vetaDoprava(s)}</p>
    {#if web}
      <a class="btn-secondary web" href={web} target="_blank" rel="noopener noreferrer">Otevřít web školy</a>
    {/if}

    <h3>Obory, do kterých se přijímá na školní rok 2026/27</h3>
    <ul>
      {#each otevirane as o (o.kodOboru + o.forma)}
        {@const veta = vetaTrend(o)}
        <li>
          <div class="obor-head">
            <strong>{o.nazevOboru}</strong>
            <span class="mist">{o.zamer[2026]} míst</span>
          </div>
          <p class="meta">{TYP_LABEL[o.typ]} · {o.delka} · {o.forma} · kód {o.kodOboru}</p>
          <Naplnenost podil={naplnenost(o)} prijato={o.prijato2025} zamer={o.zamer[2025] ?? null} />
          <p>{vetaNaplnenost(o)}</p>
          {#if veta}<p class="meta">{veta}</p>{/if}
          {#if onporovnat}
            {@const k = klicOboru(o)}
            <button type="button" class="btn-secondary cmp" aria-pressed={porovnani.includes(k)} onclick={() => onporovnat(k)}
              >{porovnani.includes(k) ? '✓ Ve srovnání – odebrat' : '+ Porovnat s jiným oborem'}</button
            >
          {/if}
          {#if onplan}
            {@const id = planId(o)}
            {@const v = plan.includes(id)}
            <button
              type="button"
              class="plan"
              class:plan--on={v}
              disabled={!v && plan.length >= PLAN_MAX}
              aria-pressed={v}
              onclick={() => onplan(id)}
              data-testid="plan-toggle"
            >
              {v ? `✓ V plánu přihlášek (${plan.indexOf(id) + 1}. místo) – odebrat` : plan.length >= PLAN_MAX ? `Plán je plný (${PLAN_MAX} přihlášky)` : '+ Přidat do plánu přihlášek'}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
    {#if zavrene.length}
      <p class="meta">Pro 2026/27 nepřijímají: {zavrene.map((o) => o.nazevOboru).join(', ')}.</p>
    {/if}
    <p class="src">
      Zdroj: Karlovarský kraj, DATAZÁPAD – záměry počtu přijímaných uchazečů SŠ 2024/25–2026/27
      ({sources[0]?.license ?? 'CC0 1.0'}).
    </p>
  </div>
{/if}

<style>
  .cmp {
    margin-top: 6px;
    min-height: 36px;
    font-size: 0.9rem;
  }
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
    background: var(--c-surface);
    z-index: 21;
    overflow-y: auto;
    padding: 20px 22px 32px;
    box-sizing: border-box;
    box-shadow: -8px 0 24px rgba(15, 23, 42, 0.15);
    color: var(--c-text);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .kicker {
    margin: 0;
    color: var(--c-muted);
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
    width: 36px;
    height: 36px;
    border-radius: 4px;
    min-width: 44px;
    min-height: 44px;
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
  }
  .tile .v {
    font-size: 1.35rem;
    font-weight: 800;
  }
  .tile .l {
    font-size: 0.8rem;
    color: var(--c-muted);
  }
  .bus {
    margin: 6px 0;
  }
  .web {
    margin: 8px 0 4px;
    text-decoration: none;
  }
  .web:visited {
    color: var(--brand);
  }
  h3 {
    margin: 18px 0 8px;
    font-size: 1rem;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  li {
    border: 1px solid var(--c-border);
    border-radius: 10px;
    padding: 12px;
  }
  .obor-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .mist {
    flex: none;
    font-weight: 700;
    color: var(--c-accent);
  }
  li p {
    margin: 6px 0 0;
    font-size: 0.9rem;
  }
  .meta,
  .src {
    color: var(--c-muted);
    font-size: 0.82rem;
  }
  .src {
    margin-top: 18px;
  }
  .plan {
    font: inherit;
    font-size: 0.9rem;
    margin-top: 10px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 4px;
    border: 1px solid var(--brand);
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  .plan:hover:not(:disabled) {
    background: var(--brand-ice);
  }
  .plan--on {
    background: var(--brand);
    color: #fff;
  }
  .plan--on:hover:not(:disabled) {
    background: var(--brand-dark);
  }
  .plan:disabled {
    border-color: var(--line-strong);
    color: var(--text-muted);
    cursor: not-allowed;
  }
</style>
