<script lang="ts">
  /**
   * Přehled pro kraj (veřejná správa): kolik míst se plánovalo a kolik žáků nastoupilo,
   * podle oborů a území, a kde je nejvíc volno / přetlak.
   */
  import type { AreaCode, Obor } from '../../lib/types.ts';
  import { agreguj, nazevSkupiny, naplnenost, oboryPodleNaplnenosti, procenta } from '../../lib/skoly.ts';
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

  const celkem = $derived(agreguj(obory, () => 'kraj', () => 'Karlovarský kraj')[0]);
  const skupiny = $derived(agreguj(obory, (o) => o.skupina, nazevSkupiny));
  const orp = $derived(agreguj(obory, (o) => o.orp, (k) => names[k] ?? `ORP ${k}`));
  const volno = $derived(oboryPodleNaplnenosti(obory, 'nejmene', 10));
  const plno = $derived(oboryPodleNaplnenosti(obory, 'nejvice', 10));
  const volnaMista = $derived(celkem ? Math.max(0, celkem.zamer2025 - celkem.prijato2025) : 0);
  const fmt = (n: number) => new Intl.NumberFormat('cs-CZ').format(n);

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
  {#if celkem}
    <div class="tiles">
      <div class="tile"><span class="v">{fmt(celkem.zamer2025)}</span><span class="l">plánovaných míst v 1. ročnících (2025)</span></div>
      <div class="tile"><span class="v">{fmt(celkem.prijato2025)}</span><span class="l">žáků opravdu nastoupilo</span></div>
      <div class="tile tile--good"><span class="v">{fmt(volnaMista)}</span><span class="l">míst zůstalo volných ({procenta(celkem.naplnenost === null ? null : 1 - celkem.naplnenost)})</span></div>
      <div class="tile"><span class="v">{fmt(celkem.zamer2026)}</span><span class="l">míst školy plánují na 2026/27</span></div>
    </div>
  {/if}

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
      <table>
        <thead>
          <tr><th>{pohled === 'skupiny' ? 'Skupina oborů' : 'Území (ORP)'}</th><th>Obsazenost</th><th class="num">Nastoupilo / míst</th></tr>
        </thead>
        <tbody>
          {#each rows as a (a.klic)}
            <tr>
              <td>{a.nazev}</td>
              <td><Naplnenost podil={a.naplnenost} compact /></td>
              <td class="num"><strong>{procenta(a.naplnenost)}</strong> · {a.prijato2025}/{a.zamer2025}</td>
            </tr>
          {/each}
        </tbody>
      </table>
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
              <span class="skola">{kratce(o.skola)}, {o.obec}</span>
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
    color: var(--c-text);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .tile {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--c-radius);
    box-shadow: var(--c-shadow);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
  }
  .tile .v {
    font-size: 1.8rem;
    font-weight: 800;
  }
  .tile--good .v {
    color: var(--c-good);
  }
  .tile .l {
    color: var(--c-muted);
    font-size: 0.85rem;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 18px 0 10px;
  }
  .tabs button {
    font: inherit;
    font-size: 0.9rem;
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid var(--c-border);
    background: #fff;
    color: var(--c-text);
    cursor: pointer;
  }
  .tabs button.on {
    background: var(--c-text);
    border-color: var(--c-text);
    color: #fff;
  }
  .card {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--c-radius);
    box-shadow: var(--c-shadow);
    padding: 12px 16px;
    overflow-x: auto;
  }
  .hint {
    color: var(--c-muted);
    font-size: 0.88rem;
    margin: 4px 0 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
  }
  th {
    text-align: left;
    font-size: 0.8rem;
    color: var(--c-muted);
    font-weight: 600;
    padding: 6px 8px;
    border-bottom: 1px solid var(--c-border);
  }
  td {
    padding: 8px;
    border-bottom: 1px solid var(--c-border);
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
    padding-left: 1.4em;
  }
  li + li {
    border-top: 1px solid var(--c-border);
  }
  ol button {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    text-align: left;
    font: inherit;
    background: none;
    border: 0;
    padding: 10px 4px;
    color: var(--c-text);
    cursor: pointer;
  }
  ol button:hover {
    background: var(--bg);
  }
  .obor {
    font-weight: 700;
  }
  .skola {
    color: var(--c-muted);
    font-size: 0.88rem;
  }
  @media (max-width: 900px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
