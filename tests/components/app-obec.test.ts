// @vitest-environment jsdom
//
// Režim „Karta obce“ na celé aplikaci nad reálným snapshotem public/data.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/svelte';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import App from '../../src/App.svelte';

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

describe('App – Karta obce', () => {
  it('obec vybraná na úvodní stránce se převezme do karty, výběr jiné obce, tisk', async () => {
    location.hash = '#/kraj?m=domu';
    render(App);
    await waitFor(() => expect(screen.getByTestId('domu-dlazdice')).toBeTruthy(), { timeout: 5000 });
    await fireEvent.change(screen.getByTestId('domu-vyber-obce'), { target: { value: '554481' } });
    await fireEvent.click(screen.getByTestId('mode-obec'));
    await waitFor(() => expect(screen.getByTestId('karta')).toBeTruthy());
    expect(location.hash).toContain('m=obec');
    expect(location.hash).toContain('k=554481');
    const karta = screen.getByTestId('karta');
    expect(karta.textContent).toContain('obyvatel');
    expect(karta.textContent).not.toMatch(/NaN|undefined/);
    expect(screen.getAllByTestId('karta-sekce').length).toBeGreaterThanOrEqual(4);

    await fireEvent.change(screen.getByTestId('karta-obec'), { target: { value: '554979' } });
    expect(location.hash).toContain('k=554979');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Abertamy');

    const print = vi.fn();
    vi.stubGlobal('print', print);
    await fireEvent.click(screen.getByTestId('karta-tisk'));
    expect(print).toHaveBeenCalled();
  }, 20000);

  it('bez obce ukáže výzvu k výběru', async () => {
    location.hash = '#/kraj?m=obec';
    render(App);
    await waitFor(() => expect(screen.getByTestId('karta-prazdna')).toBeTruthy(), { timeout: 5000 });
  });
});
