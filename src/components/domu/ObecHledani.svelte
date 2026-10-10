<script lang="ts">
  /**
   * Rychlé hledání obce (vzor ARIA combobox s listboxem): píše se název bez ohledu
   * na diakritiku, šipky ↓/↑ vybírají, Enter potvrdí, Esc zavře nabídku.
   */
  import Ikona from '../vylety/Ikona.svelte';
  import { hledejObce } from '../../lib/domu.ts';
  import type { AreaCode } from '../../lib/types.ts';

  interface Props {
    names: Record<AreaCode, string>;
    /** vybraná obec (z adresy nebo z výběru) */
    obec: AreaCode | null;
    onselect: (code: AreaCode) => void;
    /** smazat pole a zrušit vybranou obec */
    onclear: () => void;
  }
  const { names, obec, onselect, onclear }: Props = $props();
  let pole = $state<HTMLInputElement | null>(null);

  let q = $state('');
  let otevreno = $state(false);
  let aktivni = $state(-1);

  // vybraná obec zvenku (odkaz, průvodce) → název do pole
  $effect(() => {
    q = obec ? (names[obec] ?? '') : '';
  });

  const nalezy = $derived(hledejObce(names, q, 8));
  const ukazat = $derived(otevreno && q.trim().length > 0);

  // aktivní možnost (šipkami) vždy viditelná v posouvaném seznamu
  $effect(() => {
    if (!ukazat || aktivni < 0) return;
    const n = nalezy[aktivni];
    if (n) document.getElementById(`domu-obec-${n.code}`)?.scrollIntoView?.({ block: 'nearest' });
  });

  function smazat() {
    q = '';
    aktivni = -1;
    otevreno = false;
    onclear();
    pole?.focus();
  }

  function vyber(code: AreaCode) {
    q = names[code] ?? '';
    otevreno = false;
    aktivni = -1;
    onselect(code);
  }

  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    q = e.currentTarget.value;
    otevreno = true;
    aktivni = -1;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      otevreno = true;
      if (nalezy.length) aktivni = (aktivni + 1) % nalezy.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (nalezy.length) aktivni = aktivni <= 0 ? nalezy.length - 1 : aktivni - 1;
    } else if (e.key === 'Enter') {
      // Enter bez výběru šipkami vezme první nalezenou obec
      const n = nalezy[aktivni >= 0 ? aktivni : 0];
      if (ukazat && n) {
        e.preventDefault();
        vyber(n.code);
      }
    } else if (e.key === 'Escape' && ukazat) {
      e.stopPropagation();
      otevreno = false;
      aktivni = -1;
    }
  }
</script>

<div class="cb">
  <label for="domu-obec" class="cb__label">Rychlé hledání obce</label>
  <div class="cb__pole">
    <Ikona d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5" size={20} />
    <input
      id="domu-obec"
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      placeholder="Napište název obce, např. Sokolov"
      aria-autocomplete="list"
      aria-expanded={ukazat}
      aria-controls="domu-obce"
      aria-activedescendant={ukazat && aktivni >= 0 && nalezy[aktivni] ? `domu-obec-${nalezy[aktivni].code}` : undefined}
      aria-describedby="domu-obec-help"
      bind:this={pole}
      value={q}
      oninput={onInput}
      onkeydown={onKey}
      onfocus={() => (otevreno = true)}
      onblur={() => (otevreno = false)}
      data-testid="domu-hledat"
    />
    {#if q || obec}
      <button type="button" class="cb__smazat" onclick={smazat} aria-label="Smazat hledání a vybranou obec" data-testid="domu-smazat">
        <Ikona d="M6 6l12 12M18 6L6 18" size={18} />
      </button>
    {/if}
    <ul id="domu-obce" class="cb__list" role="listbox" aria-label="Nalezené obce" hidden={!ukazat} onmousedown={(e) => e.preventDefault()} data-testid="domu-nabidka">
      {#each nalezy as n, i (n.code)}
        <li
          id="domu-obec-{n.code}"
          role="option"
          aria-selected={i === aktivni}
          class:on={i === aktivni}
          onmousedown={(e) => {
            e.preventDefault();
            vyber(n.code);
          }}
          data-testid="domu-moznost-{n.code}"
        >
          {n.nazev}
        </li>
      {:else}
        <li class="cb__nic" role="option" aria-selected="false" aria-disabled="true">Žádná obec v kraji takový název nemá.</li>
      {/each}
    </ul>
  </div>
  <p id="domu-obec-help" class="cb__help">Všech 134 obcí kraje. Šipkami vyberete, Enter potvrdí.</p>
</div>

<style>
  .cb {
    position: relative;
  }
  .cb__label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: var(--brand-dark);
  }
  .cb__pole {
    position: relative;
    display: flex;
    align-items: center;
    color: var(--text-muted);
  }
  .cb__pole > :global(svg) {
    position: absolute;
    left: 12px;
    pointer-events: none;
  }
  input {
    font: inherit;
    font-size: 1.05rem;
    width: 100%;
    min-height: 52px;
    padding: 0 50px 0 42px;
    box-sizing: border-box;
    border: 1px solid #8a94a3;
    border-radius: 4px;
    background: #fff;
    color: var(--text);
  }
  .cb__smazat {
    position: absolute;
    right: 4px;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .cb__smazat:hover {
    color: var(--brand);
  }
  .cb__smazat:focus-visible,
  input:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .cb__list {
    position: absolute;
    z-index: 20;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    margin: 0;
    padding: 4px;
    list-style: none;
    max-height: 320px;
    overflow-y: auto;
    background: #fff;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    box-shadow: 0 12px 32px rgba(12, 24, 56, 0.16);
  }
  .cb__list[hidden] {
    display: none;
  }
  li {
    min-height: 44px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--brand-dark);
  }
  li:hover,
  li.on {
    background: var(--brand-ice);
    color: var(--brand);
  }
  li.on {
    box-shadow: inset 3px 0 0 var(--brand);
  }
  .cb__nic {
    cursor: default;
    color: var(--text-muted);
  }
  .cb__help {
    margin: 6px 0 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
</style>
