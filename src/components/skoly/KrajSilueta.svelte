<script lang="ts">
  /** Dekorativní obrys kraje do úvodního pruhu: ORP v odstínech modré, školy jako tečky. */
  import { makeProjector, type AreaFeature } from '../../lib/map/project.ts';

  interface Props {
    orp: AreaFeature[];
    skoly: { lat: number; lon: number; mist: number }[];
  }
  const { orp, skoly }: Props = $props();

  const W = 520;
  const H = 400;
  const proj = $derived(makeProjector(orp, W, H, 6));
  const TONY = ['#c9dcf1', '#a9c9ea', '#8db6e2', '#6f9fd6', '#5b93cf', '#3f7bc0', '#2f6db5'];
  const plochy = $derived(orp.map((f, i) => ({ d: proj.path(f) ?? '', fill: TONY[i % TONY.length] })));
  const body = $derived(
    skoly.map((s) => {
      const [x, y] = proj.project([s.lon, s.lat]);
      return { x, y, r: 3 + Math.sqrt(s.mist) * 0.45 };
    }),
  );
</script>

<svg viewBox="0 0 {W} {H}" aria-hidden="true" class="sil">
  {#each plochy as p, i (i)}
    <path d={p.d} fill={p.fill} />
  {/each}
  {#each body as b, i (i)}
    <circle cx={b.x} cy={b.y} r={b.r} />
  {/each}
</svg>

<style>
  .sil {
    width: 100%;
    height: auto;
    display: block;
    filter: drop-shadow(0 12px 24px rgba(0, 70, 155, 0.15));
  }
  path {
    stroke: #fff;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  circle {
    fill: #fff;
    stroke: var(--brand-dark);
    stroke-width: 1.5;
    opacity: 0.95;
  }
</style>
