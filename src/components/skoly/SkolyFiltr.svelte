<script lang="ts">
  /** Filtry režimu „Kam na střední“ ve 4 očíslovaných krocích. */
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
    ['vse', 'Je mi to jedno'],
    ['maturita', 'S maturitou'],
    ['vyucni', 'S výučním listem'],
  ] as const;
</script>

<section class="filtr" aria-label="Co hledáš" data-testid="skoly-filtr">
  <div class="step">
    <label for="f-domov"><span class="n">1</span> Kde bydlíš?</label>
    <select
      id="f-domov"
      value={filtr.domov ?? ''}
      onchange={(e) => onchange({ domov: e.currentTarget.value || null, skola: null })}
      data-testid="skoly-domov"
    >
      <option value="">Vyber obec…</option>
      {#each obceSerazene as [code, name] (code)}
        <option value={code}>{name}</option>
      {/each}
    </select>
    <small>nebo klikni na obec v mapě</small>
  </div>

  <div class="step">
    <span class="lbl" id="f-typ"><span class="n">2</span> Jakou školu chceš?</span>
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
    <label for="f-obor"><span class="n">3</span> Co tě baví?</label>
    <select
      id="f-obor"
      value={filtr.skupina}
      onchange={(e) => onchange({ skupina: e.currentTarget.value })}
      data-testid="skoly-skupina"
    >
      <option value="">Všechny obory</option>
      {#each skupinySerazene as g (g)}
        <option value={g}>{nazevSkupiny(g)}</option>
      {/each}
    </select>
  </div>

  <div class="step">
    <label for="f-km"><span class="n">4</span> Jak daleko můžeš dojíždět?</label>
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
      <output for="f-km">do {filtr.maxKm} km</output>
    </div>
    <small>vzdušnou čarou</small>
  </div>
</section>

<style>
  .filtr {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--c-radius);
    box-shadow: var(--c-shadow);
    padding: 16px;
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  label,
  .lbl {
    font-weight: 600;
    color: var(--c-text);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .n {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--c-accent);
    color: #fff;
    font-size: 0.8rem;
    font-weight: 700;
    flex: none;
  }
  small {
    color: var(--c-muted);
    font-size: 0.8rem;
  }
  select {
    font: inherit;
    padding: 9px 10px;
    border: 1px solid var(--c-border);
    border-radius: 8px;
    background: #fff;
    color: var(--c-text);
    min-width: 0;
    width: 100%;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .seg button {
    font: inherit;
    font-size: 0.9rem;
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid var(--c-border);
    background: #fff;
    color: var(--c-text);
    cursor: pointer;
  }
  .seg button.on {
    background: var(--c-accent);
    border-color: var(--c-accent);
    color: #fff;
    font-weight: 600;
  }
  .range {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  input[type='range'] {
    flex: 1;
    accent-color: var(--c-accent);
    min-width: 0;
  }
  output {
    font-weight: 700;
    color: var(--c-accent);
    white-space: nowrap;
  }
  @media (max-width: 1000px) {
    .filtr {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    .filtr {
      grid-template-columns: minmax(0, 1fr);
      padding: 12px;
    }
  }
</style>
