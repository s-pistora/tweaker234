<script lang="ts">
  /** Lineární ikona 24×24 (jednotná tloušťka čáry, jedna barva – brandbook, „Ikony“). */
  interface Props {
    d: string;
    size?: number;
    color?: string;
  }
  const { d, size = 24, color = 'currentColor' }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"><path {d} /></svg
>
