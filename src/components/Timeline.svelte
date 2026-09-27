<script lang="ts">
  /**
   * Časová osa (Task 17): posuvník přes dostupné roky ukazatele na aktuální
   * úrovni + ▶/❚❚ přehrávání (700 ms/rok), které jede od aktuálního roku po
   * poslední a tam se samo zastaví (nesmyčkuje donekonečna). Když už je
   * aktuální rok poslední, přehrávání začne znovu od začátku.
   *
   * `.crt-off` / `prefers-reduced-motion` → ▶ jen okamžitě skočí na poslední
   * rok (žádná animace, viz `motionAllowed` sdílené s mapovým zoomem).
   *
   * Přístupnost: nativní `<input type="range">` (šipky fungují samy), popisek
   * s aktuálním rokem, `aria-pressed` na tlačítku přehrávání.
   */
  import { onDestroy } from 'svelte';
  import { motionAllowed } from '../lib/map/zoom.ts';

  interface Props {
    years: number[];
    year: number;
    onyear: (y: number) => void;
  }
  const { years, year, onyear }: Props = $props();

  const PLAY_MS = 700;

  const currentIndex = $derived(Math.max(0, years.indexOf(year)));

  let playing = $state(false);
  let playIndex = -1;
  let timer: ReturnType<typeof setInterval> | undefined;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    playing = false;
  }

  function tick() {
    const idx = playIndex + 1;
    if (idx >= years.length) {
      stop();
      return;
    }
    playIndex = idx;
    onyear(years[idx]);
    if (idx >= years.length - 1) stop();
  }

  function play() {
    if (years.length < 2) return;
    if (!motionAllowed()) {
      onyear(years[years.length - 1]);
      return;
    }
    // pokud jsme už na posledním roce, přehrávání začne znovu od začátku
    playIndex = currentIndex >= years.length - 1 ? -1 : currentIndex;
    playing = true;
    timer = setInterval(tick, PLAY_MS);
  }

  function togglePlay() {
    if (playing) stop();
    else play();
  }

  function onSlide(e: Event) {
    stop();
    const idx = Number((e.currentTarget as HTMLInputElement).value);
    const y = years[idx];
    if (y !== undefined) onyear(y);
  }

  // změna dostupných let (jiný ukazatel/úroveň) → přehrávání ztrácí smysl, zastavit
  $effect(() => {
    void years;
    stop();
  });

  onDestroy(stop);
</script>

{#if years.length > 1}
  <div class="timeline" data-testid="timeline">
    <button
      type="button"
      class="play"
      aria-pressed={playing}
      aria-label={playing ? 'Zastavit přehrávání časové osy' : 'Přehrát časovou osu'}
      onclick={togglePlay}
      data-testid="timeline-play"
    >{playing ? '❚❚' : '▶'}</button>
    <label class="slider">
      <span class="sr-only">Rok</span>
      <input
        type="range"
        min="0"
        max={years.length - 1}
        step="1"
        value={currentIndex}
        aria-label={`Rok: ${year}`}
        oninput={onSlide}
      />
    </label>
    <span class="year" data-testid="timeline-year">{year}</span>
  </div>
{/if}

<style>
  .timeline {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--phosphor-40);
    background: var(--bg-panel);
    padding: 6px 10px;
    box-sizing: border-box;
  }
  .play {
    background: var(--bg);
    color: var(--amber);
    border: 1px solid var(--amber-dim);
    font-family: var(--font-mono);
    padding: 3px 10px;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .slider {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--phosphor-100);
  }
  .year {
    font-family: var(--font-display);
    color: var(--phosphor-100);
    font-size: 1.2rem;
    min-width: 3.5em;
    text-align: right;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
