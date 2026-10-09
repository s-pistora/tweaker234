<script lang="ts">
  /** Náhled území / bodu. Region je aria-live, aby čtečka oznámila změnu náhledu. */
  interface Props {
    title: string | null;
    lines?: string[];
    hint?: string;
  }
  const { title, lines = [], hint = '' }: Props = $props();
</script>

<div class="tooltip" role="status" aria-live="polite" data-testid="map-tooltip">
  {#if title}
    <div class="tooltip__title">{title}</div>
    {#each lines as line (line)}
      <div class="tooltip__line">{line}</div>
    {/each}
  {:else if hint}
    <div class="tooltip__hint">{hint}</div>
  {/if}
</div>

<style>
  .tooltip {
    min-height: 3.6em;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--brand-ice);
    padding: 8px 12px;
    font-size: 0.9rem;
    box-sizing: border-box;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .tooltip__title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
    color: var(--brand-dark);
  }
  .tooltip__line {
    color: var(--phosphor-80);
  }
  .tooltip__hint {
    color: var(--phosphor-60);
  }
</style>
