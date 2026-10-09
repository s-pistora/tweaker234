<script lang="ts">
  /**
   * Výběr požadavků „Na čem vám záleží?“: řádky po skupinách, u zvoleného
   * přepínač důležitosti (váha 1/2) a „Ukázat na mapě“ (body požadavku).
   */
  import { POZADAVKY, SKUPINY, type Dulezitost } from '../../lib/zivot.ts';

  interface Props {
    pozadavky: Record<string, Dulezitost>;
    ukaz: string | null;
    /** počet bodů požadavku (0 / chybí = nic k ukázání na mapě) */
    pocetBodu: Record<string, number>;
    onchange: (pozadavky: Record<string, Dulezitost>) => void;
    onukaz: (id: string | null) => void;
    ondoporuceny: () => void;
  }
  const { pozadavky, ukaz, pocetBodu, onchange, onukaz, ondoporuceny }: Props = $props();

  const pocet = $derived(Object.keys(pozadavky).length);

  function prepni(id: string) {
    const next = { ...pozadavky };
    if (id in next) delete next[id];
    else next[id] = 1;
    onchange(next);
  }
  function dulezitost(id: string, w: Dulezitost) {
    onchange({ ...pozadavky, [id]: w });
  }
</script>

<section class="panel" aria-labelledby="zp-h" data-tour="zivot-panel" data-testid="zivot-panel">
  <header class="head">
    <h2 id="zp-h">Na čem vám záleží?</h2>
    <p class="count" aria-live="polite" data-testid="zivot-pocet">
      <strong>{pocet}</strong> z {POZADAVKY.length} vybráno
    </p>
    <div class="acts">
      <button type="button" class="btn" onclick={ondoporuceny} data-testid="zivot-doporuceny">Doporučený výběr</button>
      <button type="button" class="btn btn--ghost" onclick={() => onchange({})} disabled={!pocet} data-testid="zivot-reset"
        >Zrušit vše</button
      >
    </div>
  </header>

  {#each SKUPINY as sk (sk)}
    <fieldset>
      <legend>{sk}</legend>
      <ul>
        {#each POZADAVKY.filter((p) => p.skupina === sk) as p (p.id)}
          {@const on = p.id in pozadavky}
          {@const body = pocetBodu[p.id] ?? 0}
          <li class:on>
            <label class="row">
              <input type="checkbox" checked={on} onchange={() => prepni(p.id)} data-testid="zp-{p.id}" />
              <span class="txt">
                <span class="lbl">{p.label}</span>
                <small>{p.popis}</small>
              </span>
            </label>
            {#if on || body}
              <div class="sub">
                {#if on}
                  <div class="seg" role="group" aria-label="Důležitost: {p.label}">
                    <button
                      type="button"
                      aria-pressed={pozadavky[p.id] === 1}
                      onclick={() => dulezitost(p.id, 1)}
                      data-testid="zd-{p.id}-1">Důležité</button
                    >
                    <button
                      type="button"
                      aria-pressed={pozadavky[p.id] === 2}
                      onclick={() => dulezitost(p.id, 2)}
                      data-testid="zd-{p.id}-2">Velmi důležité</button
                    >
                  </div>
                {/if}
                {#if body}
                  <button
                    type="button"
                    class="show"
                    aria-pressed={ukaz === p.id}
                    onclick={() => onukaz(ukaz === p.id ? null : p.id)}
                    data-testid="zu-{p.id}"
                  >
                    <span class="dot" style="background: {p.barva ?? 'var(--brand)'}" aria-hidden="true"></span>
                    {ukaz === p.id ? 'Skrýt z mapy' : 'Ukázat na mapě'}
                  </button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </fieldset>
  {/each}
</section>

<style>
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 18px 18px 8px;
    min-width: 0;
    color: var(--brand-dark);
  }
  .head h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  .count {
    margin: 2px 0 10px;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .count strong {
    color: var(--brand);
    font-size: 1.05rem;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
  }
  .btn {
    font: inherit;
    font-weight: 500;
    font-size: 0.92rem;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 4px;
    border: 1px solid var(--brand);
    background: var(--brand);
    color: var(--bg-panel);
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    background: var(--brand-hover);
  }
  .btn--ghost {
    background: var(--bg-panel);
    color: var(--brand);
  }
  .btn--ghost:hover:not(:disabled) {
    background: var(--brand-ice);
  }
  .btn:disabled {
    border-color: var(--line-strong);
    color: var(--text-muted);
    background: var(--bg-panel);
    cursor: not-allowed;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  legend {
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brand);
    padding: 14px 0 6px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 2px 10px;
  }
  li.on {
    border-color: var(--brand-light);
    background: var(--brand-ice);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-height: 44px;
    padding: 6px 0;
    cursor: pointer;
    box-sizing: border-box;
  }
  .row input {
    flex: none;
    width: 20px;
    height: 20px;
    margin: 2px 0 0;
    accent-color: var(--brand);
  }
  .row input:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .txt {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .lbl {
    font-weight: 500;
  }
  small {
    color: var(--text-muted);
    font-size: 0.82rem;
    line-height: 1.35;
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 0 8px 30px;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    overflow: hidden;
  }
  .seg button,
  .show {
    font: inherit;
    font-size: 0.85rem;
    min-height: 44px;
    padding: 0 10px;
    border: 0;
    background: var(--bg-panel);
    color: var(--brand-dark);
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid var(--line-strong);
  }
  .seg button[aria-pressed='true'] {
    background: var(--brand);
    color: var(--bg-panel);
  }
  .show {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    color: var(--brand);
  }
  .show[aria-pressed='true'] {
    border-color: var(--brand-dark);
    background: var(--brand-dark);
    color: var(--bg-panel);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--bg-panel);
  }
  .btn:focus-visible,
  .seg button:focus-visible,
  .show:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    position: relative;
  }
  @media (max-width: 560px) {
    .panel {
      padding: 14px 12px 6px;
    }
    .sub {
      padding-left: 0;
    }
  }
</style>
