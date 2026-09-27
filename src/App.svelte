<script lang="ts">
  // Kostra – obsah doplní dráhy Design a Frontend.

  // DESIGN DEMO: import stylů + ukázka komponent z src/components/crt.
  // Frontend tento blok nahradí skutečnou aplikací (mapa/detail/…).
  import '../src/styles/tokens.css';
  import '../src/styles/crt.css';
  import AsciiPanel from './components/crt/AsciiPanel.svelte';
  import Typewriter from './components/crt/Typewriter.svelte';
  import CrtToggle from './components/crt/CrtToggle.svelte';
  import { patternDefs } from './components/crt/patterns.svg.ts';
</script>

<!-- DESIGN DEMO: start -->
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
<!-- DESIGN DEMO: end -->

<style>
  main { padding: 16px; }
  h1 { font-family: var(--font-display); }
</style>
