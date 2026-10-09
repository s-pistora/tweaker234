<script lang="ts">
  /**
   * Přehled pro kraj (veřejná správa): naplněnost oborů podle skupin a ORP,
   * TOP poloprázdné a přeplněné obory. Data = loni přijatí vs. plán 2025/26.
   */
  import type { AreaCode, Obor } from '../../lib/types.ts';
  import {
    agreguj,
    asciiBar,
    nazevSkupiny,
    naplnenost,
    oboryPodleNaplnenosti,
    procenta,
    tridaNaplnenosti,
  } from '../../lib/skoly.ts';

  interface Props {
    obory: Obor[];
    /** kód ORP → název */
    names: Record<AreaCode, string>;
    onselect: (izo: string) => void;
  }
  const { obory, names, onselect }: Props = $props();

  type Pohled = 'skupiny' | 'orp' | 'volno' | 'plno';
  let pohled = $state<Pohled>('skupiny');

  const celkem = $derived(agreguj(obory, () => 'kraj', () => 'Karlovarský kraj')[0]);
  const skupiny = $derived(agreguj(obory, (o) => o.skupina, nazevSkupiny));
  const orp = $derived(agreguj(obory, (o) => o.orp, (k) => names[k] ?? `ORP ${k}`));
  const volno = $derived(oboryPodleNaplnenosti(obory, 'nejmene', 10));
  const plno = $derived(oboryPodleNaplnenosti(obory, 'nejvice', 10));
  const volnaMista = $derived(celkem ? Math.max(0, celkem.zamer2025 - celkem.prijato2025) : 0);

  const TABS: [Pohled, string][] = [
    ['skupiny', 'OBORY'],
    ['orp', 'ÚZEMÍ'],
    ['volno', 'POLOPRÁZDNÉ'],
    ['plno', 'PŘETLAK'],
  ];

  function kratce(skola: string): string {
    return skola.replace(/,?\s*příspěvková organizace$/i, '');
  }
</script>

<section class="ascii-panel prehled" aria-label="Přehled pro kraj" data-testid="kraj-prehled">
  <h2 class="ascii-panel__title">&gt; PŘEHLED PRO KRAJ_</h2>
  {#if celkem}
    <p>
      Střední školy v kraji loni plánovaly <strong>{celkem.zamer2025}</strong> míst v prvních ročnících a
      nastoupilo <strong>{celkem.prijato2025}</strong> žáků ({procenta(celkem.naplnenost)}). Zůstalo tedy
      zhruba <strong>{volnaMista}</strong> volných míst. Na 2026/27 školy plánují <strong>{celkem.zamer2026}</strong> míst.
    </p>
  {/if}

  <div class="tabs" role="tablist" aria-label="Pohled přehledu">
    {#each TABS as [id, label] (id)}
      <button
        type="button"
        role="tab"
        aria-selected={pohled === id}
        class:on={pohled === id}
        onclick={() => (pohled = id)}
        data-testid="prehled-{id}">[{label}]</button
      >
    {/each}
  </div>

  {#if pohled === 'skupiny' || pohled === 'orp'}
    {@const rows = pohled === 'skupiny' ? skupiny : orp}
    <p class="hint">Seřazeno od nejméně obsazených. Číslo = přijatí / plánovaná místa (2025).</p>
    <table>
      <tbody>
        {#each rows as a (a.klic)}
          <tr>
            <th scope="row">{a.nazev}</th>
            <td class="bar bar--{tridaNaplnenosti(a.naplnenost)}">{asciiBar(a.naplnenost, 10)}</td>
            <td class="num">{procenta(a.naplnenost)}</td>
            <td class="num dim">{a.prijato2025}/{a.zamer2025}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    {@const list = pohled === 'volno' ? volno : plno}
    <p class="hint">
      {pohled === 'volno'
        ? 'Obory s nejvíc volnými místy (aspoň 10 plánovaných míst) – kandidáti na úpravu nabídky nebo větší propagaci.'
        : 'Obory, kam loni nastoupilo víc žáků, než se plánovalo – zájem převyšuje nabídku.'}
    </p>
    <ol>
      {#each list as o (o.izo + o.kodOboru + o.forma)}
        {@const n = naplnenost(o)}
        <li>
          <button type="button" onclick={() => onselect(o.izo)}>
            <span class="obor">{o.nazevOboru}</span>
            <span class="dim">{kratce(o.skola)}, {o.obec}</span>
            <span class="bar bar--{tridaNaplnenosti(n)}">{asciiBar(n, 10)} {procenta(n)} ({o.prijato2025}/{o.zamer[2025]})</span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
  <p class="hint">Vyber obec, kde bydlíš (v nabídce nebo kliknutím do mapy), a uvidíš školy v dosahu.</p>
</section>

<style>
  .prehled {
    min-width: 0;
  }
  p {
    margin: 4px 0;
    color: var(--phosphor-80);
  }
  strong {
    color: var(--phosphor-100);
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 10px 0 4px;
  }
  .tabs button,
  ol button {
    font-family: var(--font-mono);
    cursor: pointer;
  }
  .tabs button {
    background: var(--bg);
    color: var(--amber);
    border: 1px solid var(--amber-dim);
    padding: 2px 6px;
  }
  .tabs button.on {
    background: var(--amber-dim);
    color: var(--bg);
  }
  .hint,
  .dim {
    color: var(--phosphor-60);
    font-size: 0.82rem;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.85rem;
  }
  th {
    text-align: left;
    font-weight: normal;
    color: var(--phosphor-80);
    padding: 2px 8px 2px 0;
  }
  td {
    padding: 2px 4px;
  }
  .num {
    text-align: right;
    white-space: nowrap;
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
  ol {
    margin: 4px 0;
    padding-left: 1.6em;
    color: var(--phosphor-60);
  }
  ol button {
    display: flex;
    flex-direction: column;
    text-align: left;
    background: none;
    border: 0;
    padding: 4px 0;
    color: var(--phosphor-80);
    font-size: 0.85rem;
    width: 100%;
  }
  ol button:hover {
    background: rgba(51, 255, 102, 0.08);
  }
  .obor {
    color: var(--phosphor-100);
  }
</style>
