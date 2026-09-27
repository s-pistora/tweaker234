<script lang="ts">
  /**
   * Typewriter – postupné vypisování textu po znacích.
   *
   * - Klik nebo libovolná klávesa okamžitě dokončí zobrazení celého textu.
   * - `prefers-reduced-motion: reduce` nebo `.crt-off` na <html> → text se zobrazí
   *   celý okamžitě, bez animace.
   * - `aria-label` je vždy plný text, aby ho čtečka obrazovky dostala celý,
   *   bez ohledu na stav animace.
   * - `ondone` se zavolá přesně jednou, jakmile je text kompletní (přirozeně
   *   nebo po přeskočení).
   */
  interface Props {
    text: string;
    /** ms na znak; výchozí odpovídá `--typewriter-speed` (22ms) */
    speed?: number;
    ondone?: () => void;
  }

  const { text, speed = 22, ondone }: Props = $props();

  let shown = $state('');
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function crtOff(): boolean {
    try {
      return typeof document !== 'undefined' && document.documentElement.classList.contains('crt-off');
    } catch {
      return false;
    }
  }

  function finish() {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    shown = text;
    if (finished) return;
    finished = true;
    ondone?.();
  }

  function step(i: number) {
    if (finished) return;
    shown = text.slice(0, i);
    if (i >= text.length) {
      finish();
      return;
    }
    timer = setTimeout(() => step(i + 1), speed);
  }

  $effect(() => {
    finished = false;
    if (prefersReducedMotion() || crtOff()) {
      finish();
    } else {
      step(0);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  });
</script>

<span
  class="typewriter"
  data-testid="typewriter"
  aria-label={text}
  tabindex="0"
  role="button"
  onclick={finish}
  onkeydown={finish}
>{shown}</span>
