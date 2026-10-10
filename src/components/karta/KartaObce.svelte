<script lang="ts">
  /** Karta obce pro starostu: jedna stránka A4 s čísly a větami o obci, k tisku nebo do PDF. */
  import type { AreaCode } from '../../lib/types.ts';
  import { kartaDoRadku, type Karta } from '../../lib/karta.ts';
  import StahnoutData from '../common/StahnoutData.svelte';

  interface Props {
    karta: Karta | null;
    obce: Record<AreaCode, string>;
    /** datum dat (manifest.updatedAt) */
    aktualizace: string;
    onobec: (kod: AreaCode | null) => void;
  }
  const { karta, obce, aktualizace, onobec }: Props = $props();

  const serazene = $derived(Object.entries(obce).sort((a, b) => a[1].localeCompare(b[1], 'cs')));
  const datum = $derived(aktualizace ? new Date(aktualizace).toLocaleDateString('cs-CZ') : '');
  function tisk() {
    try {
      window.print();
    } catch {
      /* testovací prostředí */
    }
  }
</script>

<section class="hero">
  <div class="wrap">
    <p class="kicker">Pro starosty a zastupitele</p>
    <h1>{karta ? `Karta obce ${karta.nazev}` : 'Karta obce'}</h1>
    <p class="perex noprint">
      Všechno podstatné o obci na jedné stránce: lidé, služby, školy, peníze a úřady. Vytiskněte si ji na zasedání
      zastupitelstva nebo ji uložte jako PDF.
    </p>
    <form class="pick noprint" onsubmit={(e) => e.preventDefault()}>
      <label for="karta-obec">Obec</label>
      <select id="karta-obec" value={karta?.kod ?? ''} onchange={(e) => onobec(e.currentTarget.value || null)} data-testid="karta-obec">
        <option value="">Vyberte obec</option>
        {#each serazene as [code, name] (code)}
          <option value={code}>{name}</option>
        {/each}
      </select>
    </form>
  </div>
</section>

<main class="wrap main">
  {#if !karta}
    <p class="empty" data-testid="karta-prazdna">Vyberte obec a ukážeme její kartu.</p>
  {:else}
    <article class="karta" data-testid="karta">
      <p class="sub">ORP {karta.orp} · Karlovarský kraj · data ke dni {datum}</p>
      {#if karta.shrnuti.length}
        <ul class="shrnuti">
          {#each karta.shrnuti as s (s)}<li>{s}</li>{/each}
        </ul>
      {/if}
      <div class="grid">
        {#each karta.sekce as s (s.id)}
          <section class="sekce" data-testid="karta-sekce">
            <h2>{s.nadpis}</h2>
            <dl>
              {#each s.radky as r (r.co)}
                <div class="radek">
                  <dt>{r.co}{#if r.hodnota}<strong>{r.hodnota}</strong>{/if}</dt>
                  {#if r.veta}<dd>{r.veta}</dd>{/if}
                </div>
              {/each}
            </dl>
          </section>
        {/each}
      </div>
      <p class="src">
        Zdroj: otevřená data Karlovarského kraje (DATAZÁPAD), ČSÚ a další sady uvedené ve Zdrojích dat. Vzdálenosti jsou
        vzdušnou čarou od středu obce.
      </p>
    </article>
    <div class="actions noprint">
      <button type="button" class="btn-primary" onclick={tisk} data-testid="karta-tisk">Vytisknout / uložit jako PDF</button>
      <StahnoutData nazev={`karta-obce-${karta.nazev}`} radky={() => kartaDoRadku(karta)} />
    </div>
  {/if}
</main>

<style>
  .wrap {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
    box-sizing: border-box;
  }
  .hero {
    background: var(--brand-ice);
    border-bottom: 1px solid var(--line);
    padding: 32px 0 24px;
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
    font-size: clamp(1.8rem, 4.5vw, 2.4rem);
    margin: 6px 0 8px;
  }
  .perex {
    margin: 0 0 16px;
    max-width: 70ch;
    font-size: 1.05rem;
  }
  .pick {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 360px;
  }
  .pick label {
    font-weight: 500;
  }
  .pick select {
    font: inherit;
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: #fff;
  }
  .main {
    padding-top: 24px;
    padding-bottom: 48px;
  }
  .empty {
    background: var(--brand-ice);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .sub {
    margin: 0 0 10px;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .shrnuti {
    margin: 0 0 18px;
    padding: 14px 18px 14px 34px;
    background: #fff;
    border: 1px solid var(--line);
    border-left: 4px solid var(--brand);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .sekce {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 1.1rem;
  }
  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .radek {
    border-top: 1px solid var(--line);
    padding-top: 6px;
  }
  .radek:first-child {
    border-top: 0;
    padding-top: 0;
  }
  dt {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-weight: 500;
  }
  dt strong {
    color: var(--brand-dark);
    white-space: nowrap;
  }
  dd {
    margin: 2px 0 0;
    font-size: 0.88rem;
    color: var(--text-muted);
  }
  .src {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 14px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-top: 16px;
  }
  @media (max-width: 760px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .wrap {
      padding: 0 16px;
    }
  }
  @media print {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4mm;
    }
    .sekce,
    .shrnuti {
      border: 1px solid #999;
    }
    dd {
      color: #333;
    }
  }
</style>
