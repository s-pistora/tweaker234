import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { poradceProxy } from './vite-plugin-poradce.ts';

// DOM testy: na začátek souboru `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [svelte(), poradceProxy()],
  base: './',
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
