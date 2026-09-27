<script lang="ts">
  /** Modální panel „ZDROJE DAT“: celá tabulka z manifest.sources. Esc zavírá (řeší rodič) + tlačítko. */
  import type { SourceEntry } from '../lib/types.ts';

  interface Props {
    sources: SourceEntry[];
    updatedAt: string;
    onclose: () => void;
  }
  const { sources, updatedAt, onclose }: Props = $props();

  let closeBtn = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    closeBtn?.focus();
  });

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' });
  }
</script>

<div class="backdrop">
  <div class="dialog ascii-panel" role="dialog" aria-modal="true" aria-labelledby="sources-title">
    <div class="head">
      <h2 id="sources-title" class="ascii-panel__title">ZDROJE DAT</h2>
      <button type="button" bind:this={closeBtn} onclick={onclose}>[ZAVŘÍT ✕]</button>
    </div>
    <p class="meta">&gt; SNAPSHOT {fmtDate(updatedAt)} · {sources.length} zdrojů · STALE = zdroj se nepodařilo obnovit, použita poslední data</p>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">POSKYTOVATEL</th>
            <th scope="col">DATOVÁ SADA</th>
            <th scope="col">LICENCE</th>
            <th scope="col">STAŽENO</th>
            <th scope="col">PLATNOST</th>
            <th scope="col">STAV</th>
          </tr>
        </thead>
        <tbody>
          {#each sources as s (s.id)}
            <tr>
              <td>{s.provider}</td>
              <td>
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                {#if s.note}<div class="note">{s.note}</div>{/if}
              </td>
              <td>{s.license}</td>
              <td>{fmtDate(s.downloadedAt)}</td>
              <td>{s.validFor}</td>
              <td class:stale={s.status === 'stale'}>{s.status === 'stale' ? 'STALE' : 'OK'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px 12px;
    box-sizing: border-box;
    overflow-y: auto;
  }
  .dialog {
    width: min(1000px, 100%);
    border-color: var(--phosphor-60);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  button {
    background: var(--bg-panel);
    color: var(--amber);
    border: 1px solid var(--amber-dim);
    font-family: var(--font-mono);
    padding: 4px 10px;
    cursor: pointer;
  }
  .meta {
    color: var(--phosphor-60);
    font-size: 0.85rem;
  }
  .scroll {
    overflow-x: auto;
    max-width: 100%;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.85rem;
  }
  th,
  td {
    text-align: left;
    padding: 4px 8px 4px 0;
    border-bottom: 1px dotted var(--phosphor-40);
    vertical-align: top;
  }
  th {
    color: var(--phosphor-60);
    font-weight: normal;
    white-space: nowrap;
  }
  a {
    color: var(--phosphor-100);
    overflow-wrap: anywhere;
  }
  .note {
    color: var(--phosphor-60);
  }
  .stale {
    color: var(--amber);
    font-weight: bold;
  }
</style>
