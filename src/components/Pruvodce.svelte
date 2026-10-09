<script lang="ts" module>
  export interface KrokPruvodce {
    /** selektor `[data-tour="…"]`; bez cíle = karta uprostřed obrazovky */
    cil?: string;
    nadpis: string;
    text: string;
    /** připraví stránku (přepne režim, otevře kategorii…) před zobrazením kroku */
    pred?: () => void;
  }
</script>

<script lang="ts">
  /**
   * Průvodce pro nové uživatele: krok po kroku zvýrazní část stránky a vysvětlí ji.
   * Ovládání: Další / Zpět / Přeskočit, klávesy → ← a Esc. Fokus drží v kartě.
   * Bez animací při prefers-reduced-motion.
   */
  import { tick } from 'svelte';

  interface Props {
    kroky: KrokPruvodce[];
    onclose: () => void;
  }
  const { kroky, onclose }: Props = $props();

  let i = $state(0);
  let rect = $state<{ top: number; left: number; width: number; height: number } | null>(null);
  let karta = $state<HTMLElement | null>(null);
  let pos = $state<{ top: number; left: number; mode: 'float' | 'center' | 'sheet' }>({ top: 0, left: 0, mode: 'center' });

  const krok = $derived(kroky[i]);
  const posledni = $derived(i === kroky.length - 1);

  function cilEl(): HTMLElement | null {
    return krok?.cil ? document.querySelector<HTMLElement>(`[data-tour="${krok.cil}"]`) : null;
  }

  function umisti() {
    const el = cilEl();
    const mobil = window.innerWidth < 640;
    if (!el) {
      rect = null;
      pos = { top: 0, left: 0, mode: 'center' };
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 6;
    rect = { top: r.top - pad, left: r.left - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
    if (mobil) {
      pos = { top: 0, left: 0, mode: 'sheet' };
      return;
    }
    const kw = karta?.offsetWidth ?? 360;
    const kh = karta?.offsetHeight ?? 200;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    let top = r.bottom + 14;
    if (top + kh > vh - 12) top = r.top - kh - 14;
    if (top < 12) top = Math.max(12, Math.min(vh - kh - 12, r.top + 12));
    const left = Math.max(12, Math.min(vw - kw - 12, r.left));
    pos = { top, left, mode: 'float' };
  }

  async function ukaz(n: number) {
    i = n;
    kroky[n]?.pred?.();
    await tick();
    await new Promise((res) => requestAnimationFrame(() => res(null)));
    const el = cilEl();
    if (el) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      await new Promise((res) => setTimeout(res, reduce ? 0 : 350));
    }
    umisti();
    karta?.querySelector<HTMLButtonElement>('.pri')?.focus();
  }

  $effect(() => {
    void ukaz(0);
    const on = () => umisti();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
    };
  });

  function dalsi() {
    if (posledni) onclose();
    else void ukaz(i + 1);
  }
  function zpet() {
    if (i > 0) void ukaz(i - 1);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === 'ArrowRight') dalsi();
    else if (e.key === 'ArrowLeft') zpet();
    else if (e.key === 'Tab' && karta) {
      // fokus zůstává v kartě
      const f = [...karta.querySelectorAll<HTMLElement>('button')];
      const idx = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && idx <= 0) {
        e.preventDefault();
        f[f.length - 1]?.focus();
      } else if (!e.shiftKey && idx === f.length - 1) {
        e.preventDefault();
        f[0]?.focus();
      }
    }
  }
</script>

<div class="tour" data-testid="pruvodce">
  {#if rect}
    <div
      class="spot"
      style="top:{rect.top}px; left:{rect.left}px; width:{rect.width}px; height:{rect.height}px"
      aria-hidden="true"
    ></div>
  {:else}
    <div class="dim" aria-hidden="true"></div>
  {/if}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={karta}
    class="card card--{pos.mode}"
    style={pos.mode === 'float' ? `top:${pos.top}px; left:${pos.left}px` : ''}
    role="dialog"
    aria-modal="true"
    aria-labelledby="tour-h"
    aria-describedby="tour-t"
    tabindex="-1"
    onkeydown={onKey}
  >
    <p class="step">Krok {i + 1} z {kroky.length}</p>
    <h2 id="tour-h">{krok.nadpis}</h2>
    <p id="tour-t" class="txt">{krok.text}</p>
    <div class="dots" aria-hidden="true">
      {#each kroky as _, n (n)}<span class:on={n === i}></span>{/each}
    </div>
    <div class="btns">
      <button type="button" class="skip" onclick={onclose}>{posledni ? 'Zavřít' : 'Přeskočit'}</button>
      <span class="sp"></span>
      {#if i > 0}<button type="button" class="sec" onclick={zpet}>Zpět</button>{/if}
      <button type="button" class="pri" onclick={dalsi} data-testid="pruvodce-dalsi">{posledni ? 'Začít používat' : i === 0 ? 'Ukázat, jak to funguje' : 'Další'}</button>
    </div>
  </div>
</div>

<style>
  .tour {
    position: fixed;
    inset: 0;
    z-index: 50;
  }
  .dim {
    position: fixed;
    inset: 0;
    background: rgba(12, 24, 56, 0.55);
  }
  .spot {
    position: fixed;
    border-radius: 10px;
    box-shadow:
      0 0 0 4px var(--accent),
      0 0 0 9999px rgba(12, 24, 56, 0.55);
    transition: all 0.25s ease;
    pointer-events: none;
  }
  .card {
    position: fixed;
    width: min(380px, calc(100vw - 24px));
    background: #fff;
    border-radius: 10px;
    padding: 18px 20px 16px;
    box-shadow: 0 12px 40px rgba(12, 24, 56, 0.3);
    color: var(--brand-dark);
    box-sizing: border-box;
  }
  .card--center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(480px, calc(100vw - 32px));
  }
  .card--sheet {
    left: 8px;
    right: 8px;
    bottom: 8px;
    width: auto;
  }
  .card:focus {
    outline: none;
  }
  .step {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--brand);
  }
  h2 {
    margin: 4px 0 6px;
    font-size: 1.3rem;
    line-height: 1.25;
  }
  .txt {
    margin: 0 0 12px;
    color: var(--text);
    line-height: 1.55;
  }
  .dots {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }
  .dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--line-strong);
  }
  .dots span.on {
    background: var(--brand);
    width: 22px;
    border-radius: 4px;
  }
  .btns {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sp {
    flex: 1;
  }
  button {
    font: inherit;
    font-weight: 500;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 4px;
    cursor: pointer;
  }
  .pri {
    background: var(--brand);
    color: #fff;
    border: 1px solid var(--brand);
  }
  .pri:hover {
    background: var(--brand-hover);
  }
  .sec {
    background: #fff;
    color: var(--brand);
    border: 1px solid var(--brand);
  }
  .skip {
    background: none;
    border: 0;
    color: var(--text-muted);
    text-decoration: underline;
    padding: 0 6px;
  }
  button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (prefers-reduced-motion: reduce) {
    .spot {
      transition: none;
    }
  }
</style>
