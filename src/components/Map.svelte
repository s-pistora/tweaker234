<script lang="ts" module>
  import type { Tone, Glyph } from '../lib/map/pointStyle.ts';

  export interface MapPoint {
    id: string;
    name: string;
    lon: number;
    lat: number;
    layerLabel: string;
    provider: string;
    /** rok/období platnosti vrstvy (`PointLayer.validFor`) - zobrazuje se v tooltipu */
    validFor?: string;
    tone: Tone;
    /** tvar značky - viz `lib/map/pointStyle.ts` */
    glyph?: Glyph;
    /** vlastní barva značky (přebije `tone`), např. barva kategorie místa */
    color?: string;
  }
</script>

<script lang="ts">
  /**
   * Kartogram: jedna SVG cesta na území (role=button, tabindex=0, aria-label
   * „<název>: <hodnota> (<rok>)“), výplň vzorem třídy p0..p4 / pna.
   * Hover/focus = náhled (Tooltip, aria-live), klik/Enter = onselect, šipky =
   * nejbližší soused ve směru. Dotyk: 1. tap náhled, 2. tap výběr.
   * Esc řeší rodič (globálně), aby nedošlo ke dvojímu kroku.
   *
   * Body (`points`) mají `pointer-events: none` - jsou to jen vizuální značky, klik i
   * hover na území pod nimi musí fungovat i se zapnutými bodovými vrstvami (review
   * finding #4: průhledné hit-terče bodů dřív klik na území "polykaly"). Hover bodu se
   * proto řeší delegovaně přes `pointermove` na <svg> (nejbližší bod do 6 px), ne přes
   * events na jednotlivých bodech.
   *
   * Zoom: `zoomTarget` → animuje viewBox na území (600 ms) a zavolá `onzoomend`;
   * `zoomFrom` → po (pře)kreslení začne na výřezu území a oddálí na celek.
   * Bez animace při `.crt-off` / prefers-reduced-motion.
   */
  import { untrack } from 'svelte';
  import type { AreaCode, IndicatorDef } from '../lib/types.ts';
  import type { AreaFeature } from '../lib/map/project.ts';
  import { makeProjector } from '../lib/map/project.ts';
  import { quantileClass } from '../lib/map/classify.ts';
  import { neighborInDirection, type Direction } from '../lib/map/neighbors.ts';
  import { zoomViewBox, motionAllowed, ZOOM_MS, type ViewBox } from '../lib/map/zoom.ts';
  import { GLYPH_CHAR } from '../lib/map/pointStyle.ts';
  import { formatValue } from '../lib/sentences.ts';
  import { patternDefs } from './crt/patterns.svg.ts';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    features: AreaFeature[];
    values: Record<AreaCode, number | null>;
    def?: IndicatorDef;
    /** rok platnosti hodnot; null = hodnota bez roku (skóre, počet v dosahu) */
    year: number | null;
    selected?: AreaCode | null;
    /** řádky náhledu pro území (2–3 ukazatele s rokem) */
    preview?: (code: AreaCode) => string[];
    points?: MapPoint[];
    zoomTarget?: AreaCode | null;
    zoomFrom?: AreaCode | null;
    /** okraj kolem území v SVG jednotkách (výchozí 8) – větší = vidět i okolí, např. body u jedné obce */
    fitPad?: number;
    onzoomend?: () => void;
    onhover?: (code: AreaCode | null) => void;
    onselect?: (code: AreaCode) => void;
    label?: string;
    /** nápověda pod mapou, když nic není pod kurzorem */
    hint?: string;
    /** klik na bod (nejbližší do 6 px) místo na území pod ním */
    onpointselect?: (id: string) => void;
    /** kružnice dosahu kolem bodu (km vzdušnou čarou) + značka středu */
    circle?: { lat: number; lon: number; km: number; label?: string } | null;
    /** id zvýrazněného bodu (vybrané místo) */
    selectedPoint?: string | null;
    /** jednobarevný podklad (obce bez obarvení podle hodnot) – co je v dosahu, ukazují body */
    jednobarevna?: boolean;
    /** po zadání kružnice dosahu přiblížit mapu na ni (a po zrušení zpět na celek) */
    priblizitNaKruh?: boolean;
  }

  const {
    features,
    values,
    def,
    year,
    selected = null,
    preview,
    points = [],
    zoomTarget = null,
    zoomFrom = null,
    fitPad = 8,
    onzoomend,
    onhover,
    onselect,
    label = 'Mapa',
    onpointselect,
    circle = null,
    selectedPoint = null,
    jednobarevna = false,
    priblizitNaKruh = false,
    hint = 'Najeďte na území (nebo Tab a šipky). Enter otevře detail, Esc vrací o úroveň výš.',
  }: Props = $props();

  const W = 600;
  const H = 420;
  const FULL: ViewBox = [0, 0, W, H];

  const projector = $derived(makeProjector(features, W, H, fitPad));
  const allValues = $derived(features.map((f) => values[f.properties.code] ?? null));
  const areas = $derived(
    features.map((f) => {
      const code = f.properties.code;
      const v = values[code] ?? null;
      const cls = quantileClass(allValues, v);
      return {
        code,
        name: f.properties.name,
        d: projector.path(f) ?? '',
        fill: jednobarevna ? '#dfe8f3' : cls === null ? 'url(#pna)' : `url(#p${cls})`,
        aria: `${f.properties.name}: ${def ? formatValue(v, def) : 'N/A'}${year !== null ? ` (${year})` : ''}`,
        feature: f,
      };
    }),
  );
  const centroids = $derived(
    Object.fromEntries(
      features.map((f) => [f.properties.code, projector.path.centroid(f) as [number, number]]),
    ) as Record<AreaCode, [number, number]>,
  );
  const projectedPoints = $derived(
    points.map((p) => {
      const [x, y] = projector.project([p.lon, p.lat]);
      return { ...p, x, y };
    }),
  );

  /** kružnice dosahu v souřadnicích SVG (projekce je lokálně ekvidistantní → kruh) */
  const circ = $derived.by(() => {
    if (!circle) return null;
    const [cx, cy] = projector.project([circle.lon, circle.lat]);
    const [, ny] = projector.project([circle.lon, circle.lat + circle.km / 111.32]);
    return { cx, cy, r: Math.abs(cy - ny), label: circle.label ?? '' };
  });

  let tipPos = $state<{ x: number; y: number; w: number } | null>(null);
  let hovered = $state<AreaCode | null>(null);
  let hoverPoint = $state<(MapPoint & { x: number; y: number }) | null>(null);
  let lastPointer = 'mouse';
  const pathEls: Record<AreaCode, SVGPathElement | null> = {};

  const hoveredArea = $derived(areas.find((a) => a.code === hovered) ?? null);
  const tipTitle = $derived(
    hoverPoint ? hoverPoint.name : hoveredArea ? hoveredArea.name : null,
  );
  /** výchozí náhled (bez vlastního `preview`): hodnota, nebo "N/A PRO ROK <rok>" při chybějícím údaji. */
  function defaultPreview(code: AreaCode): string[] {
    const area = areas.find((a) => a.code === code);
    if (!area) return [];
    const v = values[code] ?? null;
    if (v === null && def) return [year !== null ? `${area.name}: údaj za rok ${year} chybí` : `${area.name}: údaj chybí`];
    return [area.aria];
  }

  const tipLines = $derived(
    hoverPoint
      ? [
          `${hoverPoint.layerLabel}`,
          `Zdroj: ${hoverPoint.provider}${hoverPoint.validFor ? ` (${hoverPoint.validFor})` : ''}`,
        ]
      : hoveredArea
        ? (preview?.(hoveredArea.code) ?? defaultPreview(hoveredArea.code))
        : [],
  );

  function setHover(code: AreaCode | null) {
    hovered = code;
    onhover?.(code);
  }

  function handleClick(code: AreaCode) {
    if (hoverPoint && onpointselect) {
      onpointselect(hoverPoint.id);
      return;
    }
    if (lastPointer === 'touch' && hovered !== code) {
      // mobil: první tap = náhled
      setHover(code);
      return;
    }
    onselect?.(code);
  }

  const KEY_DIRS: Record<string, Direction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };

  function handleKey(e: KeyboardEvent, code: AreaCode) {
    const dir = KEY_DIRS[e.key];
    if (dir) {
      e.preventDefault();
      const next = neighborInDirection(centroids, code, dir);
      if (next) pathEls[next]?.focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect?.(code);
    }
  }

  // Body mají `pointer-events: none` (ať klik/hover na území pod nimi vždy projde – viz
  // review finding #4), takže se nedají hoverovat přímo. Místo toho jeden delegovaný
  // `pointermove` na <svg>, který najde nejbližší bod do 6 px od kurzoru (prostý loop –
  // v pořádku i pro řádově tisíce bodů).
  const HOVER_PX = 6;
  /** prst je méně přesný než myš → větší dosah při dotyku */
  const TOUCH_PX = 16;
  function onSvgPointerMove(e: PointerEvent) {
    if (!projectedPoints.length) {
      hoverPoint = null;
      return;
    }
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      hoverPoint = null;
      return;
    }
    const scaleX = vb[2] / rect.width;
    const scaleY = vb[3] / rect.height;
    const userX = vb[0] + (e.clientX - rect.left) * scaleX;
    const userY = vb[1] + (e.clientY - rect.top) * scaleY;
    const thresholdUser = (e.pointerType === 'touch' ? TOUCH_PX : HOVER_PX) * Math.max(scaleX, scaleY);
    let nearest: (typeof projectedPoints)[number] | null = null;
    let bestDist2 = Infinity;
    for (const p of projectedPoints) {
      const dx = p.x - userX;
      const dy = p.y - userY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        nearest = p;
      }
    }
    hoverPoint = nearest && bestDist2 <= thresholdUser * thresholdUser ? nearest : null;
  }
  function onSvgPointerLeave() {
    hoverPoint = null;
  }
  /** klik na bod mimo území (např. okolí jediné zobrazené obce) – klik na území řeší handleClick */
  function onSvgClick(e: MouseEvent) {
    if ((e.target as Element | null)?.closest?.('[data-code]')) return;
    if (hoverPoint && onpointselect) onpointselect(hoverPoint.id);
  }

  // --- zoom -------------------------------------------------------------
  let vb = $state<ViewBox>([...FULL]);
  let sweep = $state<number | null>(null);

  function boxOf(code: AreaCode): ViewBox | null {
    const f = features.find((x) => x.properties.code === code);
    if (!f) return null;
    const [[x0, y0], [x1, y1]] = projector.path.bounds(f);
    let w = Math.max(x1 - x0, 1) * 1.15;
    let h = Math.max(y1 - y0, 1) * 1.15;
    // zachovat poměr stran viewBoxu
    if (w / h > W / H) h = (w * H) / W;
    else w = (h * W) / H;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return [cx - w / 2, cy - h / 2, w, h];
  }

  function animate(from: ViewBox, to: ViewBox, done?: () => void): () => void {
    if (!motionAllowed() || typeof requestAnimationFrame === 'undefined') {
      vb = [...to];
      sweep = null;
      done?.();
      return () => {};
    }
    let raf = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      start ??= ts;
      const t = Math.min(1, (ts - start) / ZOOM_MS);
      vb = zoomViewBox(from, to, t);
      sweep = t * 360;
      if (t < 1) raf = requestAnimationFrame(step);
      else {
        sweep = null;
        done?.();
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      sweep = null;
    };
  }

  $effect(() => {
    const target = zoomTarget;
    if (!target) return;
    const box = untrack(() => boxOf(target));
    const from = untrack(() => [...vb] as ViewBox);
    if (!box) {
      onzoomend?.();
      return;
    }
    return animate(from, box, () => onzoomend?.());
  });

  $effect(() => {
    // nové území / nové prvky → výchozí pohled (případně oddálení z `zoomFrom`)
    void features;
    const src = zoomFrom;
    const box = src ? untrack(() => boxOf(src)) : null;
    if (!box) {
      vb = [...FULL];
      return;
    }
    vb = [...box];
    return animate(box, [...FULL]);
  });

  // přiblížení na kružnici dosahu (stejně jako mapa škol); bez kružnice zpět na celek
  // deklarováno až za resetem pohledu při změně `features` → při načtení dat vyhraje přiblížení
  let kruhPoprve = true;
  $effect(() => {
    if (!priblizitNaKruh) return;
    void features;
    const c = circ;
    const from = untrack(() => [...vb] as ViewBox);
    if (!c) {
      kruhPoprve = false;
      return animate(from, [...FULL]);
    }
    const ar = W / H;
    let w = c.r * 2.5;
    let h = c.r * 2.5;
    if (w / h < ar) w = h * ar;
    else h = w / ar;
    if (w > W) {
      w = W;
      h = H;
    }
    const cil: ViewBox = [c.cx - w / 2, c.cy - h / 2, w, h];
    // první zobrazení (odkaz s bydlištěm, načtení dat) hned bez animace
    if (kruhPoprve) {
      kruhPoprve = false;
      vb = cil;
      return;
    }
    return animate(from, cil);
  });

  const animating = $derived(sweep !== null);
  /** značky bodů mají stálou velikost na obrazovce i v přiblížení */
  const ptScale = $derived(vb[2] / W);
</script>

<div class="map" data-testid="map">
  <div
    class="map__stage"
    onpointermove={(e) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      tipPos = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
    }}
    onpointerleave={() => (tipPos = null)}
    role="presentation"
  >
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <svg
    viewBox={vb.join(' ')}
    preserveAspectRatio="xMidYMid meet"
    role="group"
    aria-label={label}
    class:animating
    style="--pt-k: {ptScale}"
    onpointermove={onSvgPointerMove}
    onpointerdown={onSvgPointerMove}
    onpointerleave={onSvgPointerLeave}
    onclick={onSvgClick}
  >
    <defs>{@html patternDefs()}</defs>
    <g class="areas">
      {#each areas as a (a.code)}
        <path
          bind:this={pathEls[a.code]}
          d={a.d}
          fill={a.fill}
          class="area"
          class:hovered={hovered === a.code}
          class:selected={selected === a.code}
          role="button"
          tabindex="0"
          aria-label={a.aria}
          aria-pressed={selected === a.code}
          data-code={a.code}
          onpointerdown={(e) => (lastPointer = e.pointerType || 'mouse')}
          onmouseenter={() => setHover(a.code)}
          onmouseleave={() => lastPointer !== 'touch' && setHover(null)}
          onfocus={() => setHover(a.code)}
          onclick={() => handleClick(a.code)}
          onkeydown={(e) => handleKey(e, a.code)}
        />
      {/each}
    </g>
    {#if features.length <= 20}
      <g class="labels" aria-hidden="true">
        {#each areas as a (a.code)}
          {@const c = centroids[a.code]}
          {@const bb = projector.path.bounds(a.feature)}
          {#if c && Number.isFinite(c[0]) && bb[1][0] - bb[0][0] > 40}
            <text class="lbl" class:lbl--sel={selected === a.code} x={c[0]} y={c[1]}
              >{a.name.replace(/\s*\(fixture\)$/, '').replace(/ kraj$/, '')}</text
            >
          {/if}
        {/each}
      </g>
    {/if}
    {#if circ}
      <g class="reach" aria-hidden="true">
        <circle class="reach__ring" cx={circ.cx} cy={circ.cy} r={circ.r} />
        <circle class="reach__home" cx={circ.cx} cy={circ.cy} r="5" />
        {#if circ.label}
          <text class="reach__lbl" x={circ.cx} y={circ.cy - 10} text-anchor="middle">{circ.label}</text>
        {/if}
      </g>
    {/if}
    {#if projectedPoints.length}
      <g class="points" aria-hidden="true">
        {#each projectedPoints as p (p.id)}
          <text
            class="pt pt--{p.tone}"
            class:pt--hover={hoverPoint?.id === p.id}
            class:pt--sel={selectedPoint === p.id}
            style={p.color ? `fill: ${p.color}` : undefined}
            x={p.x}
            y={p.y}
            text-anchor="middle"
            dominant-baseline="central"
            data-pt={p.id}>{GLYPH_CHAR[p.glyph ?? 'x']}</text
          >
        {/each}
      </g>
    {/if}
  </svg>
  <div
    class="map__tip"
    class:map__tip--on={!!tipTitle}
    style={tipPos && tipTitle ? `left: ${Math.min(tipPos.x + 16, tipPos.w - 280)}px; top: ${Math.max(6, tipPos.y - 10)}px` : ''}
  >
    <Tooltip title={tipTitle} lines={tipLines} />
  </div>
  </div>
  <p class="map__hint">{hint}</p>
</div>

<style>
  .map__stage {
    position: relative;
  }
  .map__tip {
    position: absolute;
    left: 10px;
    top: 10px;
    width: 264px;
    max-width: calc(100% - 20px);
    pointer-events: none;
    opacity: 0;
    z-index: 2;
  }
  .map__tip--on {
    opacity: 1;
  }
  .map__hint {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .map__tip :global(.tooltip) {
    min-height: 0;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 4px 16px rgba(12, 24, 56, 0.14);
    font-size: 0.85rem;
  }
  .map {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  svg {
    width: 100%;
    height: auto;
    aspect-ratio: 600 / 420;
    display: block;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-sizing: border-box;
    touch-action: manipulation;
  }
  svg.animating {
    pointer-events: none;
  }
  .area {
    stroke: #fff;
    stroke-width: 0.8;
    vector-effect: non-scaling-stroke;
    cursor: pointer;
    outline: none;
  }
  .area.hovered {
    stroke: var(--brand-dark);
    stroke-width: 2;
  }
  .area.selected {
    stroke: var(--accent);
    stroke-width: 3.5;
  }
  .area:focus-visible {
    stroke: var(--accent);
    stroke-width: 3.5;
    stroke-dasharray: 6 3;
    box-shadow: none;
  }
  .points {
    /* Body jsou jen vizuální značky - klik/hover na území pod nimi musí projít i se
       zapnutými bodovými vrstvami (viz review finding #4). Hover bodu samotného se řeší
       delegovaně přes `pointermove` na <svg> (viz `onSvgPointerMove`). */
    pointer-events: none;
  }
  .pt {
    font-size: calc(13px * var(--pt-k, 1));
    font-weight: 900;
    font-family: var(--font-mono);
    stroke: #fff;
    stroke-width: calc(3px * var(--pt-k, 1));
    paint-order: stroke;
    stroke-linejoin: round;
  }
  .pt--phosphor {
    fill: var(--brand-dark);
  }
  .pt--amber {
    fill: var(--data-6);
  }
  .pt--hover {
    font-size: calc(18px * var(--pt-k, 1));
  }
  .pt--sel {
    font-size: calc(22px * var(--pt-k, 1));
    stroke: var(--accent);
    stroke-width: calc(4px * var(--pt-k, 1));
  }
  .labels {
    pointer-events: none;
  }
  .lbl {
    font-size: 11px;
    font-weight: 700;
    fill: var(--brand-dark);
    stroke: rgba(255, 255, 255, 0.9);
    stroke-width: 3px;
    paint-order: stroke;
    stroke-linejoin: round;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .lbl--sel {
    fill: #000;
  }
  .reach {
    pointer-events: none;
  }
  .reach__ring {
    fill: rgba(250, 180, 19, 0.08);
    stroke: var(--brand-dark);
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
    vector-effect: non-scaling-stroke;
  }
  .reach__home {
    fill: var(--accent);
    stroke: var(--brand-dark);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .reach__lbl {
    font-size: 12px;
    font-weight: 700;
    fill: var(--brand-dark);
    stroke: #fff;
    stroke-width: 3px;
    paint-order: stroke;
  }
</style>
