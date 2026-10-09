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

  const LEVEL_LABEL: Record<Level, string> = { kraj: '', orp: 'ORP', obec: 'Obec' };

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

  /** Absolutní počty (obyvatelé, počet zařízení) se s ČR/krajem nesrovnávají – kraj nemá
   *  „o 97 % méně obyvatel než ČR“ v žádném užitečném smyslu. Jen vývoj v čase. */
  const ABSOLUTE_UNITS = new Set(['osoby', 'počet']);
  const absolutni = $derived(!!def && (def.id === 'obyvatele' || ABSOLUTE_UNITS.has(def.unit)));

  const sentence = $derived.by(() => {
    if (!def || !file) return '';
    if (absolutni) return describe(def, series, undefined, fit.year);
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

  const refSeries = $derived(
    def && !absolutni ? (file?.national?.[def.id] ?? (level !== 'kraj' ? file?.regional?.[def.id] : undefined)) : undefined,
  );
  const refLabel = $derived(def && file?.national?.[def.id] ? 'ČR' : 'průměr kraje');
</script>

<AsciiPanel title={`${LEVEL_LABEL[level]} ${name}`.trim()}>

  {#if !file}
    <p class="na">Pro tuto úroveň nemáme ukazatele.</p>
  {:else}
    <table class="rows">
      <tbody>
        {#each rows as r (r.def.id)}
          <tr class:sel={r.selected}>
            <th scope="row">{r.def.label}</th>
            {#if r.lv}
              <td class="val">{formatValue(r.lv.value, r.def)} <span class="unit">{r.def.unit}</span></td>
            {:else}
              <td class="val na">N/A <span class="na-reason">{r.reason}</span></td>
            {/if}
            <td class="src">
              {#if r.lv}<span class="yr">{r.lv.year}</span> · {/if}{#if r.src}<a
                  href={r.src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={r.src.title}>{r.src.provider}</a
                >{:else}zdroj neuveden{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if sentence}
      <p class="sentence">
        {#key sentence}
          <Typewriter text={sentence} speed={0} />
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
  .rows {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
  }
  th,
  td {
    text-align: left;
    padding: 8px 8px 8px 0;
    vertical-align: baseline;
    font-weight: normal;
    border-bottom: 1px solid var(--line);
  }
  th {
    color: var(--text);
    width: 42%;
  }
  .val {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--brand-dark);
    white-space: nowrap;
  }
  .unit {
    font-size: 0.85rem;
    font-weight: 400;
    color: var(--text-muted);
  }
  tr.sel th {
    color: var(--brand);
    font-weight: 500;
  }
  tr.sel {
    box-shadow: inset 3px 0 0 var(--brand);
  }
  tr.sel th {
    padding-left: 10px;
  }
  .src,
  .yr {
    color: var(--text-muted);
    font-size: 0.82rem;
  }
  .na,
  .na-reason {
    color: var(--text-muted);
    font-weight: 400;
    white-space: normal;
  }
  .sentence {
    margin: 14px 0 0;
    padding: 12px 14px;
    background: var(--brand-ice);
    border-left: 4px solid var(--brand);
    color: var(--brand-dark);
  }
  @media (max-width: 600px) {
    .rows,
    .rows tbody,
    .rows tr {
      display: block;
    }
    .rows tr {
      display: flex;
      flex-wrap: wrap;
      gap: 0 8px;
      padding: 6px 0;
      border-bottom: 1px solid var(--line);
    }
    th,
    td {
      border: 0;
      padding: 0;
    }
    th {
      flex-basis: 100%;
      width: auto;
    }
  }
</style>
