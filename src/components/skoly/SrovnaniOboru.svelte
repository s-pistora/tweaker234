<script lang="ts">
  /** Srovnání 2–3 oborů vedle sebe: místa, loňská obsazenost, vzdálenost, doprava. */
  import type { Obor } from '../../lib/types.ts';
  import { TYP_LABEL, klicOboru, naplnenost, procenta } from '../../lib/skoly.ts';

  interface Props {
    obory: { obor: Obor; km: number | null }[];
    onremove: (klic: string) => void;
    onclose: () => void;
  }
  const { obory, onremove, onclose }: Props = $props();

  const kratce = (s: string) => s.replace(/,?\s*příspěvková organizace$/i, '');
  const kmTxt = (km: number | null) => (km === null ? '—' : `${km.toFixed(1).replace('.', ',')} km`);
  const web = (w: string) => (w ? (/^https?:\/\//.test(w) ? w : `https://${w}`) : '');

  const radky = $derived(
    obory.map(({ obor: o, km }) => {
      const p = naplnenost(o);
      const z25 = o.zamer[2025] ?? null;
      const z26 = o.zamer[2026] ?? 0;
      return { o, km, p, z25, z26, volno: z25 !== null && o.prijato2025 !== null ? z25 - o.prijato2025 : null };
    }),
  );
  // nejlepší hodnota v řádku (jen když je co porovnávat)
  const min = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length >= 2 && new Set(v).size > 1 ? Math.min(...v) : null;
  };
  const max = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length >= 2 && new Set(v).size > 1 ? Math.max(...v) : null;
  };
  const nejbliz = $derived(min(radky.map((r) => r.km)));
  const nejvicMist = $derived(max(radky.map((r) => r.z26)));
  const nejmeneObsazeno = $derived(min(radky.map((r) => r.p)));
  const nejvicZastavek = $derived(max(radky.map((r) => r.o.zastavky500m)));

  let closeBtn = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    closeBtn?.focus();
  });
</script>

<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="srovnani-h" data-testid="srovnani">
  <header>
    <div>
      <p class="kicker">Kam na střední</p>
      <h2 id="srovnani-h">Srovnání oborů</h2>
    </div>
    <button type="button" class="x" bind:this={closeBtn} onclick={onclose} aria-label="Zavřít srovnání">✕</button>
  </header>
  {#if obory.length < 2}
    <p class="hint">Přidejte ještě aspoň jeden obor tlačítkem „Porovnat“ u oboru v seznamu nebo v detailu školy.</p>
  {/if}
  <div class="scroll">
    <table>
      <caption class="sr-only">Srovnání vybraných oborů</caption>
      <thead>
        <tr>
          <td></td>
          {#each radky as r (klicOboru(r.o))}
            <th scope="col">
              <span class="n">{r.o.nazevOboru}</span>
              <span class="s">{kratce(r.o.skola)}</span>
              <button type="button" class="rm" onclick={() => onremove(klicOboru(r.o))} aria-label="Odebrat {r.o.nazevOboru} ze srovnání"
                >Odebrat</button
              >
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Obec</th>
          {#each radky as r (klicOboru(r.o))}<td>{r.o.obec}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Vzdálenost od domova</th>
          {#each radky as r (klicOboru(r.o))}<td class:best={r.km !== null && r.km === nejbliz}>{kmTxt(r.km)}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Zakončení</th>
          {#each radky as r (klicOboru(r.o))}<td>{TYP_LABEL[r.o.typ]}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Délka a forma</th>
          {#each radky as r (klicOboru(r.o))}<td>{r.o.delka} · {r.o.forma}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Míst v 1. ročníku 2026/27</th>
          {#each radky as r (klicOboru(r.o))}<td class:best={r.z26 === nejvicMist}>{r.z26}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Loni obsazeno</th>
          {#each radky as r (klicOboru(r.o))}
            <td class:best={r.p !== null && r.p === nejmeneObsazeno}>
              {#if r.p === null}nový obor / bez údaje{:else}{procenta(r.p)} <small>({r.o.prijato2025} z {r.z25})</small>{/if}
            </td>
          {/each}
        </tr>
        <tr>
          <th scope="row">Loni zůstalo volných míst</th>
          {#each radky as r (klicOboru(r.o))}<td>{r.volno === null ? '—' : Math.max(0, r.volno)}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Vývoj míst 2024 → 2026</th>
          {#each radky as r (klicOboru(r.o))}
            <td>{r.o.zamer[2024] ?? '—'} → {r.o.zamer[2025] ?? '—'} → {r.z26}</td>
          {/each}
        </tr>
        <tr>
          <th scope="row">Zastávky do 500 m</th>
          {#each radky as r (klicOboru(r.o))}<td class:best={r.o.zastavky500m === nejvicZastavek}>{r.o.zastavky500m}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Web školy</th>
          {#each radky as r (klicOboru(r.o))}
            <td>{#if web(r.o.web)}<a href={web(r.o.web)} target="_blank" rel="noopener noreferrer">Otevřít web</a>{:else}—{/if}</td>
          {/each}
        </tr>
      </tbody>
    </table>
  </div>
  <p class="foot">
    <span class="sw" aria-hidden="true"></span> Zvýrazněná je nejvýhodnější hodnota v řádku (nejblíž, nejvíc míst, nejnižší
    obsazenost, nejvíc zastávek). Nižší loňská obsazenost znamená větší šanci na přijetí. Vzdálenost je vzdušnou čarou.
  </p>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    z-index: 30;
  }
  .dlg {
    position: fixed;
    z-index: 31;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(960px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 20px 48px rgba(12, 24, 56, 0.25);
    padding: 20px 22px;
    box-sizing: border-box;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .kicker {
    margin: 0;
    font-size: 0.85rem;
    color: var(--brand);
    font-weight: 500;
  }
  h2 {
    margin: 2px 0 12px;
    font-size: 1.4rem;
  }
  .x {
    font: inherit;
    min-width: 44px;
    min-height: 44px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .hint {
    background: var(--brand-ice);
    padding: 10px 14px;
    border-radius: 8px;
    margin: 0 0 12px;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 520px;
  }
  thead th {
    text-align: left;
    vertical-align: top;
    padding: 10px;
    background: var(--brand-ice);
    border-bottom: 2px solid var(--brand);
  }
  .n {
    display: block;
    font-weight: 700;
    color: var(--brand-dark);
  }
  .s {
    display: block;
    font-size: 0.85rem;
    color: var(--text-muted);
    font-weight: 400;
  }
  .rm {
    font: inherit;
    font-size: 0.85rem;
    margin-top: 6px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  tbody th {
    text-align: left;
    font-weight: 500;
    color: var(--brand-dark);
    font-size: 0.9rem;
    padding: 10px;
    border-bottom: 1px solid var(--line);
    width: 26%;
  }
  td {
    padding: 10px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  td small {
    color: var(--text-muted);
  }
  td.best {
    background: #e4f3ea;
    font-weight: 700;
  }
  .foot {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 12px 0 0;
  }
  .sw {
    display: inline-block;
    width: 14px;
    height: 10px;
    border-radius: 2px;
    background: #bfe3cc;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
