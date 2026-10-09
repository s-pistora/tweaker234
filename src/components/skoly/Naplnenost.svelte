<script lang="ts">
  /** Loňská obsazenost: barevný štítek slovy + pruh + čísla. */
  import { procenta, tridaNaplnenosti } from '../../lib/skoly.ts';

  interface Props {
    /** podíl 0–∞, null = bez údaje */
    podil: number | null;
    prijato?: number | null;
    zamer?: number | null;
    /** kompaktní = jen štítek (bez pruhu) */
    compact?: boolean;
  }
  const { podil, prijato = null, zamer = null, compact = false }: Props = $props();

  const t = $derived(tridaNaplnenosti(podil));
  const LABEL = {
    volno: 'Loni hodně volných míst',
    ok: 'Loni skoro plno',
    pretlak: 'Loni přeplněno',
    na: 'Bez loňských údajů',
  } as const;
  const sirka = $derived(podil === null ? 0 : Math.min(100, Math.round(podil * 100)));
</script>

<div class="nap nap--{t}" class:compact>
  <span class="chip">{LABEL[t]}</span>
  {#if !compact && podil !== null}
    <div class="bar" aria-hidden="true"><div class="fill" style="width: {sirka}%"></div></div>
    <span class="txt">
      obsazeno <strong>{procenta(podil)}</strong>{#if prijato !== null && zamer !== null}
        &nbsp;({prijato} z {zamer} míst){/if}
    </span>
  {/if}
</div>

<style>
  .nap {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    min-width: 0;
  }
  .chip {
    font-size: 0.78rem;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .bar {
    flex: 1 1 80px;
    max-width: 160px;
    height: 8px;
    border-radius: 999px;
    background: var(--c-na-soft);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 999px;
  }
  .txt {
    font-size: 0.85rem;
    color: var(--c-muted);
  }
  .txt strong {
    color: var(--c-text);
  }
  .nap--volno .chip {
    background: var(--c-good-soft);
    color: var(--c-good);
  }
  .nap--volno .fill {
    background: var(--c-good);
  }
  .nap--ok .chip {
    background: var(--c-warn-soft);
    color: var(--c-warn);
  }
  .nap--ok .fill {
    background: #eab308;
  }
  .nap--pretlak .chip {
    background: var(--c-bad-soft);
    color: var(--c-bad);
  }
  .nap--pretlak .fill {
    background: var(--c-bad);
  }
  .nap--na .chip {
    background: var(--c-na-soft);
    color: var(--c-na);
  }
</style>
