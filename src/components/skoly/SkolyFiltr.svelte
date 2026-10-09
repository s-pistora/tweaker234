<script lang="ts">
  /** Filtry režimu „Kam na střední“: kde bydlím, typ studia, skupina oborů, dosah, řazení. */
  import type { AreaCode } from '../../lib/types.ts';
  import { KM_MAX, KM_MIN, type SkolyState } from '../../lib/state.ts';
  import { nazevSkupiny } from '../../lib/skoly.ts';

  interface Props {
    filtr: SkolyState;
    /** obce kraje: kód → název */
    obce: Record<AreaCode, string>;
    /** skupiny oborů, které v datech existují */
    skupiny: string[];
    onchange: (patch: Partial<SkolyState>) => void;
  }
  const { filtr, obce, skupiny, onchange }: Props = $props();

  const obceSerazene = $derived(
    Object.entries(obce).sort((a, b) => a[1].localeCompare(b[1], 'cs')),
  );
  const TYPY = [
    ['vse', 'vše'],
    ['maturita', 'maturita'],
    ['vyucni', 'výuční list'],
  ] as const;
</script>

<fieldset class="filtr" data-testid="skoly-filtr">
  <legend>&gt; KAM NA STŘEDNÍ_</legend>

  <label>
    <span>BYDLÍM V</span>
    <select
      value={filtr.domov ?? ''}
      onchange={(e) => onchange({ domov: e.currentTarget.value || null, skola: null })}
      data-testid="skoly-domov"
    >
      <option value="">– vyber obec (nebo klikni do mapy) –</option>
      {#each obceSerazene as [code, name] (code)}
        <option value={code}>{name}</option>
      {/each}
    </select>
  </label>

  <div class="row" role="radiogroup" aria-label="Typ studia">
    <span>CHCI</span>
    {#each TYPY as [v, l] (v)}
      <button
        type="button"
        role="radio"
        aria-checked={filtr.typ === v}
        class:on={filtr.typ === v}
        onclick={() => onchange({ typ: v })}
        data-testid="skoly-typ-{v}"
      >
        [{filtr.typ === v ? '■' : ' '}] {l}
      </button>
    {/each}
  </div>

  <label>
    <span>OBOR</span>
    <select value={filtr.skupina} onchange={(e) => onchange({ skupina: e.currentTarget.value })} data-testid="skoly-skupina">
      <option value="">všechny obory</option>
      {#each skupiny as g (g)}
        <option value={g}>{nazevSkupiny(g)}</option>
      {/each}
    </select>
  </label>

  <label>
    <span>DOSAH</span>
    <input
      type="range"
      min={KM_MIN}
      max={KM_MAX}
      step="5"
      value={filtr.maxKm}
      oninput={(e) => onchange({ maxKm: Number(e.currentTarget.value) })}
      aria-valuetext="{filtr.maxKm} km"
      data-testid="skoly-km"
    />
    <output>{String(filtr.maxKm).padStart(2, ' ')} km</output>
  </label>

  <div class="row" role="radiogroup" aria-label="Řazení">
    <span>ŘADIT</span>
    <button
      type="button"
      role="radio"
      aria-checked={filtr.razeni === 'vzdalenost'}
      class:on={filtr.razeni === 'vzdalenost'}
      onclick={() => onchange({ razeni: 'vzdalenost' })}>[{filtr.razeni === 'vzdalenost' ? '■' : ' '}] nejblíž</button
    >
    <button
      type="button"
      role="radio"
      aria-checked={filtr.razeni === 'volno'}
      class:on={filtr.razeni === 'volno'}
      onclick={() => onchange({ razeni: 'volno' })}>[{filtr.razeni === 'volno' ? '■' : ' '}] nejvíc volných míst</button
    >
  </div>
  <p class="note">Vzdálenost je vzdušnou čarou – jízdní řády kraj jako otevřená data nezveřejňuje.</p>
</fieldset>

<style>
  .filtr {
    border: 1px solid var(--phosphor-40);
    background: var(--bg-panel);
    margin: 0 0 10px;
    padding: 8px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  legend {
    font-family: var(--font-display);
    font-size: 1.4rem;
    color: var(--phosphor-100);
    padding: 0 4px;
  }
  label,
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    min-width: 0;
  }
  label > span,
  .row > span {
    color: var(--phosphor-60);
    width: 5.5em;
    flex: none;
  }
  select,
  button {
    background: var(--bg);
    color: var(--phosphor-100);
    border: 1px solid var(--phosphor-60);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    padding: 3px 6px;
    min-width: 0;
    max-width: 100%;
  }
  select {
    flex: 1 1 12em;
  }
  button {
    cursor: pointer;
    color: var(--amber);
    border-color: var(--amber-dim);
  }
  button.on {
    background: var(--amber-dim);
    color: var(--bg);
  }
  input[type='range'] {
    flex: 1 1 8em;
    accent-color: var(--amber);
  }
  output {
    color: var(--phosphor-100);
    white-space: pre;
    font-family: var(--font-mono);
  }
  .note {
    margin: 0;
    color: var(--phosphor-60);
    font-size: 0.8rem;
  }
</style>
