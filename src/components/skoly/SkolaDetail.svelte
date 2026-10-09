<script lang="ts">
  /** Detail vybrané školy: všechny její obory s větami lidskou řečí, doprava, web, zdroje. */
  import type { Obor, SourceEntry } from '../../lib/types.ts';
  import {
    TYP_LABEL,
    asciiBar,
    naplnenost,
    naplnenostSkoly,
    procenta,
    tridaNaplnenosti,
    vetaDoprava,
    vetaNaplnenost,
    vetaTrend,
  } from '../../lib/skoly.ts';

  interface Props {
    obory: Obor[];
    /** vzdálenost od domova v km, null = domov nezadán */
    km: number | null;
    sources: SourceEntry[];
    onclose: () => void;
  }
  const { obory, km, sources, onclose }: Props = $props();

  const s = $derived(obory[0]);
  const otevirane = $derived(obory.filter((o) => (o.zamer[2026] ?? 0) > 0));
  const zavrene = $derived(obory.filter((o) => !((o.zamer[2026] ?? 0) > 0)));
  const celkem = $derived(naplnenostSkoly(obory));
  const mist2026 = $derived(otevirane.reduce((a, o) => a + (o.zamer[2026] ?? 0), 0));
  const web = $derived(s?.web ? (/^https?:\/\//.test(s.web) ? s.web : `https://${s.web}`) : '');
</script>

{#if s}
  <section class="ascii-panel detail" aria-label="Detail školy" data-testid="skola-detail">
    <div class="head">
      <h2 class="ascii-panel__title">&gt; {s.skola}</h2>
      <button type="button" class="x" onclick={onclose} aria-label="Zavřít detail školy">[x]</button>
    </div>
    <p class="sub">
      {s.obec}{km !== null ? ` · ${km.toFixed(1).replace('.', ',')} km od domova vzdušnou čarou` : ''}
      {#if web}· <a href={web} target="_blank" rel="noopener noreferrer">web školy ↗</a>{/if}
    </p>
    <p>
      Pro školní rok 2026/27 plánuje přijmout <strong>{mist2026}</strong> žáků do {otevirane.length}
      {otevirane.length === 1 ? 'oboru' : 'oborů'}.
      {#if celkem !== null}Loni byla škola obsazená na <strong>{procenta(celkem)}</strong>.{/if}
    </p>
    <p>🚌 {vetaDoprava(s)}</p>

    <ul class="obory">
      {#each otevirane as o (o.kodOboru + o.forma)}
        {@const n = naplnenost(o)}
        {@const veta = vetaTrend(o)}
        <li>
          <h3>{o.nazevOboru} <span class="kod">{o.kodOboru}</span></h3>
          <p class="typ">
            {TYP_LABEL[o.typ]} · {o.delka} · {o.forma} · míst 2026/27: <strong>{o.zamer[2026]}</strong>
          </p>
          <p class="bar bar--{tridaNaplnenosti(n)}">{asciiBar(n, 20)} {procenta(n)}</p>
          <p>{vetaNaplnenost(o)}</p>
          {#if veta}<p class="trend">{veta}</p>{/if}
        </li>
      {/each}
    </ul>
    {#if zavrene.length}
      <p class="zavrene">
        Obory, které pro 2026/27 nepřijímají: {zavrene.map((o) => o.nazevOboru).join(', ')}.
      </p>
    {/if}
    <p class="src">
      Zdroj: {sources.map((x) => x.title.replace(/ v Karlovarském kraji/, '')).join('; ')} – Karlovarský kraj,
      DATAZÁPAD, {sources[0]?.license ?? ''}.
    </p>
  </section>
{/if}

<style>
  .detail {
    min-width: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: start;
  }
  .x {
    background: none;
    color: var(--amber);
    border: 1px solid var(--amber);
    font-family: var(--font-mono);
    cursor: pointer;
    flex: none;
  }
  p {
    margin: 4px 0;
    color: var(--phosphor-80);
  }
  .sub,
  .typ,
  .src,
  .zavrene,
  .kod {
    color: var(--phosphor-60);
    font-size: 0.85rem;
  }
  a {
    color: var(--amber);
  }
  strong {
    color: var(--phosphor-100);
  }
  .obory {
    list-style: none;
    padding: 0;
    margin: 10px 0;
  }
  .obory li {
    border-top: 1px dashed var(--phosphor-40);
    padding: 8px 0;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--phosphor-100);
  }
  .bar {
    white-space: pre;
    font-family: var(--font-mono);
  }
  .bar--volno {
    color: var(--phosphor-100);
  }
  .bar--ok {
    color: var(--phosphor-80);
  }
  .bar--pretlak {
    color: var(--amber);
  }
  .bar--na {
    color: var(--phosphor-60);
  }
  .trend {
    color: var(--phosphor-60);
  }
</style>
