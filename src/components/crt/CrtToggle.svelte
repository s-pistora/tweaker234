<script lang="ts">
  /**
   * CrtToggle – přepínač CRT efektů (scanlines/vinětace/zakřivení/flicker/glow).
   * Stav se ukládá do `localStorage['crt']` ('on' | 'off'); přístup je vždy
   * obalený v try/catch (localStorage může být nedostupný – privátní režim apod.).
   * Vypnutí přidá třídu `.crt-off` na <html>, což CSS (crt.css) použije k vypnutí
   * všech efektů a animací.
   */
  const STORAGE_KEY = 'crt';

  function readStored(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  function writeStored(on: boolean) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // localStorage nedostupný – stav zůstane jen pro tuto session
    }
  }

  let on = $state(readStored());

  function apply(value: boolean) {
    try {
      document.documentElement.classList.toggle('crt-off', !value);
    } catch {
      // document nedostupný (SSR apod.)
    }
  }

  $effect(() => {
    apply(on);
  });

  function toggle() {
    on = !on;
    writeStored(on);
  }
</script>

<button
  type="button"
  class="crt-toggle"
  data-testid="crt-toggle"
  aria-pressed={on}
  onclick={toggle}
>
  CRT EFEKTY: {on ? 'ZAP' : 'VYP'}
</button>

<style>
  .crt-toggle {
    font-family: var(--font-mono);
    background: var(--bg-panel);
    color: var(--phosphor-80);
    border: 1px solid var(--phosphor-60);
    padding: 4px 10px;
    cursor: pointer;
  }

  .crt-toggle:hover {
    color: var(--phosphor-100);
    border-color: var(--phosphor-100);
  }
</style>
