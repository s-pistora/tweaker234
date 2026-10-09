<script lang="ts">
  /**
   * Detail obce v režimu „Kde by se mi dobře žilo?“: skóre, pořadí v kraji a věta
   * ke každému zvolenému požadavku s percentilem. Na desktopu panel vedle mapy,
   * na mobilu vysouvací panel zespodu. Esc zavírá globálně App.
   */
  import type { AreaCode } from '../../lib/types.ts';
  import {
    POZADAVKY_BY_ID,
    vetaPozadavku,
    type ZivotKontext,
    type ZivotSkore,
  } from '../../lib/zivot.ts';

  interface Props {
    ctx: ZivotKontext;
    code: AreaCode;
    name: string;
    orpName: string;
    skore: ZivotSkore | undefined;
    rank: number | null;
    celkem: number;
    onclose: () => void;
  }
  const { ctx, code, name, orpName, skore, rank, celkem, onclose }: Props = $props();

  const casti = $derived(
    [...(skore?.parts ?? [])]
      .sort((a, b) => b.weight - a.weight || b.percentile - a.percentile)
      .map((p) => ({
        ...p,
        label: POZADAVKY_BY_ID[p.id]?.label ?? p.id,
        veta: vetaPozadavku(ctx, p.id, code, p.value),
        pct: Math.round(p.percentile),
      })),
  );
  const vynechane = $derived((skore?.skipped ?? []).map((id) => POZADAVKY_BY_ID[id]?.label ?? id));
  const s = $derived(skore?.score ?? null);

  let closeBtn = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    void code;
    closeBtn?.focus();
  });
</script>

<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
<section class="detail" aria-labelledby="zd-h" data-testid="zivot-detail">
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
  {:else}
    <p class="empty">Pro tuto obec nemáme k vybraným požadavkům žádné údaje, skóre proto nepočítáme.</p>
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
            <span class="pv">{c.pct >= 100 ? 'nejlépe v kraji' : c.pct <= 0 ? 'nejslabší v kraji' : `lépe než ${c.pct} % obcí`}</span>
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
      U každého požadavku porovnáme všech {celkem} obcí kraje. Percentil 80 znamená, že obec je na tom lépe než zhruba 80 %
      ostatních. Skóre je průměr percentilů. „Velmi důležité“ má dvojnásobnou váhu.
    </p>
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
