<script lang="ts" module>
  import type { Mode } from '../lib/state.ts';

  export interface ProfilCislo {
    label: string;
    hodnota: string;
    pozn?: string;
  }
  export interface ProfilRadek {
    nazev: string;
    meta: string;
    vpravo?: string;
    /** klik → přechod do režimu (s předvyplněnou obcí) */
    akce?: () => void;
  }
  export interface ProfilSekce {
    id: string;
    nadpis: string;
    shrnuti: string;
    radky: ProfilRadek[];
    tlacitko: { text: string; mode: Mode };
  }
  export interface Profil {
    kod: string;
    nazev: string;
    orp: string;
    cisla: ProfilCislo[];
    skore: { hodnota: number; poradi: number; z: number; silne: string[] } | null;
    sekce: ProfilSekce[];
  }
</script>

<script lang="ts">
  /** Profil „Moje obec“: vše o jedné obci na jednom místě (školy, úřady, výlety, bydlení, čísla). */
  import type { AreaCode } from '../lib/types.ts';

  interface Props {
    profil: Profil | null;
    obce: Record<AreaCode, string>;
    onobec: (code: AreaCode | null) => void;
    onmode: (m: Mode) => void;
  }
  const { profil, obce, onobec, onmode }: Props = $props();
  const serazene = $derived(Object.entries(obce).sort((a, b) => a[1].localeCompare(b[1], 'cs')));
</script>

<section class="hero">
  <div class="wrap">
    <p class="kicker">Moje obec · profil z otevřených dat</p>
    <h1>{profil ? profil.nazev : 'Profil obce'}</h1>
    {#if profil}
      <p class="perex">
        {profil.orp && profil.orp !== profil.nazev ? `Obec v ORP ${profil.orp}. ` : profil.orp ? 'Obec s rozšířenou působností. ' : ''}Všechno
        podstatné na jednom místě – školy, úřady, výlety, bydlení i čísla o obyvatelích.
      </p>
    {:else}
      <p class="perex">Vyberte obec a ukážeme vše podstatné na jednom místě.</p>
    {/if}
    <label class="pick">
      <span>Obec</span>
      <select value={profil?.kod ?? ''} onchange={(e) => onobec(e.currentTarget.value || null)} data-testid="profil-obec">
        <option value="">Vyberte obec</option>
        {#each serazene as [code, name] (code)}
          <option value={code}>{name}</option>
        {/each}
      </select>
    </label>
    {#if profil}
      <div class="kpis" data-testid="profil-cisla">
        {#each profil.cisla as c (c.label)}
          <div class="kpi">
            <span class="kpi__v">{c.hodnota}</span>
            <span class="kpi__l">{c.label}{#if c.pozn}<em>&nbsp;· {c.pozn}</em>{/if}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

{#if profil}
  <main class="wrap main">
    {#if profil.skore}
      <section class="skore" aria-label="Skóre bydlení">
        <div class="skore__v"><strong>{Math.round(profil.skore.hodnota)}</strong><span>ze 100</span></div>
        <div>
          <h2>Jak se tu žije</h2>
          <p>
            {profil.skore.poradi}. místo z {profil.skore.z} obcí kraje podle výchozích požadavků (zastávka, lékař, základní
            škola, nezaměstnanost).
            {#if profil.skore.silne.length}Silné stránky: {profil.skore.silne.join(', ')}.{/if}
          </p>
          <button type="button" class="btn-secondary" onclick={() => onmode('score')}>Porovnat s jinými obcemi</button>
        </div>
      </section>
    {/if}
    <div class="grid" data-testid="profil-sekce">
      {#each profil.sekce as s (s.id)}
        <section class="card" aria-labelledby="ps-{s.id}">
          <h2 id="ps-{s.id}">{s.nadpis}</h2>
          <p class="shrnuti">{s.shrnuti}</p>
          {#if s.radky.length}
            <ul>
              {#each s.radky as r (r.nazev + r.meta)}
                <li>
                  <div>
                    <strong>{r.nazev}</strong>
                    <span>{r.meta}</span>
                  </div>
                  {#if r.vpravo}<span class="r">{r.vpravo}</span>{/if}
                </li>
              {/each}
            </ul>
          {/if}
          <button type="button" class="btn-secondary more" onclick={() => onmode(s.tlacitko.mode)}>{s.tlacitko.text}</button>
        </section>
      {/each}
    </div>
  </main>
{/if}

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
    font-size: clamp(2rem, 5vw, 2.8rem);
    margin: 6px 0 8px;
    letter-spacing: -0.02em;
  }
  .perex {
    margin: 0 0 16px;
    max-width: 66ch;
    font-size: 1.1rem;
  }
  .pick {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 360px;
    margin-bottom: 18px;
  }
  .pick span {
    font-weight: 500;
    color: var(--brand-dark);
    font-size: 0.9rem;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }
  .kpi {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-left: 1px solid var(--line);
  }
  .kpi:first-child {
    border-left: 0;
  }
  .kpi__v {
    font-size: 1.7rem;
    font-weight: 700;
    color: var(--brand-dark);
    line-height: 1.15;
  }
  .kpi__l {
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .kpi__l em {
    font-style: normal;
  }
  .main {
    padding-top: 24px;
    padding-bottom: 48px;
  }
  .skore {
    display: flex;
    gap: 20px;
    align-items: center;
    background: #fff;
    border: 1px solid var(--line);
    border-left: 4px solid var(--data-4);
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 18px;
  }
  .skore__v {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: none;
    width: 88px;
  }
  .skore__v strong {
    font-size: 2.6rem;
    line-height: 1;
    color: var(--data-4);
  }
  .skore__v span {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .skore h2 {
    margin: 0 0 4px;
    font-size: 1.2rem;
  }
  .skore p {
    margin: 0 0 10px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .card {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .card h2 {
    margin: 0 0 4px;
    font-size: 1.2rem;
  }
  .shrnuti {
    margin: 0 0 10px;
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  li strong {
    display: block;
    font-weight: 500;
    color: var(--brand-dark);
  }
  li span {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .r {
    flex: none;
    font-weight: 700;
    color: var(--brand) !important;
    font-size: 0.9rem !important;
  }
  .more {
    margin-top: auto;
    align-self: flex-start;
  }
  @media (max-width: 1000px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .kpi {
      border-top: 1px solid var(--line);
    }
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 560px) {
    .wrap {
      padding: 0 16px;
    }
    .skore {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
