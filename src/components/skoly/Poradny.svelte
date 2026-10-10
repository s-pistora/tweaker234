<script lang="ts">
  /** „Kde poradí s výběrem školy“ – pedagogicko-psychologické poradny a SPC, seřazené podle vzdálenosti. */
  import type { Poradna } from '../../lib/types.ts';
  import { vzdalenostKm } from '../../lib/skoly.ts';

  interface Props {
    poradny: Poradna[];
    domov: { lat: number; lon: number } | null;
    domovNazev?: string;
  }
  const { poradny, domov, domovNazev = '' }: Props = $props();

  const serazene = $derived(
    poradny
      .map((p) => ({ p, km: domov && p.lat !== null && p.lon !== null ? vzdalenostKm(domov.lat, domov.lon, p.lat, p.lon) : null }))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.p.typ.localeCompare(b.p.typ, 'cs')),
  );
  const ppp = $derived(serazene.filter((x) => /psychologick/i.test(x.p.typ)));
  const spc = $derived(serazene.filter((x) => !/psychologick/i.test(x.p.typ)));
  let vse = $state(false);
  const kmTxt = (km: number) => `${km < 10 ? km.toFixed(1).replace('.', ',') : km.toFixed(0)} km`;
</script>

<section class="por" aria-labelledby="por-h" data-testid="poradny">
  <h2 id="por-h">Nevíte si rady? Kde poradí s výběrem školy</h2>
  <p class="lead">
    <strong>Pedagogicko-psychologická poradna</strong> pomáhá s volbou oboru (testy zájmů a schopností) zdarma.
    {#if domovNazev}Seřazeno podle vzdálenosti od obce {domovNazev}.{/if}
  </p>
  <ul>
    {#each ppp as { p, km } (p.nazev)}
      <li>
        <div>
          <strong>{p.nazev}</strong>
          <span>{p.adresa}</span>
        </div>
        <div class="r">
          {#if km !== null}<span class="km">{kmTxt(km)}</span>{/if}
          {#if p.web}<a href={p.web} target="_blank" rel="noopener noreferrer">Web</a>{/if}
        </div>
      </li>
    {/each}
  </ul>
  <button type="button" class="tgl" onclick={() => (vse = !vse)} aria-expanded={vse}>
    {vse ? 'Skrýt' : 'Zobrazit'} speciálně pedagogická centra ({spc.length}) – pro žáky se zdravotním postižením
  </button>
  {#if vse}
    <ul>
      {#each spc as { p, km } (p.nazev)}
        <li>
          <div>
            <strong>{p.nazev}</strong>
            <span>{p.adresa}</span>
          </div>
          <div class="r">
            {#if km !== null}<span class="km">{kmTxt(km)}</span>{/if}
            {#if p.web}<a href={p.web} target="_blank" rel="noopener noreferrer">Web</a>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="src">Zdroj: Karlovarský kraj, DATAZÁPAD – Školská poradenská zařízení v Karlovarském kraji (CC0).</p>
</section>

<style>
  .por {
    margin-top: 24px;
    background: #fff;
    border: 1px solid var(--line);
    border-left: 4px solid var(--data-2);
    border-radius: 12px;
    padding: 16px 20px;
  }
  h2 {
    font-size: 1.15rem;
    margin: 0 0 6px;
  }
  .lead {
    margin: 0 0 10px;
    font-size: 0.95rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  li strong {
    display: block;
    color: var(--brand-dark);
    font-weight: 500;
  }
  li span {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .r {
    flex: none;
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .r .km {
    font-weight: 700;
    color: var(--brand);
    font-size: 0.9rem;
  }
  .r a {
    font-weight: 500;
    font-size: 0.9rem;
  }
  .tgl {
    font: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--brand);
    background: none;
    border: 0;
    padding: 10px 0;
    cursor: pointer;
    text-align: left;
  }
  .tgl:hover {
    text-decoration: underline;
  }
  .src {
    margin: 6px 0 0;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
</style>
