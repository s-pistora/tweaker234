<script lang="ts">
  /**
   * Filtr kategorie „Kam vyrazit“: bydliště + dosah, hledání, filtry přímo pro kategorii
   * (zaškrtávací štítky; uvnitř skupiny stačí jeden, mezi skupinami platí všechny) a vstupné.
   * Formulář podle Gov.cz: popisek nad polem, nápověda pod ním.
   */
  import type { AreaCode } from '../../lib/types.ts';
  import { KM_MAX, KM_MIN, type VyletyState } from '../../lib/state.ts';
  import type { KategorieDef } from '../../lib/vylety.ts';

  interface Props {
    filtr: VyletyState;
    def: KategorieDef;
    obce: Record<AreaCode, string>;
    /** kolik míst odpovídá (pro tlačítko „Zrušit filtry“) */
    pocet: number;
    onchange: (patch: Partial<VyletyState>) => void;
  }
  const { filtr, def, obce, pocet, onchange }: Props = $props();

  const obceSerazene = $derived(Object.entries(obce).sort((a, b) => a[1].localeCompare(b[1], 'cs')));
  const aktivni = $derived(filtr.tagy.length > 0 || filtr.vstup !== 'vse' || filtr.q !== '');

  function toggle(tag: string) {
    const on = filtr.tagy.includes(tag);
    onchange({ tagy: on ? filtr.tagy.filter((t) => t !== tag) : [...filtr.tagy, tag], misto: null });
  }
  const VSTUP = [
    ['vse', 'Nezáleží'],
    ['zdarma', 'Zdarma'],
    ['placene', 'Placené'],
  ] as const;
</script>

<section class="filtr" aria-label="Filtry" data-testid="vylety-filtr" data-tour="filtr">
  <div class="row">
    <div class="step">
      <label for="v-domov">Odkud vyrážíte?</label>
      <select
        id="v-domov"
        value={filtr.domov ?? ''}
        onchange={(e) => onchange({ domov: e.currentTarget.value || null })}
        data-testid="vylety-domov"
      >
        <option value="">Vyberte obec</option>
        {#each obceSerazene as [code, name] (code)}
          <option value={code}>{name}</option>
        {/each}
      </select>
      <small>Nebo klikněte na obec v mapě.</small>
    </div>

    <div class="step">
      <label for="v-km">Jak daleko?</label>
      <div class="range">
        <input
          id="v-km"
          type="range"
          min={KM_MIN}
          max={KM_MAX}
          step="5"
          value={filtr.maxKm}
          disabled={!filtr.domov}
          oninput={(e) => onchange({ maxKm: Number(e.currentTarget.value) })}
          aria-valuetext="{filtr.maxKm} km"
          data-testid="vylety-km"
        />
        <output for="v-km">{filtr.maxKm} km</output>
      </div>
      <small>{filtr.domov ? 'Vzdušnou čarou od středu obce.' : 'Vzdálenost počítáme, až vyberete obec.'}</small>
    </div>

    <div class="step">
      <label for="v-q">Hledat podle názvu</label>
      <input
        id="v-q"
        type="search"
        placeholder="např. Loket"
        value={filtr.q}
        oninput={(e) => onchange({ q: e.currentTarget.value, misto: null })}
        data-testid="vylety-q"
      />
      <small>Hledá v názvu, obci a popisu, diakritika nevadí.</small>
    </div>
  </div>

  <div class="groups">
    {#each def.filtry as g (g.id)}
      <fieldset>
        <legend>{g.label}</legend>
        <div class="chips">
          {#each g.volby as v (v.tag)}
            <button
              type="button"
              class="chip"
              class:on={filtr.tagy.includes(v.tag)}
              aria-pressed={filtr.tagy.includes(v.tag)}
              onclick={() => toggle(v.tag)}
              data-testid="chip-{v.tag}">{#if filtr.tagy.includes(v.tag)}<span aria-hidden="true">✓ </span>{/if}{v.label}</button
            >
          {/each}
        </div>
      </fieldset>
    {/each}
    {#if def.vstupne}
      <fieldset>
        <legend>Vstupné</legend>
        <div class="chips" role="radiogroup" aria-label="Vstupné">
          {#each VSTUP as [v, l] (v)}
            <button
              type="button"
              role="radio"
              class="chip"
              class:on={filtr.vstup === v}
              aria-checked={filtr.vstup === v}
              onclick={() => onchange({ vstup: v, misto: null })}
              data-testid="vstup-{v}">{l}</button
            >
          {/each}
        </div>
      </fieldset>
    {/if}
  </div>

  <div class="foot">
    <p class="count" aria-live="polite"><strong>{pocet}</strong> {pocet === 1 ? 'místo odpovídá' : pocet >= 2 && pocet <= 4 ? 'místa odpovídají' : 'míst odpovídá'} filtrům</p>
    {#if aktivni}
      <button type="button" class="reset" onclick={() => onchange({ tagy: [], vstup: 'vse', q: '', misto: null })} data-testid="vylety-reset"
        >Zrušit filtry</button
      >
    {/if}
  </div>
</section>

<style>
  .filtr {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px 24px;
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  label,
  legend {
    font-weight: 500;
    color: var(--brand-dark);
  }
  small {
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.4;
  }
  select,
  input[type='search'] {
    font: inherit;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid #8a94a3;
    border-radius: 4px;
    background: #fff;
    color: var(--text);
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
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
  input[type='range']:disabled + output {
    color: var(--text-muted);
  }
  output {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--brand);
    white-space: nowrap;
    min-width: 3.5em;
    text-align: right;
  }
  .groups {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 28px;
    border-top: 1px solid var(--line);
    padding-top: 16px;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  legend {
    padding: 0;
    margin-bottom: 8px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    font: inherit;
    font-size: 0.92rem;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--brand);
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  .chip:hover {
    background: #e3edf8;
  }
  .chip.on {
    background: var(--brand);
    color: #fff;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .count {
    margin: 0;
    color: var(--brand-dark);
  }
  .count strong {
    font-size: 1.25rem;
    color: var(--brand);
  }
  .reset {
    font: inherit;
    font-weight: 500;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 4px;
    border: 1px solid var(--brand);
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  @media (max-width: 900px) {
    .row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .row .step:last-child {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 600px) {
    .filtr {
      padding: 16px;
    }
    .row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
