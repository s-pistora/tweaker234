<script lang="ts" module>
  export interface MapPoint {
    id: string;
    name: string;
    lon: number;
    lat: number;
    layerLabel: string;
    provider: string;
    tone: 'phosphor' | 'amber';
    /** tvar značky: 'x' (křížek) nebo '+' */
    glyph?: 'x' | '+';
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
  import { formatValue } from '../lib/sentences.ts';
  import { patternDefs } from './crt/patterns.svg.ts';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    features: AreaFeature[];
    values: Record<AreaCode, number | null>;
    def?: IndicatorDef;
    year: number;
    selected?: AreaCode | null;
    /** řádky náhledu pro území (2–3 ukazatele s rokem) */
    preview?: (code: AreaCode) => string[];
    points?: MapPoint[];
    zoomTarget?: AreaCode | null;
    zoomFrom?: AreaCode | null;
    onzoomend?: () => void;
    onhover?: (code: AreaCode | null) => void;
    onselect?: (code: AreaCode) => void;
    label?: string;
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
    onzoomend,
    onhover,
    onselect,
    label = 'Mapa',
  }: Props = $props();

  const W = 600;
  const H = 420;
  const FULL: ViewBox = [0, 0, W, H];

  const projector = $derived(makeProjector(features, W, H));
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
        fill: cls === null ? 'url(#pna)' : `url(#p${cls})`,
        aria: `${f.properties.name}: ${def ? formatValue(v, def) : 'N/A'} (${year})`,
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

  let hovered = $state<AreaCode | null>(null);
  let hoverPoint = $state<(MapPoint & { x: number; y: number }) | null>(null);
  let lastPointer = 'mouse';
  const pathEls: Record<AreaCode, SVGPathElement | null> = {};

  const hoveredArea = $derived(areas.find((a) => a.code === hovered) ?? null);
  const tipTitle = $derived(
    hoverPoint ? hoverPoint.name : hoveredArea ? hoveredArea.name : null,
  );
  const tipLines = $derived(
    hoverPoint
      ? [`${hoverPoint.layerLabel}`, `Zdroj: ${hoverPoint.provider}`]
      : hoveredArea
        ? (preview?.(hoveredArea.code) ?? [hoveredArea.aria])
        : [],
  );

  function setHover(code: AreaCode | null) {
    hovered = code;
    onhover?.(code);
  }

  function handleClick(code: AreaCode) {
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

  // body: delegace z <svg> (tisíce bodů → žádné handlery na jednotlivých prvcích)
  function onPointOver(e: PointerEvent) {
    const id = (e.target as Element | null)?.closest?.('[data-pt]')?.getAttribute('data-pt');
    if (id) hoverPoint = projectedPoints.find((p) => p.id === id) ?? null;
  }
  function onPointOut(e: PointerEvent) {
    if ((e.target as Element | null)?.closest?.('[data-pt]')) hoverPoint = null;
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

  const animating = $derived(sweep !== null);
</script>

<div class="map" data-testid="map">
  <svg
    viewBox={vb.join(' ')}
    preserveAspectRatio="xMidYMid meet"
    role="group"
    aria-label={label}
    class:animating
    onpointerover={onPointOver}
    onpointerout={onPointOut}
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
    {#if projectedPoints.length}
      <g class="points" aria-hidden="true">
        {#each projectedPoints as p (p.id)}
          <g class="pt pt--{p.tone}" transform="translate({p.x},{p.y})" data-pt={p.id}>
            <circle r="5" class="pt__hit" />
            <path d={p.glyph === '+' ? 'M-3.2,0L3.2,0M0,-3.2L0,3.2' : 'M-2.5,-2.5L2.5,2.5M-2.5,2.5L2.5,-2.5'} />
          </g>
        {/each}
      </g>
    {/if}
    {#if sweep !== null}
      {@const cx = vb[0] + vb[2] / 2}
      {@const cy = vb[1] + vb[3] / 2}
      {@const r = Math.hypot(vb[2], vb[3])}
      <line
        class="sweep"
        x1={cx}
        y1={cy}
        x2={cx + r * Math.cos((sweep * Math.PI) / 180)}
        y2={cy + r * Math.sin((sweep * Math.PI) / 180)}
      />
    {/if}
  </svg>
  <Tooltip
    title={tipTitle}
    lines={tipLines}
    hint="Najeďte na území (nebo Tab + šipky). Enter = detail, Esc = o úroveň výš."
  />
</div>

<style>
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
    background: var(--bg);
    border: 1px solid var(--phosphor-40);
    box-sizing: border-box;
    touch-action: manipulation;
  }
  svg.animating {
    pointer-events: none;
  }
  .area {
    stroke: var(--phosphor-60);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    cursor: pointer;
    outline: none;
  }
  .area.hovered {
    stroke: var(--phosphor-100);
    stroke-width: 2.5;
  }
  .area.selected {
    stroke: var(--amber);
    stroke-width: 3;
  }
  .area:focus-visible {
    stroke: var(--amber);
    stroke-width: 3.5;
    stroke-dasharray: 6 3;
    box-shadow: none;
  }
  .pt path {
    stroke-width: 1.6;
    vector-effect: non-scaling-stroke;
    fill: none;
  }
  .pt--phosphor path {
    stroke: var(--phosphor-100);
  }
  .pt--amber path {
    stroke: var(--amber);
  }
  .pt__hit {
    fill: transparent;
    stroke: none;
  }
  .pt:hover path {
    stroke-width: 3;
  }
  .sweep {
    stroke: var(--phosphor-100);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    opacity: 0.7;
  }
</style>
