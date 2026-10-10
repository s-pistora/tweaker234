// @vitest-environment jsdom
//
// Rychlý start v úvodu „Kam na střední“: výběr obce → filtr bydliště a výsledky v dosahu.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/svelte';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import App from '../../src/App.svelte';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

beforeEach(() => {
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => {
    const full = path.join(PUBLIC_DIR, String(input).replace(/^\.\//, ''));
    if (!existsSync(full)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(full, 'utf8'), { status: 200 });
  }) as unknown as typeof fetch);
  // jsdom nemá ResizeObserver (mapa škol jím měří svou velikost)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('App – rychlý start „Kde bydlíte?“', () => {
  it('bez obce je tlačítko neaktivní; po výběru obce nastaví bydliště a ukáže počet škol v dosahu', async () => {
    location.hash = '#/kraj?m=skoly';
    render(App);
    const start = await screen.findByTestId('skoly-start', {}, { timeout: 5000 });
    const go = screen.getByTestId('start-go') as HTMLButtonElement;
    expect(go.disabled).toBe(true);

    await fireEvent.change(screen.getByTestId('start-obec'), { target: { value: '554481' } }); // Cheb
    expect(go.disabled).toBe(false);
    await fireEvent.click(go);

    await waitFor(() => expect(location.hash).toContain('d=554481'));
    expect((screen.getByTestId('skoly-domov') as HTMLSelectElement).value).toBe('554481');
    expect(start.textContent).toMatch(/Do 25 km (je|jsou) \d+ škol/);
  }, 20000);
});
