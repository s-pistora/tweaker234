<script lang="ts">
  /** Filtr „Kam na střední“ ve 4 krocích. Formulář podle Gov.cz: popisek nad polem, nápověda pod ním. */
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

  const obceSerazene = $derived(Object.entries(obce).sort((a, b) => a[1].localeCompare(b[1], 'cs')));
  const skupinySerazene = $derived(
    [...skupiny].sort((a, b) => nazevSkupiny(a).localeCompare(nazevSkupiny(b), 'cs')),
  );
  const TYPY = [
    ['vse', 'Všechny'],
    ['maturita', 'S maturitou'],
    ['vyucni', 'S výučním listem'],
  ] as const;
</script>

<section class="filtr" aria-label="Co hledáte" data-testid="skoly-filtr">
  <div class="step">
    <label for="f-domov"><span class="n" aria-hidden="true">1</span>Kde bydlíte?</label>
    <select
      id="f-domov"
      value={filtr.domov ?? ''}
      onchange={(e) => onchange({ domov: e.currentTarget.value || null, skola: null })}
      data-testid="skoly-domov"
    >
      <option value="">Vyberte obec</option>
      {#each obceSerazene as [code, name] (code)}
        <option value={code}>{name}</option>
      {/each}
    </select>
    <small>Obec můžete vybrat i kliknutím do mapy.</small>
  </div>

  <div class="step">
    <span class="lbl" id="f-typ"><span class="n" aria-hidden="true">2</span>Jakou školu hledáte?</span>
    <div class="seg" role="radiogroup" aria-labelledby="f-typ">
      {#each TYPY as [v, l] (v)}
        <button
          type="button"
          role="radio"
          aria-checked={filtr.typ === v}
          class:on={filtr.typ === v}
          onclick={() => onchange({ typ: v })}
          data-testid="skoly-typ-{v}">{l}</button
        >
      {/each}
    </div>
  </div>

  <div class="step">
    <label for="f-obor"><span class="n" aria-hidden="true">3</span>Jaké zaměření?</label>
    <select
      id="f-obor"
      value={filtr.skupina}
      onchange={(e) => onchange({ skupina: e.currentTarget.value })}
      data-testid="skoly-skupina"
    >
      <option value="">Všechna zaměření</option>
      {#each skupinySerazene as g (g)}
        <option value={g}>{nazevSkupiny(g)}</option>
      {/each}
    </select>
    <small>Skupiny oborů podle kódu oboru.</small>
  </div>

  <div class="step">
    <label for="f-km"><span class="n" aria-hidden="true">4</span>Jak daleko můžete dojíždět?</label>
    <div class="range">
      <input
        id="f-km"
        type="range"
        min={KM_MIN}
        max={KM_MAX}
        step="5"
        value={filtr.maxKm}
        oninput={(e) => onchange({ maxKm: Number(e.currentTarget.value) })}
        aria-valuetext="{filtr.maxKm} km"
        data-testid="skoly-km"
      />
      <output for="f-km">{filtr.maxKm} km</output>
    </div>
    <small>Vzdušnou čarou. Jízdní řády kraj jako otevřená data nezveřejňuje.</small>
  </div>
</section>

<style>
  .filtr {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 20px 24px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 20px 24px;
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  label,
  .lbl {
    font-weight: 500;
    color: var(--brand-dark);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .n {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--brand);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 700;
    flex: none;
  }
  small {
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.4;
  }
  select {
    font: inherit;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid #8a94a3;
    border-radius: 4px;
    background: #fff;
    color: var(--text);
    width: 100%;
    min-width: 0;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .seg button {
    font: inherit;
    font-size: 0.95rem;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 4px;
    border: 1px solid var(--brand);
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  .seg button.on {
    background: var(--brand);
    color: #fff;
  }
  .range {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
  }
  input[type='range'] {
    flex: 1;
    accent-color: var(--brand);
    min-width: 0;
  }
  output {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--brand);
    white-space: nowrap;
    min-width: 3.5em;
    text-align: right;
  }
  @media (max-width: 1100px) {
    .filtr {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 600px) {
    .filtr {
      grid-template-columns: minmax(0, 1fr);
      padding: 16px;
    }
  }
</style>
