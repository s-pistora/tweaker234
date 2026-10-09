<script lang="ts">
  /**
   * Detail obce v režimu „Kde by se mi dobře žilo?“: skóre, pořadí v kraji a věta
   * ke každému zvolenému požadavku s percentilem. Na desktopu panel vedle mapy,
   * na mobilu vysouvací panel zespodu (dialog, fokus zůstává uvnitř). Esc zavírá
   * globálně App.
   *
   * Fokus: do detailu se přesune jen tehdy, když ho uživatel otevřel (`fokus`), nebo
   * na mobilu, kde detail překryje stránku – otevření z odkazu fokus nekrade. Po
   * zavření se fokus vrátí na prvek, odkud byl detail otevřen.
   */
  import { onMount, untrack } from 'svelte';
  import type { AreaCode } from '../../lib/types.ts';
  import {
    POZADAVKY_BY_ID,
    srovnani,
    textSrovnani,
    vetaPozadavku,
    type BodZivota,
    type ZivotKontext,
    type ZivotSkore,
  } from '../../lib/zivot.ts';
  import { chybejiciVObci, mapyCzOdkaz } from '../../lib/zivot-mapa.ts';
  import { fmtKm } from '../../lib/vylety.ts';

  interface Props {
    ctx: ZivotKontext;
    code: AreaCode;
    name: string;
    orpName: string;
    skore: ZivotSkore | undefined;
    rank: number | null;
    /** počet obcí v pořadí (obce se skóre) */
    celkem: number;
    /** počet všech obcí kraje (do vysvětlení) */
    vsech: number;
    /** přesunout fokus do detailu (uživatel ho právě otevřel) */
    fokus?: boolean;
    /** id vybraných požadavků (pro „v obci není, nejbližší je…“) */
    pozadavky?: readonly string[];
    /** bod vybraný klikem na mapě */
    vybranyBod?: { bod: BodZivota; vrstva: string; km: number } | null;
    /** přepnout detail (a mapu) na jinou obec */
    onobec?: (code: AreaCode) => void;
    onclose: () => void;
  }
  const {
    ctx,
    code,
    name,
    orpName,
    skore,
    rank,
    celkem,
    vsech,
    fokus = false,
    pozadavky = [],
    vybranyBod = null,
    onobec,
    onclose,
  }: Props = $props();

  /** konec věty bez zdvojené tečky („s.r.o.“ + „.“) */
  const bezTecky = (t: string) => t.replace(/.+$/, '');
  const chybi = $derived(skore?.neobydlena ? [] : chybejiciVObci(ctx, pozadavky, code));

  const casti = $derived(
    [...(skore?.parts ?? [])]
      .sort((a, b) => b.weight - a.weight || b.percentile - a.percentile)
      .map((p) => {
        const sr = srovnani(ctx, p.id, code);
        return {
          ...p,
          label: POZADAVKY_BY_ID[p.id]?.label ?? p.id,
          veta: vetaPozadavku(ctx, p.id, code, p.value),
          pct: Math.round(p.percentile),
          srovnani: sr ? textSrovnani(sr) : '',
        };
      }),
  );
  const vynechane = $derived((skore?.skipped ?? []).map((id) => POZADAVKY_BY_ID[id]?.label ?? id));
  const s = $derived(skore?.score ?? null);

  /** ≤1000 px: detail je vysouvací dialog přes stránku */
  let mobil = $state(false);
  let el = $state<HTMLElement | null>(null);
  let closeBtn = $state<HTMLButtonElement | null>(null);

  onMount(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let mq: MediaQueryList | null = null;
    const sync = () => (mobil = !!mq?.matches);
    try {
      mq = window.matchMedia?.('(max-width: 1000px)') ?? null;
      sync();
      mq?.addEventListener?.('change', sync);
    } catch {
      /* testovací prostředí */
    }
    return () => {
      mq?.removeEventListener?.('change', sync);
      // vrátit fokus tam, odkud byl detail otevřen (pokud tam ještě je)
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
  });

  $effect(() => {
    void code;
    if (closeBtn && untrack(() => fokus || mobil)) closeBtn.focus({ preventScroll: true });
  });

  /** jednoduché držení fokusu uvnitř dialogu na mobilu (Tab / Shift+Tab dokola) */
  function onKeydown(e: KeyboardEvent) {
    if (!mobil || e.key !== 'Tab' || !el) return;
    const f = [...el.querySelectorAll<HTMLElement>('button, summary, a[href], [tabindex]:not([tabindex="-1"])')];
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
<section
  bind:this={el}
  class="detail"
  aria-labelledby="zd-h"
  role={mobil ? 'dialog' : undefined}
  aria-modal={mobil ? 'true' : undefined}
  onkeydown={onKeydown}
  data-testid="zivot-detail"
>
  <header>
    <div class="ttl">
      <p class="kicker">Obec{orpName ? ` · ORP ${orpName}` : ''}</p>
      <h2 id="zd-h">{name}</h2>
    </div>
    <button type="button" class="x" bind:this={closeBtn} onclick={onclose} aria-label="Zavřít detail obce">✕</button>
  </header>

  {#if s !== null}
    <div class="tiles">
      <div class="tile">
        <span class="v">{Math.round(s)}<small>/100</small></span>
        <span class="l">skóre podle vašeho výběru</span>
      </div>
      {#if rank !== null}
        <div class="tile">
          <span class="v">{rank}.<small>&nbsp;z {celkem}</small></span>
          <span class="l">místo v kraji</span>
        </div>
      {/if}
    </div>
  {:else if skore?.neobydlena}
    <p class="empty" data-testid="zivot-neobydlena">Obec nemá stálé obyvatele, nehodnotíme ji.</p>
  {:else}
    <p class="empty">Pro tuto obec nemáme k vybraným požadavkům žádné údaje, skóre proto nepočítáme.</p>
  {/if}

  {#if vybranyBod}
    {@const b = vybranyBod.bod}
    <div class="misto" data-testid="zivot-misto" aria-live="polite">
      <p class="misto__k">Vybrané místo · {POZADAVKY_BY_ID[vybranyBod.vrstva]?.label ?? ''}</p>
      <p class="misto__n">{b.nazev}</p>
      <p class="misto__a">
        {b.adresa ?? b.obecNazev}{#if b.adresa && b.obecNazev && !b.adresa.includes(b.obecNazev)}, {b.obecNazev}{/if}
        · {fmtKm(vybranyBod.km)} od středu obce {name}
      </p>
      <a href={mapyCzOdkaz(b)} target="_blank" rel="noopener noreferrer">Ukázat na Mapy.cz<span class="sr"> (otevře se v novém okně)</span></a>
    </div>
  {/if}

  {#if chybi.length}
    <h3>Co v obci není</h3>
    <ul class="chybi" data-testid="zivot-chybi">
      {#each chybi as c (c.id)}
        <li>
          <strong>{c.label}:</strong> v obci {name} není.
          {#if c.nejblizsi}
            Nejbližší je
            {#if c.nejblizsi.obec && c.nejblizsi.obec !== code && onobec}
              v obci <button type="button" class="obec" onclick={() => onobec?.(c.nejblizsi!.obec!)}>{c.nejblizsi.obecNazev}</button>
            {:else if c.nejblizsi.obecNazev}
              v obci {c.nejblizsi.obecNazev}
            {/if}
            ({fmtKm(c.nejblizsi.km)}): {bezTecky(`${c.nejblizsi.bod.nazev}${c.nejblizsi.bod.adresa ? `, ${c.nejblizsi.bod.adresa}` : ''}`)}.
          {:else}
            V datech kraje žádné není.
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if casti.length}
    <h3>Jak obec vychází</h3>
    <ul class="parts">
      {#each casti as c (c.id)}
        <li>
          <p class="pl">
            <strong>{c.label}</strong>
            {#if c.weight === 2}<span class="tag">velmi důležité</span>{/if}
          </p>
          <p class="veta">{c.veta}</p>
          <div class="pbar" role="img" aria-label="Percentil v kraji: {c.pct} ze 100">
            <span class="track"><span style="width: {c.pct}%"></span></span>
            <span class="pv">{c.srovnani}</span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if vynechane.length}
    <p class="skip" data-testid="zivot-skipped">
      <strong>Bez údaje, nezapočteno:</strong>
      {vynechane.join(', ')}.
    </p>
  {/if}

  <details class="how">
    <summary>Jak se to počítá</summary>
    <p>
      U každého požadavku seřadíme {celkem} obydlených obcí kraje (ze všech {vsech}) a pořadí převedeme na percentil 0–100 (100 = nejlepší). Obce se
      stejnou hodnotou dostanou stejný, průměrný percentil. Skóre je průměr percentilů. „Velmi důležité“ má dvojnásobnou
      váhu.
    </p>
    <p>Obce bez stálých obyvatel nehodnotíme.</p>
    <p>
      Chybí-li obci údaj, požadavek u ní vynecháme a průměr spočítáme ze zbylých. Vzdálenosti měříme vzdušnou čarou od
      středu obce.
    </p>
  </details>
</section>

<style>
  .backdrop {
    display: none;
  }
  .detail {
    background: var(--bg-panel);
    border: 1px solid var(--line);
    border-top: 4px solid var(--brand);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 16px 18px 18px;
    color: var(--brand-dark);
    min-width: 0;
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
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
    overflow-wrap: anywhere;
  }
  .x {
    font: inherit;
    font-size: 1.1rem;
    min-width: 44px;
    min-height: 44px;
    border-radius: 4px;
    border: 1px solid var(--line-strong);
    background: var(--bg-panel);
    color: var(--brand-dark);
    cursor: pointer;
    flex: none;
  }
  .x:focus-visible,
  summary:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 14px 0 6px;
  }
  .tile {
    background: var(--brand-ice);
    border-radius: var(--radius);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tile .v {
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .tile .v small {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-muted);
  }
  .tile .l {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .empty {
    margin: 12px 0;
    color: var(--text);
  }
  h3 {
    margin: 16px 0 8px;
    font-size: 1rem;
  }
  .parts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .parts li {
    border-bottom: 1px solid var(--line);
    padding-bottom: 10px;
  }
  .pl {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .tag {
    font-size: 0.75rem;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--brand-ice);
    color: var(--brand);
  }
  .veta {
    margin: 2px 0 6px;
    color: var(--text);
    line-height: 1.5;
  }
  .pbar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .track {
    flex: 1;
    max-width: 160px;
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
  }
  .track span {
    display: block;
    height: 100%;
    background: var(--data-2);
  }
  .skip {
    margin: 12px 0 0;
    font-size: 0.88rem;
    color: var(--text-muted);
  }
  .misto {
    margin: 12px 0 4px;
    padding: 10px 12px;
    border-left: 4px solid var(--accent);
    background: var(--brand-ice);
    border-radius: var(--radius);
  }
  .misto p {
    margin: 0;
  }
  .misto__k {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .misto__n {
    font-weight: 700;
    margin-top: 2px !important;
  }
  .misto__a {
    font-size: 0.9rem;
    color: var(--text);
    margin: 2px 0 6px !important;
  }
  .misto a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--brand);
    font-weight: 500;
  }
  .misto a:focus-visible,
  .obec:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .chybi {
    margin: 0;
    padding-left: 18px;
    color: var(--text);
    line-height: 1.5;
    font-size: 0.95rem;
  }
  .chybi li + li {
    margin-top: 6px;
  }
  .obec {
    font: inherit;
    color: var(--brand);
    font-weight: 500;
    text-decoration: underline;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    min-height: 24px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .how {
    margin-top: 14px;
    font-size: 0.9rem;
    color: var(--text);
  }
  summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 500;
    color: var(--brand);
    cursor: pointer;
  }
  .how p {
    margin: 4px 0 8px;
    line-height: 1.5;
  }
  /* mobil: vysouvací panel zespodu přes mapu */
  @media (max-width: 1000px) {
    .backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(12, 24, 56, 0.35);
      z-index: 20;
    }
    .detail {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      max-height: 82vh;
      overflow-y: auto;
      z-index: 21;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      box-shadow: 0 -8px 24px rgba(12, 24, 56, 0.18);
      animation: up 0.2s ease-out;
    }
  }
  @keyframes up {
    from {
      transform: translateY(30px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .detail {
      animation: none;
    }
  }
  @media (max-width: 560px) {
    .detail {
      padding: 14px 16px 18px;
    }
  }
</style>
