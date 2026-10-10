<script lang="ts">
  /**
   * Hlavní menu: pět skupin s rozbalovacími panely (na počítači), na mobilu (≤ 900 px)
   * jedno tlačítko „Menu“ a pod lištou panel se všemi skupinami a položkami.
   * Panel se otevře klikem, zavře se Esc (fokus zpět na tlačítko skupiny), klikem mimo
   * nebo výběrem položky. Šipky ↓/↑ procházejí položky otevřeného panelu.
   */
  import { tick } from 'svelte';
  import Ikona from '../vylety/Ikona.svelte';
  import { MENU, skupinaRezimu, type SkupinaId } from '../../lib/menu.ts';
  import { KATEGORIE } from '../../lib/vylety.ts';
  import type { Mode } from '../../lib/state.ts';
  import type { KategorieId } from '../../lib/types.ts';

  interface Props {
    mode: Mode;
    /** aktuální kategorie „Kam vyrazit“ (zvýraznění v panelu Volný čas) */
    kat?: KategorieId | null;
    onmode: (m: Mode) => void;
    onkat: (k: KategorieId) => void;
    onzdroje: () => void;
    /** Sdílet a Průvodce – na úzkém mobilu jsou v panelu menu místo v liště */
    onshare: () => void;
    ontour: () => void;
  }
  const { mode, kat = null, onmode, onkat, onzdroje, onshare, ontour }: Props = $props();

  /** otevřený panel skupiny (počítač) */
  let otevrena = $state<SkupinaId | null>(null);
  /** otevřené mobilní menu */
  let mobil = $state(false);
  let root = $state<HTMLElement | null>(null);
  const aktivni = $derived(skupinaRezimu(mode));

  /** Otevře panel skupiny (průvodce, klávesnice); na mobilu otevře celé menu. */
  export function otevri(id: SkupinaId) {
    otevrena = id;
    mobil = true;
  }
  /** Zavře panel i mobilní menu; vrací true, když bylo co zavírat. */
  export function zavri(fokus = false): boolean {
    const bylo = otevrena;
    const byloMobil = mobil;
    otevrena = null;
    mobil = false;
    if (fokus && (bylo || byloMobil)) fokusZpet(bylo);
    return !!bylo || byloMobil;
  }

  const viditelny = (el: HTMLElement | null | undefined): el is HTMLElement =>
    !!el && (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true);
  /** fokus na tlačítko skupiny (počítač), jinak na tlačítko Menu (mobil) */
  function fokusZpet(id: SkupinaId | null) {
    const btn = id ? root?.querySelector<HTMLElement>(`[data-testid="menu-${id}"]`) : null;
    if (viditelny(btn)) btn.focus();
    else root?.querySelector<HTMLElement>('[data-testid="menu-toggle"]')?.focus();
  }

  function prepni(id: SkupinaId) {
    otevrena = otevrena === id ? null : id;
  }
  /**
   * Výběr položky: panel se zavře (položka s fokusem zmizí), proto fokus přesuneme –
   * po přechodu na jinou stránku na její nadpis h1, u akcí (Zdroje dat, Sdílet…) zpět
   * na tlačítko skupiny / Menu, ať se tam dialog po zavření vrátí.
   */
  async function vyber(fn: () => void, id: SkupinaId | null, cil: 'obsah' | 'zpet' = 'obsah') {
    otevrena = null;
    mobil = false;
    if (cil === 'zpet') {
      fokusZpet(id);
      fn();
      return;
    }
    fn();
    await tick();
    const h = document.querySelector<HTMLElement>('h1');
    if (h) {
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }

  function polozky(id: SkupinaId): HTMLElement[] {
    return [...(root?.querySelectorAll<HTMLElement>(`#menu-${id} button`) ?? [])];
  }
  function onKeyTlacitko(e: KeyboardEvent, id: SkupinaId) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      otevrena = id;
      requestAnimationFrame(() => polozky(id)[0]?.focus());
    }
  }
  function onKeyPanel(e: KeyboardEvent, id: SkupinaId) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = polozky(id);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[n]?.focus();
  }

  // klik (stisk) mimo menu panel zavře; pointerdown, ať se panel otevřený průvodcem
  // nezavře hned klikem na „Další“ (průvodce ho otevírá až v reakci na click)
  function onPointerDown(e: PointerEvent) {
    if (!otevrena && !mobil) return;
    if (root && e.target instanceof Node && root.contains(e.target)) return;
    if (e.target instanceof Element && e.target.closest('[data-testid="pruvodce"]')) return;
    otevrena = null;
    mobil = false;
  }
</script>

<svelte:document onpointerdown={onPointerDown} />

<div class="menu" bind:this={root}>
  <button
    type="button"
    class="toggle"
    aria-expanded={mobil}
    aria-controls="hlavni-menu"
    onclick={() => (mobil = !mobil)}
    data-testid="menu-toggle"
    data-tour="menu-toggle"
  >
    <Ikona d={mobil ? 'M6 6l12 12M18 6L6 18' : 'M4 6h16M4 12h16M4 18h16'} size={20} />
    <span>Menu</span>
  </button>

  <nav id="hlavni-menu" class="nav" class:nav--open={mobil} aria-label="Hlavní navigace" data-tour="nav" data-testid="hlavni-menu">
    <div class="mtools">
      <button type="button" onclick={() => vyber(onshare, null, 'zpet')} data-testid="menu-share">
        <Ikona d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" size={18} />
        <span>Sdílet odkaz</span>
      </button>
      <button type="button" onclick={() => vyber(ontour, null, 'zpet')} data-testid="menu-tour">
        <Ikona d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" size={18} />
        <span>Průvodce aplikací</span>
      </button>
    </div>
    <ul class="groups">
      {#each MENU as g (g.id)}
        <li class="grp grp--{g.id}" class:grp--open={otevrena === g.id}>
          <button
            type="button"
            class="grp__btn"
            class:on={aktivni === g.id}
            aria-expanded={otevrena === g.id}
            aria-controls="menu-{g.id}"
            onclick={() => prepni(g.id)}
            onkeydown={(e) => onKeyTlacitko(e, g.id)}
            data-testid="menu-{g.id}"
          >
            <span>{g.label}</span>
            <Ikona d="M6 9l6 6 6-6" size={16} />
          </button>
          <p class="grp__h">
            <Ikona d={g.ikona} size={20} />
            {g.label}
          </p>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="dd"
            class:dd--wide={g.kategorie}
            id="menu-{g.id}"
            data-tour="dd-{g.id}"
            onkeydown={(e) => onKeyPanel(e, g.id)}
          >
            <ul class="items">
              {#each g.polozky as p (p.label)}
                <li>
                  {#if p.mode}
                    {@const m = p.mode}
                    <button
                      type="button"
                      class="item"
                      class:on={mode === m}
                      aria-current={mode === m ? 'page' : undefined}
                      onclick={() => vyber(() => onmode(m), g.id)}
                      data-testid="mode-{m}"
                    >
                      <span class="item__t">{p.label}</span>
                      <span class="item__p">{p.popis}</span>
                    </button>
                  {:else}
                    <button type="button" class="item" onclick={() => vyber(onzdroje, g.id, 'zpet')} data-testid="sources-btn">
                      <span class="item__t">{p.label}</span>
                      <span class="item__p">{p.popis}</span>
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
            {#if g.kategorie}
              <p class="dd__h" id="menu-kat-h">Kategorie</p>
              <ul class="kat" aria-labelledby="menu-kat-h">
                {#each KATEGORIE as k (k.id)}
                  <li>
                    <button
                      type="button"
                      class:on={mode === 'vylety' && kat === k.id}
                      aria-current={mode === 'vylety' && kat === k.id ? 'page' : undefined}
                      onclick={() => vyber(() => onkat(k.id), g.id)}
                      data-testid="menu-kat-{k.id}"
                    >
                      <Ikona d={k.ikona} size={18} color={k.barva} />
                      <span>{k.label}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </nav>
</div>

<style>
  /* tlačítko i navigace jsou přímo položkami lišty (flex v App.svelte) */
  .menu {
    display: contents;
  }
  .toggle {
    display: none;
  }
  .groups {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .grp {
    position: relative;
  }
  .grp__btn {
    font: inherit;
    font-size: 0.97rem;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    padding: 0 10px;
    white-space: nowrap;
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--brand-dark);
    cursor: pointer;
  }
  .grp__btn :global(svg) {
    transition: transform 0.15s ease;
  }
  .grp--open .grp__btn :global(svg) {
    transform: rotate(180deg);
  }
  .grp__btn:hover,
  .grp--open .grp__btn {
    color: var(--brand);
  }
  .grp__btn.on {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }
  .grp__h,
  .mtools {
    display: none;
  }
  /* rozbalovací panel */
  .dd {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 40;
    width: 330px;
    padding: 8px;
    box-sizing: border-box;
    background: var(--bg-panel);
    border: 1px solid var(--line);
    border-top: 3px solid var(--brand);
    border-radius: var(--radius-lg);
    box-shadow: 0 12px 32px rgba(12, 24, 56, 0.16);
  }
  .grp--open .dd {
    display: block;
  }
  .dd--wide {
    width: 540px;
  }
  /* poslední skupiny zarovnat doprava, ať panel nepřeteče okno */
  .grp--prace .dd,
  .grp--data .dd {
    left: auto;
    right: 0;
  }
  .items,
  .kat {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .item {
    font: inherit;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    min-height: 44px;
    padding: 8px 12px;
    border: 0;
    border-left: 3px solid transparent;
    border-radius: var(--radius);
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .item:hover {
    background: var(--brand-ice);
  }
  .item.on {
    border-left-color: var(--brand);
    background: var(--brand-ice);
  }
  .item__t {
    font-weight: 500;
    color: var(--brand);
  }
  .item__p {
    font-size: 0.86rem;
    line-height: 1.35;
    color: var(--text-muted);
  }
  .dd__h {
    margin: 8px 12px 4px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .kat {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 4px;
  }
  .kat button {
    font: inherit;
    font-size: 0.92rem;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--brand-dark);
    text-align: left;
    cursor: pointer;
  }
  .kat button:hover,
  .kat button.on {
    background: var(--brand-ice);
  }
  .kat button.on {
    font-weight: 500;
  }
  .mtools button:focus-visible,
  .grp__btn:focus-visible,
  .item:focus-visible,
  .kat button:focus-visible,
  .toggle:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (prefers-reduced-motion: reduce) {
    .grp__btn :global(svg) {
      transition: none;
    }
  }

  /* užší počítač: skupiny na vlastním řádku pod logem */
  @media (min-width: 901px) and (max-width: 1100px) {
    .nav {
      order: 4;
      width: 100%;
    }
  }
  /* mobil a tablet na výšku: tlačítko Menu a panel přes celou šířku pod lištou */
  @media (max-width: 900px) {
    .toggle {
      order: 3;
      font: inherit;
      font-size: 0.9rem;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding: 0 14px;
      border: 1px solid var(--brand);
      border-radius: 999px;
      background: var(--brand);
      color: #fff;
      cursor: pointer;
    }
    .nav {
      display: none;
      order: 5;
      width: 100%;
      padding: 4px 0 12px;
      border-top: 1px solid var(--line);
    }
    .nav--open {
      display: block;
    }
    .groups {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 16px;
    }
    .grp--volny-cas {
      grid-column: 1 / -1;
    }
    .grp__btn {
      display: none;
    }
    .grp__h {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0 2px;
      font-size: 0.82rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--brand);
    }
    .dd,
    .dd--wide {
      display: block;
      position: static;
      width: auto;
      padding: 0;
      border: 0;
      box-shadow: none;
      background: none;
    }
    .item {
      padding: 6px 8px;
    }
    .dd__h {
      margin: 6px 8px 2px;
    }
    .kat {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .kat button {
      padding: 0 8px;
    }
  }
  /* úzký mobil: Sdílet a Průvodce jsou nahoře v panelu (lišta = logo + Menu) */
  @media (max-width: 560px) {
    .mtools {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      padding: 12px 0 4px;
    }
    .mtools button {
      font: inherit;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 44px;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      background: #fff;
      color: var(--brand);
      cursor: pointer;
    }
  }
  @media (max-width: 600px) {
    .groups {
      grid-template-columns: minmax(0, 1fr);
    }
    .kat {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 360px) {
    .kat {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
