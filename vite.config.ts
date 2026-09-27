import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// DOM testy: na začátek souboru `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [svelte()],
  base: './',
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
