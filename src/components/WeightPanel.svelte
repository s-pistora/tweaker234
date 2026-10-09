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
  <h2 class="ascii-panel__title">Na čem vám záleží?</h2>
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
  <button type="button" class="btn-secondary" onclick={onhow} data-testid="how-btn">Jak se skóre počítá</button>

  <div class="top5">
    <h3>Nejlépe vychází</h3>
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
              <span class="pos">{i + 1}.</span>
              <span class="nm">{names[code] ?? code}</span>
              <span class="sc"><strong>{Math.round(s.score)}</strong> ze 100</span>
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
  ol {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .rank {
    display: grid !important;
    grid-template-columns: 2em minmax(0, 1fr) auto;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 0 12px !important;
    margin: 0 0 4px !important;
    font: inherit !important;
    font-size: 1rem !important;
    text-align: left;
    background: #fff !important;
    border: 1px solid var(--line) !important;
    border-radius: 4px;
    color: var(--text) !important;
    cursor: pointer;
  }
  .rank:hover,
  .rank.selected {
    border-color: var(--brand) !important;
    background: var(--brand-ice) !important;
  }
  .pos {
    color: var(--text-muted);
  }
  .nm {
    font-weight: 500;
    color: var(--brand-dark);
  }
  .sc {
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .sc strong {
    color: var(--brand);
    font-size: 1.1rem;
  }
</style>
