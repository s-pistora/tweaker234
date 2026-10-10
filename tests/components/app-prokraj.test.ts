// @vitest-environment jsdom
//
// Režim „Pro kraj“ na celé aplikaci nad reálným snapshotem public/data.
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

describe('App – Pro kraj', () => {
  it('bílá místa: služba a vzdálenost v adrese, návrhy a souhrn; výhled oborů', async () => {
    location.hash = '#/kraj?m=prokraj';
    render(App);
    await waitFor(() => expect(screen.getByTestId('bila-souhrn')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('bila-souhrn').textContent).toMatch(/obyvatel/);
    expect(screen.getByTestId('bila-navrhy').querySelectorAll('li').length).toBeGreaterThan(0);

    await fireEvent.change(screen.getByTestId('bila-sluzba'), { target: { value: 'lekarna' } });
    expect(location.hash).toContain('xs=lekarna');
    await fireEvent.input(screen.getByTestId('bila-km'), { target: { value: '12' } });
    expect(location.hash).toContain('xkm=12');
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);

    await fireEvent.click(screen.getByTestId('prokraj-tab-vyhled'));
    expect(location.hash).toContain('xt=vyhled');
    expect(screen.getByTestId('vyhled-skupiny').querySelectorAll('tbody tr').length).toBeGreaterThan(5);
    expect(screen.getByTestId('vyhled-orp').querySelectorAll('tbody tr')).toHaveLength(7);
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  }, 20000);

  it('dlaždice na úvodní stránce vede do „Pro kraj“', async () => {
    location.hash = '#/kraj?m=domu';
    render(App);
    await waitFor(() => expect(screen.getByTestId('domu-prokraj')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('domu-prokraj').textContent).toMatch(/\d/);
    await fireEvent.click(screen.getByTestId('domu-prokraj'));
    await waitFor(() => expect(location.hash).toContain('m=prokraj'));
  }, 20000);
});
