<script lang="ts">
  /**
   * Režim „Úřady“ – „Kam s tím na úřad?“. Výběr obce → příslušné úřady s kontakty
   * (obecní, ORP, stavební, živnostenský, matrika). Životní situace zvýrazní správný úřad.
   */
  import type { AreaCode } from '../../lib/types.ts';
  import type { UradyState } from '../../lib/state.ts';
  import {
    SITUACE,
    URAD_NAZEV,
    matrikaProObec,
    odkazMapy,
    uradOrp,
    uredniHodiny,
    type Kontakt,
    type UradTyp,
    type UradyFile,
  } from '../../lib/urady.ts';

  interface Props {
    data: UradyFile;
    stav: UradyState;
    /** středy obcí (pro nejbližší matriku) */
    stredy: Record<AreaCode, { lat: number; lon: number }>;
    onchange: (patch: Partial<UradyState>) => void;
  }
  const { data, stav, stredy, onchange }: Props = $props();

  const obec = $derived(stav.obec ? (data.obce.find((o) => o.kod === stav.obec) ?? null) : null);
  const situace = $derived(SITUACE.find((s) => s.id === stav.situace) ?? null);
  const orp = $derived(obec ? uradOrp(obec, data.obce) : null);
  const jeSidloOrp = $derived(!!obec && obec.nazev === obec.orp);
  const matrika = $derived(obec ? matrikaProObec(obec.nazev, stredy[obec.kod] ?? null, data.matriky) : null);

  interface Karta {
    typ: UradTyp;
    nadpis: string;
    k: Kontakt;
    pozn?: string;
    extra?: string[];
    /** úřední hodiny po řádcích */
    hodiny?: string[];
  }
  const karty = $derived.by((): Karta[] => {
    if (!obec) return [];
    const out: Karta[] = [];
    out.push({
      typ: 'obecni',
      nadpis: URAD_NAZEV.obecni,
      k: obec.obecniUrad,
      pozn: jeSidloOrp ? 'Vaše obec je zároveň obcí s rozšířenou působností – vydává i občanky a pasy.' : undefined,
    });
    if (orp && !jeSidloOrp) {
      out.push({ typ: 'orp', nadpis: `${URAD_NAZEV.orp} (${obec.orp})`, k: orp, pozn: 'Občanské průkazy, pasy a další agenda pro celé ORP.' });
    }
    if (matrika) {
      out.push({
        typ: 'matrika',
        nadpis: URAD_NAZEV.matrika,
        k: matrika.matrika,
        hodiny: uredniHodiny(matrika.matrika.dny, matrika.matrika.hodiny),
        pozn: matrika.vObci
          ? undefined
          : `Ve vaší obci matrika není, tohle je nejbližší (${(matrika.km ?? 0).toFixed(1).replace('.', ',')} km vzdušnou čarou). Data kraje neříkají, pod kterou matriku obec spadá – ověřte si to na obecním úřadě.`,
      });
    }
    for (const s of obec.stavebni) {
      out.push({
        typ: 'stavebni',
        nadpis: URAD_NAZEV.stavebni,
        k: s,
        extra: [`Pro katastrální území: ${s.katastry.join(', ')}`],
      });
    }
    if (obec.zivnostensky) out.push({ typ: 'zivnostensky', nadpis: URAD_NAZEV.zivnostensky, k: obec.zivnostensky });
    return out;
  });

  const obceSerazene = $derived([...data.obce].sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs')));

  let zkopirovano = $state('');
  async function kopiruj(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      zkopirovano = text;
      setTimeout(() => (zkopirovano = ''), 1800);
    } catch {
      /* schránka nedostupná – nic */
    }
  }

  function vyberSituaci(id: string) {
    onchange({ situace: stav.situace === id ? '' : id });
    // posun na kartu správného úřadu
    setTimeout(() => {
      const typ = SITUACE.find((s) => s.id === id)?.urad;
      const el = typ ? document.querySelector<HTMLElement>(`[data-urad="${typ}"]`) : null;
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, 50);
  }
</script>

<section class="hero">
  <div class="wrap">
    <p class="kicker">Úřady · Karlovarský kraj</p>
    <h1>Kam s tím na úřad?</h1>
    <p class="perex">
      Vyberte obec a ukážeme, který úřad je pro ni příslušný – obecní úřad, matrika, stavební a
      živnostenský úřad i úřad obce s rozšířenou působností. S telefonem, e-mailem a datovou schránkou.
    </p>
    <label class="pick">
      <span>Ve které obci bydlíte nebo vyřizujete?</span>
      <select
        value={stav.obec ?? ''}
        onchange={(e) => onchange({ obec: e.currentTarget.value || null })}
        data-testid="urady-obec"
      >
        <option value="">Vyberte obec</option>
        {#each obceSerazene as o (o.kod)}
          <option value={o.kod}>{o.nazev}</option>
        {/each}
      </select>
    </label>
  </div>
</section>

<main class="wrap main">
  <section aria-labelledby="sit-h">
    <h2 id="sit-h">Co potřebujete vyřídit?</h2>
    <div class="sit" role="group" aria-label="Životní situace">
      {#each SITUACE as s (s.id)}
        <button
          type="button"
          class:on={stav.situace === s.id}
          aria-pressed={stav.situace === s.id}
          onclick={() => vyberSituaci(s.id)}
          data-testid="situace-{s.id}"
        >
          <strong>{s.nazev}</strong>
          <span>{s.priklady}</span>
        </button>
      {/each}
    </div>
    {#if situace}
      <p class="proc" data-testid="situace-proc">
        <strong>{URAD_NAZEV[situace.urad]}:</strong>
        {situace.proc}
      </p>
    {/if}
  </section>

  {#if !obec}
    <p class="empty">Vyberte nahoře obec – ukážeme úřady i s kontakty.</p>
  {:else}
    <h2 class="list-h">Úřady pro obec {obec.nazev}</h2>
    {#if obec.poznamky.length}
      <ul class="pozn" aria-label="Upozornění k datům">
        {#each obec.poznamky as p (p)}
          <li>{p}</li>
        {/each}
      </ul>
    {/if}
    <div class="grid" data-testid="urady-karty">
      {#each karty as c, i (c.typ + i)}
        <article
          class="card"
          class:hl={situace?.urad === c.typ}
          data-urad={c.typ}
          data-testid="urad-{c.typ}"
        >
          <p class="card__typ">{c.nadpis}</p>
          <h3>{c.k.nazev}</h3>
          {#if c.k.umisteni && !c.k.nazev.includes(c.k.umisteni)}<p class="card__sub">{c.k.umisteni}</p>{/if}
          {#if c.k.odbor && c.k.odbor !== 'Matrika'}<p class="card__sub">{c.k.odbor}</p>{/if}
          {#each c.extra ?? [] as e (e)}<p class="card__extra">{e}</p>{/each}
          <dl>
            {#if c.hodiny?.length}
              <dt>Úřední hodiny</dt>
              <dd class="hod">{#each c.hodiny as h (h)}<span>{h}</span>{/each}</dd>
            {/if}
            {#if c.k.adresa}<dt>Adresa</dt><dd>{c.k.adresa}</dd>{/if}
            {#if c.k.tel}<dt>Telefon</dt><dd><a href="tel:{c.k.tel.replace(/\s/g, '')}">{c.k.tel}</a></dd>{/if}
            {#if c.k.email}<dt>E-mail</dt><dd><a href="mailto:{c.k.email}">{c.k.email}</a></dd>{/if}
            {#if c.k.datovka}
              <dt>Datová schránka</dt>
              <dd>
                <code>{c.k.datovka}</code>
                <button type="button" class="copy" onclick={() => kopiruj(c.k.datovka)}>
                  {zkopirovano === c.k.datovka ? 'Zkopírováno' : 'Kopírovat'}
                </button>
              </dd>
            {/if}
          </dl>
          <div class="links">
            {#if c.k.web}<a class="btn-secondary" href={c.k.web} target="_blank" rel="noopener noreferrer">Web úřadu</a>{/if}
            <a class="btn-secondary" href={odkazMapy(c.k)} target="_blank" rel="noopener noreferrer">Ukázat na Mapy.cz</a>
          </div>
          {#if c.pozn}<p class="card__pozn">{c.pozn}</p>{/if}
        </article>
      {/each}
    </div>
  {/if}

  <p class="foot">
    Zdroj: Karlovarský kraj, DATAZÁPAD – stavební úřady podle katastrálních území, obecní živnostenské úřady, matriční
    úřady a seznam obcí (CC0). Před návštěvou si ověřte aktuální úřední hodiny na webu úřadu.
  </p>
</main>

<style>
  .wrap {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    box-sizing: border-box;
  }
  .hero {
    background: var(--brand-ice);
    border-bottom: 1px solid var(--line);
    padding: 32px 0 28px;
  }
  .kicker {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brand);
  }
  h1 {
    font-size: clamp(2rem, 4.5vw, 2.5rem);
    line-height: 1.2;
    margin: 6px 0 8px;
  }
  .perex {
    margin: 0 0 18px;
    max-width: 68ch;
    font-size: 1.1rem;
    line-height: 1.5;
  }
  .pick {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 420px;
  }
  .pick span {
    font-weight: 500;
    color: var(--brand-dark);
  }
  .pick select {
    font-size: 1.05rem;
    min-height: 48px;
    padding-left: 14px;
  }
  .main {
    padding-top: 28px;
    padding-bottom: 48px;
  }
  h2 {
    font-size: 1.35rem;
    margin: 0 0 12px;
  }
  .sit {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .sit button {
    font: inherit;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    min-height: 44px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    cursor: pointer;
    color: var(--text);
  }
  .sit button:hover {
    border-color: var(--brand-mid);
  }
  .sit button.on {
    border-color: var(--brand);
    background: var(--brand-ice);
    box-shadow: inset 0 0 0 1px var(--brand);
  }
  .sit strong {
    color: var(--brand-dark);
  }
  .sit span {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .proc {
    margin: 12px 0 0;
    padding: 12px 16px;
    border-left: 4px solid var(--brand);
    background: #fff;
    color: var(--brand-dark);
  }
  .empty {
    margin: 28px 0;
    padding: 24px;
    text-align: center;
    background: #fff;
    border: 1px dashed var(--line-strong);
    border-radius: 10px;
    color: var(--text-muted);
  }
  .list-h {
    margin-top: 32px;
  }
  .pozn {
    list-style: none;
    margin: 0 0 14px;
    padding: 12px 16px;
    background: #fff8e6;
    border-left: 4px solid var(--accent);
    color: var(--brand-dark);
    font-size: 0.92rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .card {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .card.hl {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(0, 70, 155, 0.15);
  }
  .card__typ {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--brand);
  }
  h3 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.3;
  }
  .card__sub,
  .card__extra {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .card__extra {
    color: var(--text);
  }
  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 6px 14px;
    margin: 12px 0 4px;
    font-size: 0.95rem;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .hod {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }
  code {
    font-family: ui-monospace, Menlo, monospace;
    background: var(--brand-ice);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .copy {
    font: inherit;
    font-size: 0.8rem;
    padding: 2px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    color: var(--brand);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .links a {
    text-decoration: none;
  }
  .card__pozn {
    margin: 10px 0 0;
    font-size: 0.85rem;
    color: var(--text-muted);
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  .foot {
    margin-top: 28px;
    color: var(--text-muted);
    font-size: 0.82rem;
  }
  @media (max-width: 1000px) {
    .sit {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 560px) {
    .wrap {
      padding: 0 16px;
    }
    dl {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }
    dt {
      margin-top: 8px;
      font-size: 0.85rem;
    }
    .sit {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
