<script lang="ts">
  /** Časová řada jako stopa osciloskopu: SVG polyline se „žhnutím“, osa let, volitelná referenční řada (čárkovaně). */
  import type { IndicatorDef } from '../../lib/types.ts';
  import { seriesPoints } from '../../lib/map/charts.ts';
  import { formatValue } from '../../lib/sentences.ts';

  interface Props {
    series: Record<number, number | null>;
    def: IndicatorDef;
    year: number;
    ref?: Record<number, number>;
    refLabel?: string;
  }
  const { series, def, year, ref, refLabel = 'ČR' }: Props = $props();

  const W = 320;
  const H = 110;
  const PAD_L = 4;
  const PAD_B = 16;
  const PH = H - PAD_B - 6;

  const nums = (o: Record<number, number | null> | undefined) =>
    Object.values(o ?? {}).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const years = $derived(
    Object.entries(series)
      .filter(([, v]) => typeof v === 'number')
      .map(([y]) => Number(y))
      .sort((a, b) => a - b),
  );
  const xDom = $derived<[number, number]>([years[0] ?? year, years.at(-1) ?? year]);
  const refInRange = $derived(
    ref ? Object.fromEntries(Object.entries(ref).filter(([y]) => +y >= xDom[0] && +y <= xDom[1])) : undefined,
  );
  const yDom = $derived.by<[number, number]>(() => {
    const all = [...nums(series), ...nums(refInRange)];
    if (!all.length) return [0, 1];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.05 || 1;
    return [lo - pad, hi + pad];
  });
  const segs = $derived(seriesPoints(series, xDom, yDom, W - 2 * PAD_L, PH));
  const refSegs = $derived(refInRange ? seriesPoints(refInRange, xDom, yDom, W - 2 * PAD_L, PH) : []);
  const pts = (seg: [number, number][]) => seg.map(([x, y]) => `${x + PAD_L},${y + 4}`).join(' ');
  const xOf = (y: number) =>
    PAD_L + (xDom[1] === xDom[0] ? (W - 2 * PAD_L) / 2 : ((y - xDom[0]) / (xDom[1] - xDom[0])) * (W - 2 * PAD_L));

  const first = $derived(years.length ? series[years[0]] : null);
  const last = $derived(years.length ? series[years.at(-1)!] : null);
  const aria = $derived(
    years.length
      ? `Vývoj: ${def.label}, ${xDom[0]}–${xDom[1]}: od ${formatValue(first ?? null, def)} do ${formatValue(last ?? null, def)} ${def.unit}.`
      : `Vývoj: ${def.label} – žádná data.`,
  );
</script>

<figure class="osc">
  {#if years.length}
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={aria}>
      {#each [0.25, 0.5, 0.75] as g (g)}
        <line class="grid" x1={PAD_L} x2={W - PAD_L} y1={4 + PH * g} y2={4 + PH * g} />
      {/each}
      {#if years.includes(year)}
        <line class="cursor" x1={xOf(year)} x2={xOf(year)} y1="4" y2={4 + PH} />
      {/if}
      {#each refSegs as s, i (i)}
        <polyline class="ref" points={pts(s)} />
      {/each}
      {#each segs as s, i (i)}
        {#if s.length === 1}
          <circle class="dot" cx={s[0][0] + PAD_L} cy={s[0][1] + 4} r="2.5" />
        {:else}
          <polyline class="trace" points={pts(s)} />
        {/if}
      {/each}
      <line class="axis" x1={PAD_L} x2={W - PAD_L} y1={H - PAD_B} y2={H - PAD_B} />
      <text class="lbl" x={PAD_L} y={H - 3}>{xDom[0]}</text>
      {#if xDom[1] !== xDom[0]}
        <text class="lbl" x={W - PAD_L} y={H - 3} text-anchor="end">{xDom[1]}</text>
      {/if}
      <text class="lbl" x={W - PAD_L} y="12" text-anchor="end">max {formatValue(yDom[1], def)}</text>
    </svg>
    <figcaption>
      <span class="k-trace">━</span> {def.label} ({def.unit})
      {#if refSegs.length}<span class="k-ref">╌</span> {refLabel}{/if}
    </figcaption>
  {:else}
    <p class="empty">Pro ukazatel {def.label} nemáme časovou řadu.</p>
  {/if}
</figure>

<style>
  .osc {
    margin: 8px 0 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    background: var(--bg);
    border: 1px solid var(--phosphor-40);
    box-sizing: border-box;
  }
  .grid {
    stroke: var(--phosphor-40);
    stroke-dasharray: 2 4;
    stroke-width: 0.5;
  }
  .axis {
    stroke: var(--phosphor-40);
  }
  .cursor {
    stroke: var(--amber-dim);
    stroke-dasharray: 3 3;
  }
  .trace {
    fill: none;
    stroke: var(--phosphor-100);
    stroke-width: 2;
    stroke-linejoin: round;
    filter: none;
  }
  .dot {
    fill: var(--phosphor-100);
  }
  .ref {
    fill: none;
    stroke: var(--phosphor-60);
    stroke-width: 1.2;
    stroke-dasharray: 4 3;
  }
  .lbl {
    fill: var(--phosphor-60);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  figcaption {
    font-size: 0.8rem;
    color: var(--phosphor-60);
    margin-top: 2px;
  }
  .k-trace {
    color: var(--phosphor-100);
  }
  .empty {
    color: var(--phosphor-60);
  }
</style>
