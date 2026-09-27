<script lang="ts" module>
  import type { ScorePart } from '../lib/score.ts';

  export interface HowPart extends ScorePart {
    value: number | null;
    year: number | null;
  }
</script>

<script lang="ts">
  /**
   * Modál „Jak se to počítá?“: vysvětlení percentilu, inverze pro
   * higherIsBetter=false, vzorec váženého průměru a - pokud je vybrané území -
   * rozpad jeho výpočtu (ukazatel, rok, hodnota, percentil, váha, příspěvek)
   * + seznam vynechaných ukazatelů. Esc zavírá (i tady, navíc k rodiči, pro
   * jistotu), fokus je uvězněný uvnitř dialogu a po zavření se vrací na
   * spouštěcí prvek (řeší volající přes `onclose`).
   */
  import type { IndicatorDef } from '../lib/types.ts';
  import { formatValue } from '../lib/sentences.ts';

  interface Props {
    /** vážené (w>0) způsobilé ukazatele s rokem, který se pro ně ve skóre používá */
    indicators: { def: IndicatorDef; year: number | null; weight: number }[];
    selectedName?: string | null;
    /** rozpad pro vybrané území (parts obohacené o hodnotu/rok), pokud je nějaké vybrané */
    parts?: HowPart[];
    skipped?: IndicatorDef[];
    onclose: () => void;
  }
  const { indicators, selectedName = null, parts = [], skipped = [], onclose }: Props = $props();

  let dialog = $state<HTMLDivElement | null>(null);

  function focusables(): HTMLElement[] {
    if (!dialog) return [];
    return [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled'),
    );
  }

  $effect(() => {
    focusables()[0]?.focus();
  });

  // Esc se NEŘEŠÍ tady (lokálně) - stejně jako u Sources.svelte ho zachytává výhradně
  // globální `onKey` v App.svelte (priorita: Sources → HowModal → o úroveň výš). Lokální
  // handler by jinak zavolal `onclose()` a událost by SOUČASNĚ probublala na window,
  // kde by App uviděl `howOpen` už `false` a omylem zavolal `drill.up()` (level-up race).
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const els = focusables();
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<div class="backdrop">
  <div
    class="dialog ascii-panel"
    bind:this={dialog}
    role="dialog"
    aria-modal="true"
    aria-labelledby="how-title"
    tabindex="-1"
    onkeydown={onKeydown}
  >
    <div class="head">
      <h2 id="how-title" class="ascii-panel__title">JAK SE TO POČÍTÁ?</h2>
      <button type="button" onclick={onclose} data-testid="how-close">[ZAVŘÍT ✕]</button>
    </div>

    <div class="scroll">
      <p>
        Pro každý zvážený ukazatel se v rámci úrovně spočítá <strong>percentil</strong> hodnoty území: 0 = nejhorší
        v porovnání s ostatními, 100 = nejlepší. Pokud je nižší hodnota lepší (např. nezaměstnanost), percentil se
        invertuje (100 − p), takže 100 vždy znamená „nejlépe pro život“.
      </p>
      <p>
        Výsledné skóre je vážený průměr percentilů:
        <code>skóre = Σ wᵢ·pᵢ / Σ wᵢ</code>. Ukazatel, pro který území nemá hodnotu, se z výpočtu vynechá a váhy
        ostatních se tím automaticky přepočítají (jmenovatel obsahuje jen váhy použitých ukazatelů).
      </p>
      <p data-testid="how-excluded">
        Do nabídky kritérií se záměrně <strong>nenabízí počet obyvatel ani jiné čistě velikostní ukazatele</strong>
        (jednotka „počet“ nebo „osoby“, např. počet uchazečů o zaměstnání) - vyšší počet obyvatel, škol nebo
        uchazečů sám o sobě neznamená, že se v území žije lépe nebo hůř, jen že je větší. Taková kritéria by
        percentil jen podle velikosti území zkreslovala, ne podle kvality života.
      </p>
      <p>
        Každý ukazatel používá <strong>svůj vlastní poslední rok s daty</strong> (ne aktuálně vybraný rok nahoře) -
        ukazatele mají různé pokrytí roky a míchání by bylo zavádějící:
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">UKAZATEL</th>
            <th scope="col">ROK</th>
            <th scope="col">VÁHA</th>
          </tr>
        </thead>
        <tbody>
          {#each indicators as ind (ind.def.id)}
            <tr>
              <td>{ind.def.label}</td>
              <td>{ind.year ?? 'N/A'}</td>
              <td>{ind.weight}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if selectedName}
        <h3>Rozpad pro: {selectedName}</h3>
        {#if parts.length}
          <table>
            <thead>
              <tr>
                <th scope="col">UKAZATEL</th>
                <th scope="col">ROK</th>
                <th scope="col">HODNOTA</th>
                <th scope="col">PERCENTIL</th>
                <th scope="col">VÁHA</th>
                <th scope="col">PŘÍSPĚVEK</th>
              </tr>
            </thead>
            <tbody>
              {#each parts as p (p.id)}
                <tr>
                  <td>{p.id}</td>
                  <td>{p.year ?? 'N/A'}</td>
                  <td>{p.value === null ? 'N/A' : formatValue(p.value, indicators.find((i) => i.def.id === p.id)?.def ?? { id: p.id, label: p.id, unit: '', higherIsBetter: true, sourceId: '', decimals: 0 })}</td>
                  <td>{Math.round(p.p)}</td>
                  <td>{p.w}</td>
                  <td>{Math.round(p.p * p.w)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="hint">Pro toto území nebyl vypočten žádný příspěvek.</p>
        {/if}
        {#if skipped.length}
          <p class="hint" data-testid="how-skipped">
            Vynecháno (chybí hodnota): {skipped.map((d) => d.label).join(', ')}.
          </p>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px 12px;
    box-sizing: border-box;
    overflow-y: auto;
  }
  .dialog {
    width: min(760px, 100%);
    border-color: var(--phosphor-60);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  button {
    background: var(--bg-panel);
    color: var(--amber);
    border: 1px solid var(--amber-dim);
    font-family: var(--font-mono);
    padding: 4px 10px;
    cursor: pointer;
  }
  .scroll {
    overflow-x: auto;
    max-width: 100%;
    font-size: 0.9rem;
  }
  code {
    color: var(--phosphor-100);
  }
  h3 {
    font-family: var(--font-display);
    color: var(--phosphor-100);
    margin: 12px 0 6px 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 10px;
  }
  th,
  td {
    text-align: left;
    padding: 3px 8px 3px 0;
    border-bottom: 1px dotted var(--phosphor-40);
  }
  th {
    color: var(--phosphor-60);
    font-weight: normal;
    white-space: nowrap;
  }
  .hint {
    color: var(--amber);
  }
</style>
