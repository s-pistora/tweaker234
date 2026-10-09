<script lang="ts">
  /**
   * Přehled pro kraj (veřejná správa): kolik míst se plánovalo a kolik žáků nastoupilo,
   * podle oborů a území, a kde je nejvíc volno / přetlak.
   */
  import type { AreaCode, Obor } from '../../lib/types.ts';
  import {
    agreguj,
    nazevSkupiny,
    naplnenost,
    oboryPodleNaplnenosti,
    procenta,
    tridaNaplnenosti,
  } from '../../lib/skoly.ts';
  import Naplnenost from './Naplnenost.svelte';

  interface Props {
    obory: Obor[];
    /** kód ORP → název */
    names: Record<AreaCode, string>;
    onselect: (izo: string) => void;
  }
  const { obory, names, onselect }: Props = $props();

  type Pohled = 'skupiny' | 'orp' | 'volno' | 'plno';
  let pohled = $state<Pohled>('skupiny');

  const skupiny = $derived(agreguj(obory, (o) => o.skupina, nazevSkupiny));
  const orp = $derived(agreguj(obory, (o) => o.orp, (k) => names[k] ?? `ORP ${k}`));
  const volno = $derived(oboryPodleNaplnenosti(obory, 'nejmene', 10));
  const plno = $derived(oboryPodleNaplnenosti(obory, 'nejvice', 10));

  const TABS: [Pohled, string][] = [
    ['skupiny', 'Podle oborů'],
    ['orp', 'Podle území'],
    ['volno', 'Kde je volno'],
    ['plno', 'Kde je přetlak'],
  ];

  function kratce(skola: string): string {
    return skola.replace(/,?\s*příspěvková organizace$/i, '');
  }
</script>

<section class="prehled" aria-label="Přehled pro kraj" data-testid="kraj-prehled">
  <h2 class="title">Jak byla místa obsazená loni</h2>
  <p class="lead">
    Porovnáváme plán škol na 2025/26 s počtem žáků, kteří k 30. 9. 2025 opravdu nastoupili. Přehled
    ukazuje, kde zůstávají volná místa a kde zájem převyšuje nabídku.
  </p>
  <div class="tabs" role="tablist" aria-label="Pohled přehledu">
    {#each TABS as [id, label] (id)}
      <button
        type="button"
        role="tab"
        aria-selected={pohled === id}
        class:on={pohled === id}
        onclick={() => (pohled = id)}
        data-testid="prehled-{id}">{label}</button
      >
    {/each}
  </div>

  <div class="card">
    {#if pohled === 'skupiny' || pohled === 'orp'}
      {@const rows = pohled === 'skupiny' ? skupiny : orp}
      <p class="hint">Jak byla loni obsazená první místa – od nejméně obsazených.</p>
      <table class="chart">
        <caption class="sr-only">
          Obsazenost prvních ročníků 2025 {pohled === 'skupiny' ? 'podle skupin oborů' : 'podle území ORP'}
        </caption>
        <thead>
          <tr>
            <th scope="col">{pohled === 'skupiny' ? 'Skupina oborů' : 'Území (ORP)'}</th>
            <th scope="col">Obsazeno (100 % = plný plán)</th>
            <th scope="col" class="num">Nastoupilo z míst</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as a (a.klic)}
            {@const t = tridaNaplnenosti(a.naplnenost)}
            <tr>
              <th scope="row">{a.nazev}</th>
              <td>
                <span class="track">
                  <span class="bg"><span class="fill fill--{t}" style="width: {Math.min(100, (a.naplnenost ?? 0) * 100)}%"></span></span>
                  <span class="pct">{procenta(a.naplnenost)}</span>
                </span>
              </td>
              <td class="num">{a.prijato2025} z {a.zamer2025}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="legend">
        <span class="sw sw--ok"></span> obsazená místa
        <span class="sw sw--bg"></span> volná místa
        <span class="sw sw--pretlak"></span> přijali víc žáků, než plánovali
      </p>
    {:else}
      {@const list = pohled === 'volno' ? volno : plno}
      <p class="hint">
        {pohled === 'volno'
          ? 'Obory s nejvíc volnými místy (aspoň 10 plánovaných míst). Pro uchazeče šance, pro kraj signál k úpravě nabídky.'
          : 'Obory, kam loni nastoupilo víc žáků, než se plánovalo – zájem převyšuje nabídku.'}
      </p>
      <ol>
        {#each list as o (o.izo + o.kodOboru + o.forma)}
          <li>
            <button type="button" onclick={() => onselect(o.izo)}>
              <span class="obor">{o.nazevOboru}</span>
              <span class="skola">{kratce(o.skola)}{kratce(o.skola).includes(o.obec) ? '' : `, ${o.obec}`}</span>
              <Naplnenost podil={naplnenost(o)} prijato={o.prijato2025} zamer={o.zamer[2025] ?? null} />
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</section>

<style>
  .prehled {
    min-width: 0;
  }
  .title {
    margin: 0 0 4px;
    font-size: 1.5rem;
  }
  .lead {
    margin: 0 0 8px;
    max-width: 70ch;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0 12px;
  }
  .tabs button {
    font: inherit;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 4px;
    border: 1px solid var(--brand);
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  .tabs button.on {
    background: var(--brand);
    color: #fff;
  }
  .card {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 16px 20px;
    overflow-x: auto;
  }
  .hint {
    color: var(--text-muted);
    font-size: 0.92rem;
    margin: 0 0 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    font-size: 0.85rem;
    color: var(--brand-dark);
    font-weight: 500;
    padding: 8px;
    background: var(--brand-ice);
    border-bottom: 1px solid var(--line);
  }
  tbody th {
    text-align: left;
    font-weight: 400;
    color: var(--text);
    background: none;
    border-bottom: 1px solid var(--line);
    padding: 10px 8px;
  }
  .chart thead th:nth-child(2) {
    width: 45%;
  }
  @media (max-width: 640px) {
    .chart thead {
      display: none;
    }
    .chart tbody tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      border-bottom: 1px solid var(--line);
      padding: 8px 0;
    }
    .chart tbody th,
    .chart tbody td {
      border: 0;
      padding: 2px 0;
    }
    .chart tbody td.num {
      grid-column: 2;
      grid-row: 1;
      color: var(--text-muted);
      font-size: 0.88rem;
    }
    .chart tbody td:nth-child(2) {
      grid-column: 1 / -1;
    }
  }
  .track {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 22px;
  }
  .bg {
    flex: 1;
    display: block;
    height: 14px;
    background: #e3edf8;
    border-radius: 2px;
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
  }
  .fill--volno,
  .fill--ok {
    background: var(--data-1);
  }
  .fill--pretlak {
    background: var(--data-6);
  }
  .fill--na {
    background: var(--data-rest);
  }
  .pct {
    min-width: 3.2em;
    text-align: right;
    font-weight: 700;
    color: var(--brand-dark);
    white-space: nowrap;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 12px 0 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .sw {
    display: inline-block;
    width: 14px;
    height: 10px;
    border-radius: 2px;
    margin-left: 6px;
  }
  .sw--ok {
    background: var(--data-1);
  }
  .sw--bg {
    background: #e3edf8;
  }
  .sw--pretlak {
    background: var(--data-6);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  td {
    padding: 10px 8px;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  .num {
    text-align: right;
    white-space: nowrap;
  }
  ol {
    margin: 0;
    padding-left: 1.6em;
    color: var(--text-muted);
  }
  li + li {
    border-top: 1px solid var(--line);
  }
  ol button {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    text-align: left;
    font: inherit;
    background: none;
    border: 0;
    padding: 12px 4px;
    color: var(--text);
    cursor: pointer;
  }
  ol button:hover .obor {
    color: var(--brand);
    text-decoration: underline;
  }
  .obor {
    font-weight: 700;
    color: var(--brand-dark);
  }
  .skola {
    color: var(--text-muted);
    font-size: 0.92rem;
  }
</style>
