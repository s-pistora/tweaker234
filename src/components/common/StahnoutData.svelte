<script lang="ts">
  /**
   * Tlačítko „Stáhnout data (CSV)“ pro aktuálně zobrazený (vyfiltrovaný) seznam + odkazy na
   * zdrojové datové sady v DATAZÁPADu – ať jde data dál použít.
   */
  import { stahni, type Radek } from '../../lib/csv.ts';

  interface Props {
    nazev: string;
    /** líně – řádky se sestaví až po kliknutí */
    radky: () => Radek[];
    pocet?: number;
    zdroje?: { title: string; url: string }[];
  }
  const { nazev, radky, pocet, zdroje = [] }: Props = $props();

  let stav = $state('');
  function klik() {
    const r = radky();
    stav = stahni(nazev, r) ? `Staženo ${r.length} řádků` : 'Stažení se nepodařilo';
    setTimeout(() => (stav = ''), 2500);
  }
  const pl = (n: number) => (n === 1 ? 'řádek' : n >= 2 && n <= 4 ? 'řádky' : 'řádků');
</script>

<div class="dl" data-testid="stahnout-data">
  <button type="button" class="btn-secondary" onclick={klik}>
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M12 3v12M7 10l5 5 5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg
    >
    Stáhnout data (CSV{pocet !== undefined ? `, ${pocet} ${pl(pocet)}` : ''})
  </button>
  {#if stav}<span class="st" role="status">{stav}</span>{/if}
  {#if zdroje.length}
    <span class="src">
      Zdroj:
      {#each zdroje as z, i (z.url)}<a href={z.url} target="_blank" rel="noopener noreferrer">{z.title}</a
        >{i < zdroje.length - 1 ? ', ' : ''}{/each}
    </span>
  {/if}
</div>

<style>
  .dl {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    margin: 16px 0 0;
  }
  .dl button {
    min-height: 40px;
    font-size: 0.92rem;
  }
  .st {
    font-size: 0.85rem;
    color: var(--st-volno);
    font-weight: 500;
  }
  .src {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
</style>
