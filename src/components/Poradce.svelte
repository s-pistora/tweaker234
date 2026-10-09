<script lang="ts">
  /**
   * AI poradce – plovoucí chat vpravo dole. Odpovídá jen z dat aplikace (viz lib/poradce).
   * Zobrazí se jen tam, kde běží lokální proxy `/api/poradce` (vite dev / preview);
   * na statickém webu (GitHub Pages) se neukáže vůbec.
   */
  import { onMount, tick } from 'svelte';
  import Ikona from './vylety/Ikona.svelte';
  import { ENDPOINT, PoradceChyba, zeptejSe, type Zprava } from '../lib/poradce/chat.ts';
  import type { KontextDat } from '../lib/poradce/nastroje.ts';

  interface Props {
    ctx: KontextDat;
  }
  const { ctx }: Props = $props();

  type Stav = 'skryto' | 'pripraveno' | 'bez-klice';
  type Bublina = { kdo: 'ja' | 'ai' | 'chyba'; text: string };

  const NAVRHY = [
    'Jaké obory s maturitou jsou do 20 km od Sokolova?',
    'Kde v kraji se dá koupat a jaká je tam voda?',
    'Které obory byly loni nejméně obsazené?',
    'Kolik obyvatel má Cheb a jaká je tam nezaměstnanost?',
  ];

  let stav = $state<Stav>('skryto');
  let otevreno = $state(false);
  let bubliny = $state<Bublina[]>([]);
  let historie: Zprava[] = [];
  let vstup = $state('');
  let ceka = $state(false);
  let seznamEl = $state<HTMLElement | null>(null);
  let poleEl = $state<HTMLTextAreaElement | null>(null);
  let tlacitkoEl = $state<HTMLButtonElement | null>(null);

  onMount(async () => {
    try {
      const r = await fetch(ENDPOINT);
      // bez proxy vrací server index.html (200) nebo 404 → poradce se neukáže
      const proxy = r.headers.get('content-type')?.includes('application/json');
      if (!proxy) stav = 'skryto';
      else if (r.status === 503) stav = 'bez-klice';
      else stav = r.ok && (await r.json()).ok === true ? 'pripraveno' : 'skryto';
    } catch {
      stav = 'skryto';
    }
  });

  async function dolu() {
    await tick();
    seznamEl?.scrollTo({ top: seznamEl.scrollHeight, behavior: 'smooth' });
  }

  async function otevri() {
    otevreno = true;
    await tick();
    poleEl?.focus();
  }
  function zavri() {
    otevreno = false;
    tlacitkoEl?.focus();
  }

  async function posli(text = vstup) {
    const otazka = text.trim();
    if (!otazka || ceka || stav !== 'pripraveno') return;
    vstup = '';
    bubliny = [...bubliny, { kdo: 'ja', text: otazka }];
    ceka = true;
    dolu();
    try {
      const r = await zeptejSe([...historie, { role: 'user', content: otazka }], ctx);
      historie = r.historie.slice(-30);
      bubliny = [...bubliny, { kdo: 'ai', text: r.odpoved }];
    } catch (e) {
      const zprava = e instanceof PoradceChyba ? e.message : 'Něco se pokazilo, zkuste to prosím znovu.';
      bubliny = [...bubliny, { kdo: 'chyba', text: zprava }];
    } finally {
      ceka = false;
      dolu();
      poleEl?.focus();
    }
  }

  function novyRozhovor() {
    bubliny = [];
    historie = [];
    poleEl?.focus();
  }

  function onKeydownPole(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      posli();
    }
  }
  function onKeydownPanel(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      zavri();
    }
  }

  /** Jednoduché formátování odpovědi: odstavce, odrážky, **tučně** – bez HTML z modelu. */
  type Blok = { typ: 'p'; radky: string[] } | { typ: 'ul'; polozky: string[] };
  function bloky(text: string): Blok[] {
    const out: Blok[] = [];
    for (const radek of text.split('\n')) {
      const t = radek.trim();
      const odr = /^([-*•]|\d+[.)])\s+(.*)$/.exec(t);
      const posl = out[out.length - 1];
      if (!t) out.push({ typ: 'p', radky: [] });
      else if (odr) {
        if (posl?.typ === 'ul') posl.polozky.push(odr[2]);
        else out.push({ typ: 'ul', polozky: [odr[2]] });
      } else if (posl?.typ === 'p') posl.radky.push(t);
      else out.push({ typ: 'p', radky: [t] });
    }
    return out.filter((b) => (b.typ === 'p' ? b.radky.length > 0 : true));
  }
  const kusy = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((t, i) => ({ t, b: i % 2 === 1 }));
</script>

{#if stav !== 'skryto'}
  {#if otevreno}
    <div
      class="panel"
      role="dialog"
      tabindex="-1"
      aria-modal="false"
      aria-labelledby="poradce-nadpis"
      onkeydown={onKeydownPanel}
      data-testid="poradce-panel"
    >
      <header class="hlava">
        <span class="hlava__ikona" aria-hidden="true">
          <Ikona d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" size={20} />
        </span>
        <div class="hlava__txt">
          <h2 id="poradce-nadpis">AI poradce</h2>
          <p>Odpovídá jen z otevřených dat kraje</p>
        </div>
        {#if bubliny.length}
          <button type="button" class="ikonbtn" onclick={novyRozhovor} aria-label="Nový rozhovor" title="Nový rozhovor">
            <Ikona d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" size={18} />
          </button>
        {/if}
        <button type="button" class="ikonbtn" onclick={zavri} aria-label="Zavřít poradce" title="Zavřít">
          <Ikona d="M6 6l12 12M18 6L6 18" size={18} />
        </button>
      </header>

      <div class="zpravy" bind:this={seznamEl} aria-live="polite">
        {#if stav === 'bez-klice'}
          <p class="info">
            Poradce potřebuje API klíč Groq. Vložte do souboru <code>.env.local</code> v kořeni projektu řádek
            <code>GROQ_API_KEY=…</code> a restartujte <code>npm run dev</code>.
          </p>
        {:else if !bubliny.length}
          <div class="uvod">
            <p>Dobrý den! Zeptejte se na střední školy, výlety nebo čísla o obcích. Radím jen z dat, která tu aplikace má – co v nich není, to vám rovnou řeknu.</p>
            <ul class="navrhy" aria-label="Návrhy otázek">
              {#each NAVRHY as n (n)}
                <li><button type="button" onclick={() => posli(n)}>{n}</button></li>
              {/each}
            </ul>
          </div>
        {/if}

        {#each bubliny as b, i (i)}
          <div class="bublina bublina--{b.kdo}">
            {#if b.kdo === 'ai'}
              {#each bloky(b.text) as blok, j (j)}
                {#if blok.typ === 'ul'}
                  <ul>
                    {#each blok.polozky as p, k (k)}
                      <li>{#each kusy(p) as c, m (m)}{#if c.b}<strong>{c.t}</strong>{:else}{c.t}{/if}{/each}</li>
                    {/each}
                  </ul>
                {:else}
                  <p>{#each blok.radky as r, k (k)}{#if k}<br />{/if}{#each kusy(r) as c, m (m)}{#if c.b}<strong>{c.t}</strong>{:else}{c.t}{/if}{/each}{/each}</p>
                {/if}
              {/each}
            {:else}
              <p>{b.text}</p>
            {/if}
          </div>
        {/each}

        {#if ceka}
          <div class="bublina bublina--ai bublina--ceka" role="status">
            <span class="tecky" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="sr">Hledám v datech…</span>
          </div>
        {/if}
      </div>

      <form class="vstup" onsubmit={(e) => { e.preventDefault(); posli(); }}>
        <label for="poradce-pole" class="sr">Vaše otázka</label>
        <textarea
          id="poradce-pole"
          bind:this={poleEl}
          bind:value={vstup}
          onkeydown={onKeydownPole}
          rows="1"
          maxlength="500"
          placeholder="Napište otázku…"
          disabled={stav !== 'pripraveno'}
        ></textarea>
        <button type="submit" class="odeslat" disabled={!vstup.trim() || ceka || stav !== 'pripraveno'} aria-label="Odeslat">
          <Ikona d="M5 12h14M13 6l6 6-6 6" size={20} />
        </button>
      </form>
    </div>
  {/if}

  <button
    type="button"
    class="fab"
    class:fab--on={otevreno}
    bind:this={tlacitkoEl}
    onclick={() => (otevreno ? zavri() : otevri())}
    aria-expanded={otevreno}
    aria-label={otevreno ? 'Zavřít AI poradce' : 'Otevřít AI poradce'}
    data-testid="poradce-btn"
  >
    {#if otevreno}
      <Ikona d="M6 6l12 12M18 6L6 18" size={22} />
    {:else}
      <Ikona d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" size={22} />
      <span class="fab__txt">Zeptat se AI</span>
    {/if}
  </button>
{/if}

<style>
  .fab {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 30;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 52px;
    min-width: 52px;
    padding: 0 18px;
    border: 0;
    border-radius: 999px;
    background: var(--brand);
    color: #fff;
    font: 500 1rem/1 var(--font-display);
    box-shadow: 0 4px 14px rgba(12, 24, 56, 0.22);
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
  }
  .fab:hover {
    background: var(--brand-hover);
  }
  .fab:active {
    transform: scale(0.97);
  }
  .fab:focus-visible,
  .panel button:focus-visible,
  .panel textarea:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .fab--on {
    padding: 0;
    width: 52px;
    justify-content: center;
  }

  .panel {
    position: fixed;
    right: 20px;
    bottom: 84px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    width: min(400px, calc(100vw - 32px));
    height: min(600px, calc(100vh - 112px));
    background: var(--bg-panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: 0 12px 40px rgba(12, 24, 56, 0.2);
    overflow: hidden;
    animation: vyjed 0.18s ease-out;
  }
  @keyframes vyjed {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .panel {
      animation: none;
    }
    .fab,
    .tecky i {
      transition: none;
      animation: none;
    }
  }

  .hlava {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 8px 12px 16px;
    background: var(--brand-dark);
    color: #fff;
  }
  .hlava__ikona {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--brand);
    color: var(--accent);
    flex: none;
  }
  .hlava__txt {
    flex: 1;
    min-width: 0;
  }
  .hlava h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
  }
  .hlava p {
    margin: 2px 0 0;
    font-size: 0.8125rem;
    color: var(--brand-light);
  }
  .ikonbtn {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: #fff;
    cursor: pointer;
  }
  .ikonbtn:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .zpravy {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--bg);
  }
  .uvod p,
  .info {
    margin: 0 0 12px;
    color: var(--text);
    font-size: 0.9375rem;
    line-height: 1.5;
  }
  .info code {
    font-size: 0.875em;
    background: var(--c-accent-soft);
    padding: 1px 4px;
    border-radius: 4px;
  }
  .navrhy {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .navrhy button {
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    text-align: left;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--bg-panel);
    color: var(--brand);
    font: 500 0.875rem/1.35 var(--font-display);
    cursor: pointer;
  }
  .navrhy button:hover {
    border-color: var(--brand);
    background: var(--c-accent-soft);
  }

  .bublina {
    max-width: 88%;
    padding: 10px 14px;
    border-radius: 14px;
    font-size: 0.9375rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .bublina p {
    margin: 0;
  }
  .bublina p + p,
  .bublina p + ul,
  .bublina ul + p {
    margin-top: 8px;
  }
  .bublina ul {
    margin: 0;
    padding-left: 20px;
  }
  .bublina li + li {
    margin-top: 4px;
  }
  .bublina--ja {
    align-self: flex-end;
    background: var(--brand);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .bublina--ai {
    align-self: flex-start;
    background: var(--bg-panel);
    color: var(--text);
    border: 1px solid var(--line);
    border-bottom-left-radius: 4px;
  }
  .bublina--ai strong {
    color: var(--brand-dark);
  }
  .bublina--chyba {
    align-self: flex-start;
    background: #fdecec;
    color: #8a0a0c;
    border: 1px solid #f3c2c3;
  }
  .tecky {
    display: inline-flex;
    gap: 4px;
  }
  .tecky i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: skok 1s infinite ease-in-out;
  }
  .tecky i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .tecky i:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes skok {
    0%,
    80%,
    100% {
      opacity: 0.3;
      transform: translateY(0);
    }
    40% {
      opacity: 1;
      transform: translateY(-3px);
    }
  }

  .vstup {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--line);
    background: var(--bg-panel);
  }
  .vstup textarea {
    flex: 1;
    padding: 11px 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    font: 400 0.9375rem/1.4 var(--font-display);
    color: var(--text);
    resize: none;
    height: 44px;
    box-sizing: border-box;
  }
  .vstup textarea:disabled {
    background: var(--bg);
  }
  .odeslat {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex: none;
    border: 0;
    border-radius: var(--radius);
    background: var(--brand);
    color: #fff;
    cursor: pointer;
  }
  .odeslat:hover:not(:disabled) {
    background: var(--brand-hover);
  }
  .odeslat:disabled {
    background: var(--line-strong);
    cursor: default;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .fab {
      right: 16px;
      bottom: 16px;
    }
    .fab__txt {
      display: none;
    }
    .fab:not(.fab--on) {
      width: 52px;
      padding: 0;
      justify-content: center;
    }
    .panel {
      right: 8px;
      left: 8px;
      bottom: 80px;
      width: auto;
      height: calc(100dvh - 96px);
    }
  }
</style>
