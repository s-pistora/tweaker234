<script lang="ts">
  /** Pole „Hledat“ v horní liště: najde školu, obor, místo k výletu, obec, úřad nebo kreativce. */
  import { hledej, type Cil, type Polozka, type vytvorIndex } from '../lib/hledani.ts';

  interface Props {
    index: ReturnType<typeof vytvorIndex>;
    onvyber: (cil: Cil) => void;
  }
  const { index, onvyber }: Props = $props();

  let q = $state('');
  let otevreno = $state(false);
  let aktivni = $state(0);
  let fokus = $state(false);
  let input: HTMLInputElement | null = null;

  const vysledky = $derived(hledej(index, q, 12));
  const ukazat = $derived(otevreno && q.trim().length >= 2);

  function vyber(p: Polozka) {
    onvyber(p.cil);
    q = '';
    otevreno = false;
    input?.blur();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      otevreno = true;
      aktivni = Math.min(aktivni + 1, vysledky.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      aktivni = Math.max(aktivni - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (vysledky[aktivni]) vyber(vysledky[aktivni]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (q) q = '';
      else input?.blur();
      otevreno = false;
    }
  }
</script>

<div class="hledani" class:rozbaleno={fokus || q !== ''} role="search">
  <label class="sr-only" for="hledani-q">Hledat v celé aplikaci</label>
  <svg class="lupa" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
    ><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg
  >
  <input
    bind:this={input}
    id="hledani-q"
    type="search"
    autocomplete="off"
    placeholder="Hledat školu, obec, místo…"
    role="combobox"
    aria-expanded={ukazat}
    aria-controls="hledani-vysledky"
    aria-autocomplete="list"
    aria-activedescendant={ukazat && vysledky.length ? `hledani-${aktivni}` : undefined}
    bind:value={q}
    oninput={() => {
      otevreno = true;
      aktivni = 0;
    }}
    onfocus={() => {
      otevreno = true;
      fokus = true;
    }}
    onblur={() => {
      fokus = false;
      setTimeout(() => (otevreno = false), 150);
    }}
    onkeydown={onKey}
    data-testid="hledani"
  />
  {#if ukazat}
    <ul class="vysledky" id="hledani-vysledky" role="listbox" aria-label="Výsledky hledání" data-testid="hledani-vysledky">
      {#each vysledky as p, i (p.typ + JSON.stringify(p.cil) + p.nazev)}
        <li
          id="hledani-{i}"
          role="option"
          aria-selected={i === aktivni}
          class:on={i === aktivni}
          onmousedown={(e) => {
            e.preventDefault();
            vyber(p);
          }}
          onmouseenter={() => (aktivni = i)}
        >
          <span class="typ">{p.typ}</span>
          <span class="nazev">{p.nazev}</span>
          {#if p.meta}<span class="meta">{p.meta}</span>{/if}
        </li>
      {:else}
        <li class="nic" role="option" aria-selected="false" aria-disabled="true">Nic jsme nenašli. Zkuste jiné slovo.</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .hledani {
    position: relative;
    display: flex;
    align-items: center;
  }
  .lupa {
    position: absolute;
    left: 12px;
    color: var(--text-muted);
    pointer-events: none;
  }
  input {
    font: inherit;
    width: 230px;
    min-height: 44px;
    padding: 0 12px 0 38px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--brand-ice);
    color: var(--text);
  }
  input:focus {
    background: #fff;
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .vysledky {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 50;
    width: min(440px, calc(100vw - 32px));
    max-height: min(70vh, 520px);
    overflow-y: auto;
    margin: 0;
    padding: 6px 0;
    list-style: none;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(12, 24, 56, 0.16);
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 8px 14px;
    cursor: pointer;
  }
  li.on {
    background: var(--brand-ice);
  }
  .typ {
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--brand);
  }
  .nazev {
    font-weight: 500;
    color: var(--brand-dark);
  }
  .meta {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .nic {
    color: var(--text-muted);
    cursor: default;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  /* počítač: jen lupa, po kliknutí se pole rozbalí přes lištu (nic se nezalomí) */
  @media (min-width: 901px) {
    .hledani {
      width: 44px;
      height: 44px;
    }
    input {
      position: absolute;
      right: 0;
      top: 0;
      width: 44px;
      padding-right: 0;
      cursor: pointer;
    }
    input::placeholder {
      color: transparent;
    }
    .hledani.rozbaleno .lupa {
      display: none;
    }
    .hledani.rozbaleno input {
      width: 320px;
      padding: 0 12px 0 16px;
      cursor: text;
      z-index: 40;
      background: #fff;
    }
    .hledani.rozbaleno input::placeholder {
      color: var(--text-muted);
    }
    .lupa {
      left: 13px;
      z-index: 41;
    }
  }
  @media (max-width: 900px) {
    .hledani {
      width: 100%;
    }
    input,
    input:focus {
      width: 100%;
    }
    .vysledky {
      left: 0;
      right: auto;
      width: 100%;
    }
  }
</style>
