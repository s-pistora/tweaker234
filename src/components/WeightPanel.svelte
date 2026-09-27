<script lang="ts">
  /**
   * Panel režimu „Kde by se mi dobře žilo?“: posuvníky vah (0–5) pro kritéria
   * dané úrovně, TOP 5 žebříček a tlačítko k modálu s metodikou. Ukazatele
   * čistě velikostní (obyvatele, jednotka „počet“) sem nepatří - viz
   * `eligibleIndicators` v `lib/score.ts`.
   */
  import type { AreaCode, IndicatorDef } from '../lib/types.ts';
  import type { AreaScore, ScoreResult } from '../lib/score.ts';

  interface Props {
    indicators: IndicatorDef[];
    weights: Record<string, number>;
    names: Record<AreaCode, string>;
    scores: ScoreResult;
    selected?: AreaCode | null;
    onweight: (id: string, w: number) => void;
    onselect: (code: AreaCode) => void;
    onhow: () => void;
  }
  const { indicators, weights, names, scores, selected = null, onweight, onselect, onhow }: Props = $props();

  const totalWeight = $derived(indicators.reduce((s, d) => s + (weights[d.id] ?? 0), 0));

  const top5 = $derived(
    Object.entries(scores)
      .filter((e): e is [AreaCode, AreaScore & { score: number }] => typeof e[1].score === 'number')
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 5),
  );
</script>

<div class="weight-panel ascii-panel">
  <h2 class="ascii-panel__title">&gt; NASTAV VÁHY KRITÉRIÍ</h2>
  <p class="hint">0 = kritérium se do skóre nepočítá, 5 = nejvyšší důraz.</p>
  <ul class="sliders">
    {#each indicators as d (d.id)}
      {@const w = weights[d.id] ?? 0}
      <li>
        <label>
          <span class="lbl">{d.label}</span>
          <input
            type="range"
            min="0"
            max="5"
            step="1"
            value={w}
            aria-label={`Váha: ${d.label}`}
            oninput={(e) => onweight(d.id, Number(e.currentTarget.value))}
          />
          <span class="val" data-testid="weight-{d.id}">{w}</span>
        </label>
      </li>
    {/each}
  </ul>
  <button type="button" class="btn" onclick={onhow} data-testid="how-btn">[JAK SE TO POČÍTÁ?]</button>

  <div class="top5">
    <h3>TOP 5</h3>
    {#if totalWeight === 0}
      <p class="hint">Nastavte alespoň jednu váhu výše - mapa a žebříček se pak naplní.</p>
    {:else if top5.length === 0}
      <p class="hint">Pro vybraná kritéria zatím není žádné území se skóre.</p>
    {:else}
      <ol>
        {#each top5 as [code, s], i (code)}
          <li>
            <button
              type="button"
              class="rank"
              class:selected={selected === code}
              onclick={() => onselect(code)}
              data-testid="top5-{code}"
            >
              {i + 1}. {names[code] ?? code} — {Math.round(s.score)}/100
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</div>

<style>
  .weight-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hint {
    color: var(--phosphor-60);
    font-size: 0.85rem;
    margin: 0;
  }
  .sliders {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  label {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
  }
  .lbl {
    color: var(--phosphor-80);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .val {
    color: var(--phosphor-100);
    font-family: var(--font-display);
    min-width: 1.4em;
    text-align: right;
  }
  input[type='range'] {
    accent-color: var(--phosphor-100);
    width: 140px;
    max-width: 40vw;
  }
  .btn {
    align-self: flex-start;
    background: var(--bg-panel);
    color: var(--amber);
    border: 1px solid var(--amber-dim);
    font-family: var(--font-mono);
    padding: 4px 10px;
    cursor: pointer;
  }
  .top5 {
    border-top: 1px dotted var(--phosphor-40);
    padding-top: 8px;
  }
  .top5 h3 {
    font-family: var(--font-display);
    color: var(--phosphor-100);
    margin: 0 0 6px 0;
    font-size: 1.1rem;
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rank {
    width: 100%;
    text-align: left;
    background: var(--bg);
    color: var(--phosphor-80);
    border: 1px solid var(--phosphor-40);
    font-family: var(--font-mono);
    padding: 3px 8px;
    cursor: pointer;
  }
  .rank.selected {
    border-color: var(--amber);
    color: var(--amber);
  }
</style>
