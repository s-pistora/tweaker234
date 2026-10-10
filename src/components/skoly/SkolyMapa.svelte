<script lang="ts" module>
  import type { TridaNaplnenosti } from '../../lib/skoly.ts';

  /** Škola jako značka na mapě. */
  export interface MapaSkola {
    izo: string;
    nazev: string;
    obec: string;
    lat: number;
    lon: number;
    /** plánovaná místa 2026/27 v oborech odpovídajících filtru */
    mist: number;
    oboru: number;
    trida: TridaNaplnenosti;
    /** loňská obsazenost školy 0–∞ */
    podil: number | null;
  }
</script>

<script lang="ts">
  /**
   * Mapa „Kam na střední“: obce obarvené počtem oborů v dosahu, hranice ORP, popisky měst,
   * školy jako kolečka (velikost = místa, barva = loňská obsazenost), kružnice dosahu.
   * Přiblížení: automaticky na okolí bydliště, tlačítka +/−, tažení myší, „Celý kraj“.
   * Bublina u kurzoru; klik na obec = bydliště, klik na školu = detail.
   */
  import type { AreaCode } from '../../lib/types.ts';
  import { makeProjector, type AreaFeature } from '../../lib/map/project.ts';
  import { motionAllowed } from '../../lib/map/zoom.ts';
  import { procenta } from '../../lib/skoly.ts';

  interface Props {
    obce: AreaFeature[];
    orp: AreaFeature[];
    maxKm: number;
    domov: AreaCode | null;
    kruh: { lat: number; lon: number; km: number } | null;
    skoly: MapaSkola[];
    /** školy mimo filtr – jen šedé tečky pro orientaci */
    ostatni?: { izo: string; lat: number; lon: number }[];
    vybrana: string | null;
    zvyraznena: string | null;
    onobec: (code: AreaCode) => void;
    onskola: (izo: string) => void;
    onhover?: (izo: string | null) => void;
  }
  const {
    obce,
    orp,
    maxKm,
    domov,
    kruh,
    skoly,
    ostatni = [],
    vybrana,
    zvyraznena,
    onobec,
    onskola,
    onhover,
  }: Props = $props();

  type VB = [number, number, number, number];
  const W = 1000;
  // výška uživatelského prostoru podle poměru stran kontejneru → mapa vyplní celou plochu
  let wPx = $state(800);
  let hPx = $state(660);
  const H = $derived(Math.round(Math.min(1600, Math.max(560, (W * hPx) / Math.max(1, wPx)))));
  const FULL = $derived<VB>([0, 0, W, H]);

  const proj = $derived(makeProjector(obce, W, H, 24));
  /** jednobarevný podklad – co je v dosahu, ukazují jen tečky škol */
  const PODKLAD = '#dfe8f3';
  const obcePaths = $derived(
    obce.map((f) => {
      return {
        code: f.properties.code,
        name: f.properties.name,
        d: proj.path(f) ?? '',
        fill: PODKLAD,
      };
    }),
  );
  const orpPaths = $derived(orp.map((f) => ({ code: f.properties.code, d: proj.path(f) ?? '' })));

  // popisky měst: velká (sídla ORP) vždy, menší až při přiblížení
  const VELKA = ['Karlovy Vary', 'Cheb', 'Sokolov', 'Mariánské Lázně', 'Ostrov', 'Aš', 'Kraslice'];
  const MALA = ['Chodov', 'Františkovy Lázně', 'Nejdek', 'Horní Slavkov', 'Jáchymov', 'Toužim', 'Loket', 'Žlutice', 'Teplá', 'Bochov', 'Habartov'];
  const mesta = $derived(
    obce
      .filter((f) => VELKA.includes(f.properties.name) || MALA.includes(f.properties.name))
      .filter((f, i, arr) => arr.findIndex((g) => g.properties.name === f.properties.name) === i)
      .map((f) => {
        const [x, y] = proj.path.centroid(f);
        return { name: f.properties.name, x, y, velke: VELKA.includes(f.properties.name) };
      }),
  );

  const body = $derived(
    skoly.map((s) => {
      const [x, y] = proj.project([s.lon, s.lat]);
      return { ...s, x, y, r: 5 + Math.sqrt(s.mist) * 0.75 };
    }),
  );
  const tecky = $derived(
    ostatni.map((s) => {
      const [x, y] = proj.project([s.lon, s.lat]);
      return { ...s, x, y };
    }),
  );
  const kruhSvg = $derived.by(() => {
    if (!kruh) return null;
    const [cx, cy] = proj.project([kruh.lon, kruh.lat]);
    const [, ny] = proj.project([kruh.lon, kruh.lat + kruh.km / 111.32]);
    return { cx, cy, r: Math.abs(cy - ny) };
  });

  // --- přiblížení ---------------------------------------------------------------
  let vb = $state<VB>([0, 0, 1000, 820]);
  const k = $derived(W / vb[2]);
  /** uživatelské jednotky na 1 CSS px */
  const u = $derived(vb[2] / Math.max(1, wPx));

  function fit(box: VB): VB {
    let [x, y, w, h] = box;
    const ar = W / H;
    if (w / h > ar) {
      const nh = w / ar;
      y -= (nh - h) / 2;
      h = nh;
    } else {
      const nw = h * ar;
      x -= (nw - w) / 2;
      w = nw;
    }
    w = Math.min(W, Math.max(W / 8, w));
    h = w / ar;
    if (h > H) {
      h = H;
      w = h * ar;
    }
    x = Math.min(W - w, Math.max(0, x));
    y = Math.min(H - h, Math.max(0, y));
    return [x, y, w, h];
  }

  let raf = 0;
  let prvni = true;
  function animateTo(to: VB) {
    cancelAnimationFrame(raf);
    // první zobrazení a změna velikosti okna bez animace
    if (prvni || !motionAllowed()) {
      prvni = false;
      vb = to;
      return;
    }
    const from = [...vb] as VB;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 450);
      const e = 1 - (1 - p) ** 3;
      vb = from.map((v, i) => v + (to[i] - v) * e) as VB;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // automaticky na dosah kolem domova; bez domova celý kraj
  let posledniH = 0;
  $effect(() => {
    const c = kruhSvg;
    if (H !== posledniH) {
      posledniH = H;
      prvni = true;
    }
    if (c) {
      const m = c.r * 1.25;
      animateTo(fit([c.cx - m, c.cy - m, 2 * m, 2 * m]));
    } else {
      animateTo([0, 0, W, H]);
    }
  });

  function zoom(f: number) {
    const [x, y, w, h] = vb;
    const cx = x + w / 2;
    const cy = y + h / 2;
    animateTo(fit([cx - w / f / 2, cy - h / f / 2, w / f, h / f]));
  }

  // tažení myší (posun); klik se rozliší podle vzdálenosti
  let drag = $state<{ x: number; y: number; vb: VB; moved: boolean } | null>(null);
  let svgEl = $state<SVGSVGElement | null>(null);
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, vb: [...vb] as VB, moved: false };
  }
  function move(e: PointerEvent) {
    const rect = svgEl?.getBoundingClientRect();
    if (rect) tip = { ...tip, x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    cancelAnimationFrame(raf);
    const [x, y, w, h] = drag.vb;
    vb = fit([x - dx * u, y - dy * u, w, h]);
  }
  function up() {
    setTimeout(() => (drag = null), 0);
  }
  const wasDrag = () => !!drag?.moved;

  // --- bublina ---------------------------------------------------------------
  let tip = $state<{ x: number; y: number; kind: 'obec' | 'skola' | null; id: string }>({
    x: 0,
    y: 0,
    kind: null,
    id: '',
  });
  const tipSkola = $derived(tip.kind === 'skola' ? body.find((b) => b.izo === tip.id) : undefined);
  const tipObec = $derived(tip.kind === 'obec' ? obcePaths.find((o) => o.code === tip.id) : undefined);
  const pl = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);

  function hoverSkola(izo: string | null) {
    tip = { ...tip, kind: izo ? 'skola' : null, id: izo ?? '' };
    onhover?.(izo);
  }

  const TRIDA_TXT = {
    volno: 'loni hodně volných míst',
    ok: 'loni skoro plno',
    pretlak: 'loni přeplněno',
    na: 'loňská obsazenost neznámá',
  } as const;
</script>

<div class="smap" bind:clientWidth={wPx} bind:clientHeight={hPx} data-testid="skoly-mapa">
  <svg
    bind:this={svgEl}
    viewBox={vb.join(' ')}
    role="group"
    aria-label="Mapa obcí Karlovarského kraje podle počtu oborů v dosahu a středních škol"
    class:dragging={drag?.moved}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointerleave={() => {
      drag = null;
      tip = { ...tip, kind: null };
    }}
  >
    <g class="obce">
      {#each obcePaths as o (o.code)}
        <path
          d={o.d}
          fill={o.fill}
          class="obec"
          class:domov={o.code === domov}
          role="button"
          tabindex="-1"
          aria-label="{o.name} – nastavit jako bydliště"
          data-code={o.code}
          onmouseenter={() => (tip = { ...tip, kind: 'obec', id: o.code })}
          onclick={() => !wasDrag() && onobec(o.code)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onobec(o.code)}
        />
      {/each}
    </g>
    <g class="orp" aria-hidden="true">
      {#each orpPaths as o (o.code)}
        <path d={o.d} />
      {/each}
    </g>

    {#if kruhSvg}
      <g class="kruh" aria-hidden="true">
        <circle cx={kruhSvg.cx} cy={kruhSvg.cy} r={kruhSvg.r} class="kruh__plocha" />
        <circle cx={kruhSvg.cx} cy={kruhSvg.cy} r={kruhSvg.r} class="kruh__okraj" />
      </g>
    {/if}

    <g class="tecky" aria-hidden="true">
      {#each tecky as t (t.izo)}
        <circle cx={t.x} cy={t.y} r={2.6 * u} class="tecka" />
      {/each}
    </g>

    <g class="skoly">
      {#each body as b (b.izo)}
        {@const aktivni = b.izo === vybrana || b.izo === zvyraznena}
        <circle
          cx={b.x}
          cy={b.y}
          r={b.r * u * (aktivni ? 1.35 : 1)}
          class="skola skola--{b.trida}"
          class:aktivni
          class:vybrana={b.izo === vybrana}
          role="button"
          tabindex="0"
          aria-label="{b.nazev}, {b.obec}: {b.oboru} {pl(b.oboru, 'obor', 'obory', 'oborů')}, {b.mist} míst, {TRIDA_TXT[b.trida]}"
          data-izo={b.izo}
          onmouseenter={() => hoverSkola(b.izo)}
          onmouseleave={() => hoverSkola(null)}
          onfocus={() => hoverSkola(b.izo)}
          onblur={() => hoverSkola(null)}
          onclick={() => !wasDrag() && onskola(b.izo)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onskola(b.izo))}
        />
      {/each}
    </g>

    <g class="mesta" aria-hidden="true">
      {#each mesta as m (m.name)}
        {#if m.velke || k > 1.8}
          <text
            x={m.x}
            y={m.y + (m.velke ? 17 : 14) * u}
            class="mesto"
            class:mesto--velke={m.velke}
            style="font-size: {(m.velke ? 13 : 11.5) * u}px; stroke-width: {3.5 * u}px">{m.name}</text
          >
        {/if}
      {/each}
    </g>

    {#if kruhSvg}
      <g class="domov" aria-hidden="true">
        <circle cx={kruhSvg.cx} cy={kruhSvg.cy} r={7 * u} class="domov__bod" />
      </g>
    {/if}
  </svg>

  {#if tipSkola || tipObec}
    <div
      class="tip"
      role="status"
      style="left: {Math.min(tip.x + 16, wPx - 250)}px; top: {Math.max(8, tip.y - 12)}px"
    >
      {#if tipSkola}
        <strong>{tipSkola.nazev.replace(/,?\s*příspěvková organizace$/i, '')}</strong>
        <span>{tipSkola.obec} · {tipSkola.oboru} {pl(tipSkola.oboru, 'obor', 'obory', 'oborů')} · {tipSkola.mist} míst</span>
        <span class="tip__st tip__st--{tipSkola.trida}"
          >{tipSkola.podil !== null ? `${procenta(tipSkola.podil)} · ` : ''}{TRIDA_TXT[tipSkola.trida]}</span
        >
        <em>Kliknutím otevřete detail školy</em>
      {:else if tipObec}
        <strong>{tipObec.name}</strong>
        <em>{tipObec.code === domov ? 'Tady bydlíte' : 'Kliknutím ji vyberete jako bydliště'}</em>
      {/if}
    </div>
  {/if}

  <div class="ctrl" role="group" aria-label="Přiblížení mapy">
    <button type="button" onclick={() => zoom(1.6)} aria-label="Přiblížit">+</button>
    <button type="button" onclick={() => zoom(1 / 1.6)} aria-label="Oddálit">−</button>
    <button type="button" class="ctrl__all" onclick={() => animateTo([...FULL])}>Celý kraj</button>
  </div>

  <div class="leg" aria-label="Legenda mapy">
    <div class="leg__row">
      <span class="leg__t">{kruh ? `Školy do ${maxKm} km od bydliště` : 'Střední školy podle filtru'}</span>
    </div>
    <div class="leg__row leg__skoly">
      <span><i class="d d--volno"></i>hodně volno</span>
      <span><i class="d d--ok"></i>skoro plno</span>
      <span><i class="d d--pretlak"></i>přeplněno</span>
      <span><i class="d d--mimo"></i>mimo dosah / filtr</span>
      <span class="leg__note">velikost = počet míst</span>
    </div>
  </div>
</div>

<style>
  .smap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 360px;
    background: #f7f9fc;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--line);
    user-select: none;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    touch-action: none;
  }
  svg.dragging {
    cursor: grabbing;
  }
  .obec {
    stroke: #fff;
    stroke-width: 0.8;
    vector-effect: non-scaling-stroke;
    cursor: pointer;
    transition: fill 0.25s;
    outline: none;
  }
  .obec:hover {
    fill: #c9d8ea;
  }
  .obec.domov {
    stroke: var(--brand-dark);
    stroke-width: 2;
  }
  .orp path {
    fill: none;
    stroke: rgba(12, 24, 56, 0.45);
    stroke-width: 1.3;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .kruh {
    pointer-events: none;
  }
  .kruh__plocha {
    fill: rgba(0, 70, 155, 0.06);
  }
  .kruh__okraj {
    fill: none;
    stroke: var(--brand);
    stroke-width: 2;
    stroke-dasharray: 7 5;
    vector-effect: non-scaling-stroke;
  }
  .mesto {
    fill: var(--brand-dark);
    stroke: rgba(255, 255, 255, 0.92);
    paint-order: stroke;
    stroke-linejoin: round;
    font-weight: 500;
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
  }
  .mesto--velke {
    font-weight: 700;
  }
  .tecka {
    fill: #9aa5b4;
    pointer-events: none;
  }
  .skola {
    stroke: #fff;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    cursor: pointer;
    transition: r 0.15s;
    outline: none;
  }
  .skola--volno {
    fill: var(--data-2);
  }
  .skola--ok {
    fill: var(--data-3);
  }
  .skola--pretlak {
    fill: var(--data-6);
  }
  .skola--na {
    fill: #6b7686;
  }
  .skola.aktivni {
    stroke: var(--brand-dark);
    stroke-width: 3;
  }
  .skola:focus-visible {
    stroke: var(--accent);
    stroke-width: 4;
  }
  .domov__bod {
    fill: var(--accent);
    stroke: var(--brand-dark);
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .tip {
    position: absolute;
    z-index: 3;
    width: 234px;
    padding: 10px 12px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(12, 24, 56, 0.18);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85rem;
    color: var(--text);
    pointer-events: none;
  }
  .tip strong {
    color: var(--brand-dark);
    font-size: 0.95rem;
    line-height: 1.3;
  }
  .tip em {
    font-style: normal;
    color: var(--brand);
    font-size: 0.8rem;
    margin-top: 4px;
  }
  .tip__st {
    font-weight: 500;
  }
  .tip__st--volno {
    color: var(--st-volno);
  }
  .tip__st--ok {
    color: var(--st-ok);
  }
  .tip__st--pretlak {
    color: var(--st-pretlak);
  }
  .ctrl {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 2;
  }
  .ctrl button {
    font: inherit;
    min-width: 40px;
    min-height: 40px;
    font-size: 1.2rem;
    font-weight: 500;
    background: #fff;
    color: var(--brand-dark);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: 0 2px 6px rgba(12, 24, 56, 0.12);
    cursor: pointer;
  }
  .ctrl button:hover {
    background: var(--brand-ice);
    color: var(--brand);
  }
  .ctrl .ctrl__all {
    font-size: 0.8rem;
    padding: 0 8px;
  }
  .leg {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 2;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.78rem;
    color: var(--text);
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: calc(100% - 90px);
    box-shadow: 0 2px 8px rgba(12, 24, 56, 0.08);
  }
  .leg__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
  }
  .leg__skoly {
    gap: 4px 12px;
  }
  .leg__t {
    font-weight: 500;
    color: var(--brand-dark);
    width: 100%;
  }
  .leg__skoly span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .d {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1.5px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  }
  .d--volno {
    background: var(--data-2);
  }
  .d--ok {
    background: var(--data-3);
  }
  .d--pretlak {
    background: var(--data-6);
  }
  .d--mimo {
    width: 7px;
    height: 7px;
    border: 0;
    background: #9aa5b4;
  }
  .leg__note {
    color: var(--text-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .obec,
    .skola {
      transition: none;
    }
  }
</style>
