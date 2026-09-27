<script lang="ts">
  // Kostra – obsah doplní dráhy Design a Frontend.

  // DESIGN DEMO: import stylů + ukázka komponent z src/components/crt.
  // Frontend tento blok nahradí skutečnou aplikací (mapa/detail/…).
  import './styles/tokens.css';
  import './styles/crt.css';
  import AsciiPanel from './components/crt/AsciiPanel.svelte';
  import Typewriter from './components/crt/Typewriter.svelte';
  import CrtToggle from './components/crt/CrtToggle.svelte';
  import Boot from './components/crt/Boot.svelte';
  import { patternDefs } from './components/crt/patterns.svg.ts';

  let booted = $state(false);

  // Simulovaný loader pro demo – skutečný `loadSnapshot` dodá dráha Frontend (Task 10)
  // a bude mít stejný tvar `(onStep) => Promise<Snapshot>`.
  async function demoLoad(onStep: (s: { label: string; status: 'ok' | 'stale' | 'fail' }) => void) {
    const steps: Array<{ label: string; status: 'ok' | 'stale' | 'fail' }> = [
      { label: 'MANIFEST', status: 'ok' },
      { label: 'GEODATA KRAJŮ', status: 'ok' },
      { label: 'UKAZATELE KV', status: 'stale' },
      { label: 'BODOVÉ VRSTVY', status: 'ok' },
    ];
    for (const s of steps) {
      await new Promise((r) => setTimeout(r, 150));
      onStep(s);
    }
    return steps;
  }
</script>

<!-- DESIGN DEMO: start -->
{#if !booted}
  <Boot load={demoLoad} ondone={() => (booted = true)} />
{:else}
  <div class="crt-screen">
    <main>
      <h1 class="crt-glow">KRAJ-TERM</h1>
      <p>&gt; SYSTÉM PŘIPRAVEN_</p>

      <CrtToggle />

      <AsciiPanel title="STATUS">
        <Typewriter text="&gt; DOTAZ UZEMI=CZ041 … NAČTENO" speed={18} />
      </AsciiPanel>

      <svg width="0" height="0" style="position:absolute">
        <defs>{@html patternDefs()}</defs>
      </svg>
    </main>
  </div>
{/if}
<!-- DESIGN DEMO: end -->

<style>
  main { padding: 16px; }
  h1 { font-family: var(--font-display); }
</style>
