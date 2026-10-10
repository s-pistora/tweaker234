// @vitest-environment jsdom
//
// Režim „Podnikání“ na celé aplikaci nad reálným snapshotem public/data.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/svelte';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import App from '../../src/App.svelte';
import { zMenu } from './menu-helper.ts';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function fetchFromPublic(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const full = path.join(PUBLIC_DIR, String(input).replace(/^\.\//, ''));
    if (!existsSync(full)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(full, 'utf8'), { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  document.documentElement.classList.add('crt-off');
  vi.stubGlobal('fetch', fetchFromPublic());
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
  document.documentElement.classList.remove('crt-off');
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('App – Podnikání', () => {
  it('menu → kreativci s filtrem oboru a hledáním → centra → zóny', async () => {
    location.hash = '#/kraj?m=skoly';
    render(App);
    await waitFor(() => expect(screen.getByTestId('skoly-filtr')).toBeTruthy(), { timeout: 5000 });
    await zMenu('prace', 'mode-podnikani');
    expect(location.hash).toContain('m=podnikani');
    expect(screen.getByTestId('kreativci-pocet').textContent).toMatch(/197/);

    await fireEvent.change(screen.getByTestId('kreativci-obor'), { target: { value: 'Fotografie' } });
    expect(location.hash).toContain('ko=Fotografie');
    const n = Number(screen.getByTestId('kreativci-pocet').textContent!.match(/\d+/)![0]);
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(197);

    await fireEvent.click(screen.getByTestId('podnikani-tab-centra'));
    expect(screen.getByTestId('centra-list').textContent).toContain('Krajské inovační centrum');
    await fireEvent.click(screen.getByTestId('podnikani-tab-zony'));
    expect(screen.getByTestId('zony-zamery').querySelectorAll('li').length).toBeGreaterThan(3);
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  }, 20000);
});
