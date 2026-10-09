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
  .num strong {
    color: var(--brand-dark);
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
