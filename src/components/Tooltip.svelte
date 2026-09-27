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
    <div class="tooltip__title">&gt; {title}</div>
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
    border: 1px solid var(--phosphor-40);
    background: var(--bg-panel);
    padding: 6px 10px;
    font-size: 0.9rem;
    box-sizing: border-box;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .tooltip__title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    color: var(--phosphor-100);
  }
  .tooltip__line {
    color: var(--phosphor-80);
  }
  .tooltip__hint {
    color: var(--phosphor-60);
  }
</style>
