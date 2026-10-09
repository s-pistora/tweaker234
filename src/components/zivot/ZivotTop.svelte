<script lang="ts">
  /** TOP 10 obcí podle skóre; klik otevře detail obce. */
  import type { AreaCode } from '../../lib/types.ts';
  import type { PoradiObce } from '../../lib/zivot.ts';

  interface Props {
    poradi: PoradiObce[];
    names: Record<AreaCode, string>;
    /** obec → název ORP */
    orp: Record<AreaCode, string>;
    selected: AreaCode | null;
    onselect: (code: AreaCode) => void;
  }
  const { poradi, names, orp, selected, onselect }: Props = $props();
  const top = $derived(poradi.slice(0, 10));
</script>

<section class="top" aria-labelledby="zt-h" data-testid="zivot-top">
  <h2 id="zt-h">Nejlépe vychází</h2>
  {#if top.length}
    <p class="hint">TOP 10 ze {poradi.length} obcí podle vašeho výběru.</p>
    <ol>
      {#each top as r (r.code)}
        {@const s = Math.round(r.score)}
        <li>
          <button
            type="button"
            class:sel={selected === r.code}
            aria-current={selected === r.code ? 'true' : undefined}
            aria-label="{r.rank}. {names[r.code] ?? r.code}, skóre {s} ze 100{orp[r.code] ? `, ORP ${orp[r.code]}` : ''}"
            onclick={() => onselect(r.code)}
            data-testid="zt-{r.code}"
          >
            <span class="rank" aria-hidden="true">{r.rank}.</span>
            <span class="name" aria-hidden="true">
              {names[r.code] ?? r.code}
              {#if orp[r.code]}<small>ORP {orp[r.code]}</small>{/if}
            </span>
            <span class="val" aria-hidden="true">
              <span class="bar"><span style="width: {s}%"></span></span>
              <strong>{s}</strong><small>/100</small>
            </span>
          </button>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="hint">Vyberte aspoň jeden požadavek a uvidíte obce, které vycházejí nejlépe.</p>
  {/if}
</section>

<style>
  .top {
    background: var(--bg-panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 16px 18px;
    min-width: 0;
    color: var(--brand-dark);
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .hint {
    margin: 2px 0 10px;
    font-size: 0.88rem;
    color: var(--text-muted);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  button {
    font: inherit;
    width: 100%;
    min-height: 44px;
    display: grid;
    grid-template-columns: 2.2em minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg-panel);
    color: var(--brand-dark);
    text-align: left;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--brand);
  }
  button.sel {
    border-color: var(--brand-dark);
    background: var(--brand-ice);
    box-shadow: inset 4px 0 0 var(--accent);
  }
  button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .rank {
    font-weight: 700;
    color: var(--brand);
    font-variant-numeric: tabular-nums;
  }
  .name {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .name small {
    font-weight: 400;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .val {
    display: flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }
  .val small {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .bar {
    width: 56px;
    height: 8px;
    border-radius: 4px;
    background: var(--line);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--data-1);
  }
  @media (max-width: 560px) {
    .bar {
      width: 36px;
    }
  }
</style>
