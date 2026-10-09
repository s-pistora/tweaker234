<script lang="ts">
  /**
   * Loňská obsazenost oboru: štítek slovy + pruh + číslo s bází („27 z 30 míst“).
   * Barvy z datové palety, nikdy jen červená/zelená – stav je vždy i napsaný.
   */
  import { procenta, tridaNaplnenosti } from '../../lib/skoly.ts';

  interface Props {
    /** podíl 0–∞, null = bez údaje */
    podil: number | null;
    prijato?: number | null;
    zamer?: number | null;
    /** kompaktní = jen štítek */
    compact?: boolean;
  }
  const { podil, prijato = null, zamer = null, compact = false }: Props = $props();

  const t = $derived(tridaNaplnenosti(podil));
  const LABEL = {
    volno: 'Loni hodně volných míst',
    ok: 'Loni skoro plno',
    pretlak: 'Loni přeplněno',
    na: 'Loni neotevřen nebo bez údaje',
  } as const;
  const sirka = $derived(podil === null ? 0 : Math.min(100, Math.round(podil * 100)));
</script>

<div class="nap nap--{t}" class:compact>
  <span class="chip">{LABEL[t]}</span>
  {#if !compact && podil !== null}
    <span class="bar" aria-hidden="true"><span class="fill" style="width: {sirka}%"></span></span>
    <span class="txt">
      <strong>{procenta(podil)}</strong>{#if prijato !== null && zamer !== null}&nbsp;· {prijato} z {zamer} míst{/if}
    </span>
  {/if}
</div>

<style>
  .nap {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    min-width: 0;
    margin-top: 4px;
  }
  .chip {
    font-size: 0.85rem;
    font-weight: 500;
    padding: 2px 10px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .bar {
    flex: 1 1 100px;
    max-width: 200px;
    height: 8px;
    border-radius: 2px;
    background: var(--st-na-soft);
    overflow: hidden;
    display: block;
  }
  .fill {
    display: block;
    height: 100%;
  }
  .txt {
    font-size: 0.92rem;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .txt strong {
    color: var(--brand-dark);
    font-weight: 700;
  }
  .nap--volno .chip {
    background: var(--st-volno-soft);
    color: var(--st-volno);
  }
  .nap--volno .fill {
    background: var(--data-2);
  }
  .nap--ok .chip {
    background: var(--st-ok-soft);
    color: var(--st-ok);
  }
  .nap--ok .fill {
    background: var(--data-3);
  }
  .nap--pretlak .chip {
    background: var(--st-pretlak-soft);
    color: var(--st-pretlak);
  }
  .nap--pretlak .fill {
    background: var(--data-6);
  }
  .nap--na .chip {
    background: var(--st-na-soft);
    color: var(--st-na);
  }
</style>
