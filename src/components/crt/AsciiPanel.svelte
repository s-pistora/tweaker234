<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    children?: Snippet;
  }

  const { title, children }: Props = $props();
</script>

<section class="ascii-panel" aria-label={title}>
  <h2 class="ascii-panel__title">{title}</h2>
  <div class="ascii-panel__body">
    {#if children}
      {@render children()}
    {/if}
  </div>
</section>
