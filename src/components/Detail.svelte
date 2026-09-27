<script lang="ts">
  /**
   * Detail území: hlavička dotazu, řádek na ukazatel (`LABEL  hodnota [rok] [zdroj]`),
   * věta z `describe` vs ČR (a vs průměr kraje pro ORP/obec) – jen věta jde přes
   * Typewriter, zbytek je statický. Pod tím Oscilloscope a (jsou-li) věkové skupiny.
   */
  import type { AreaCode, Level, SourceEntry } from '../lib/types.ts';
  import type { Snapshot } from '../lib/data/loader.ts';
  import { describe, formatValue } from '../lib/sentences.ts';
  import { latestValue, fitIndicator } from '../lib/map/values.ts';
  import AsciiPanel from './crt/AsciiPanel.svelte';
  import Typewriter from './crt/Typewriter.svelte';
  import Oscilloscope from './charts/Oscilloscope.svelte';
  import AgePyramid from './charts/AgePyramid.svelte';

  interface Props {
    snap: Snapshot;
    level: Level;
    code: AreaCode;
    name: string;
    indicator: string;
    year: number;
  }
  const { snap, level, code, name, indicator, year }: Props = $props();

  const LEVEL_LABEL: Record<Level, string> = { kraj: 'KRAJ', orp: 'ORP', obec: 'OBEC' };

  const file = $derived(snap.indicators[level]);
  // ukazatel/rok přizpůsobené úrovni detailu (kontextový detail může být o úroveň výš)
  const fit = $derived(fitIndicator(file, indicator, year));
  const def = $derived(file?.indicators[fit.indicator]);
  const series = $derived(def ? (file?.values[def.id]?.[code] ?? {}) : {});

  function sourceOf(sourceId: string): SourceEntry | undefined {
    return snap.manifest.sources.find((s) => s.id === sourceId);
  }

  const rows = $derived(
    file
      ? Object.values(file.indicators).map((d) => {
          const s = file.values[d.id]?.[code];
          const lv = latestValue(s, d.id === fit.indicator ? fit.year : undefined);
          return {
            def: d,
            lv,
            reason: lv ? '' : describe(d, s ?? {}, undefined, fit.year),
            src: sourceOf(d.sourceId),
            selected: d.id === fit.indicator,
          };
        })
      : [],
  );

  // Obecní "nezaměstnanost" (zdroj csu-obec-nezamestnanost) je prosincová hodnota, zatímco
  // ČR/kraj u tohoto ukazatele je roční průměr - bez poznámky by srovnání vypadalo jako
  // jablka s hruškami (review finding #8).
  const OBEC_MONTHLY_SOURCE = 'csu-obec-nezamestnanost';
  const OBEC_MONTHLY_NOTE = ' (obec: stav k prosinci, kraj/ČR: roční průměr)';

  const sentence = $derived.by(() => {
    if (!def || !file) return '';
    const vsCR = describe(def, series, file.national?.[def.id], fit.year, 'průměrem ČR');
    let result: string;
    if (level === 'kraj') {
      result = vsCR;
    } else {
      const reg = file.regional?.[def.id];
      if (!reg) {
        result = vsCR;
      } else {
        const base = describe(def, series, undefined, fit.year);
        const vsKV = describe(def, series, reg, fit.year, 'průměrem kraje');
        const extra = vsKV.startsWith(base) ? vsKV.slice(base.length).trim() : '';
        result = extra ? `${vsCR} ${extra}` : vsCR;
      }
    }
    const hasValue = series[fit.year] !== undefined && series[fit.year] !== null;
    if (level === 'obec' && hasValue && def.sourceId === OBEC_MONTHLY_SOURCE) {
      result += OBEC_MONTHLY_NOTE;
    }
    return result;
  });

  const refSeries = $derived(def ? (file?.national?.[def.id] ?? (level !== 'kraj' ? file?.regional?.[def.id] : undefined)) : undefined);
  const refLabel = $derived(def && file?.national?.[def.id] ? 'ČR' : 'průměr kraje');
</script>

<AsciiPanel title={`${LEVEL_LABEL[level]} ${name}`}>
  <p class="query">&gt; DOTAZ UZEMI={code} UKAZATEL={fit.indicator} ROK={fit.year}</p>

  {#if !file}
    <p class="na">N/A – ukazatele pro úroveň {level} nejsou k dispozici.</p>
  {:else}
    <table class="rows">
      <tbody>
        {#each rows as r (r.def.id)}
          <tr class:sel={r.selected}>
            <th scope="row">{r.def.label.toUpperCase()}</th>
            {#if r.lv}
              <td class="val">{formatValue(r.lv.value, r.def)} {r.def.unit}</td>
              <td class="yr">[{r.lv.year}]</td>
            {:else}
              <td class="val na">N/A</td>
              <td class="yr na-reason">{r.reason}</td>
            {/if}
            <td class="src">
              {#if r.src}
                [<a href={r.src.url} target="_blank" rel="noopener noreferrer" title={r.src.title}>{r.src.provider}</a>]
              {:else}
                [?]
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if sentence}
      <p class="sentence">
        {#key sentence}
          <Typewriter text={sentence} />
        {/key}
      </p>
    {/if}

    {#if def}
      <Oscilloscope {series} {def} year={fit.year} ref={refSeries} {refLabel} />
    {/if}
    <AgePyramid {file} {code} year={fit.year} />
  {/if}
</AsciiPanel>

<style>
  .query {
    font-family: var(--font-display);
    font-size: 1.15rem;
    color: var(--amber);
    margin: 0 0 8px;
    overflow-wrap: anywhere;
  }
  .rows {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th,
  td {
    text-align: left;
    padding: 2px 6px 2px 0;
    vertical-align: top;
    font-weight: normal;
  }
  th {
    color: var(--phosphor-60);
    overflow-wrap: anywhere;
  }
  .val {
    font-family: var(--font-display);
    font-size: 1.15rem;
    color: var(--phosphor-100);
    white-space: nowrap;
  }
  tr.sel th {
    color: var(--phosphor-100);
  }
  tr.sel th::before {
    content: '▸ ';
  }
  .yr {
    color: var(--phosphor-60);
  }
  .na,
  .na-reason {
    color: var(--amber);
  }
  .src a {
    color: var(--phosphor-80);
  }
  .sentence {
    margin: 10px 0 0;
    color: var(--phosphor-100);
  }
  @media (max-width: 480px) {
    .rows,
    .rows tbody,
    .rows tr {
      display: block;
    }
    .rows tr {
      display: flex;
      flex-wrap: wrap;
      gap: 0 8px;
      padding: 3px 0;
      border-bottom: 1px dotted var(--phosphor-40);
    }
    th {
      flex-basis: 100%;
    }
  }
</style>
