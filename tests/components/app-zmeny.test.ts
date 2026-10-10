// @vitest-environment jsdom
//
// „Co je nového v datech“ (hlídač změn) a automatické kontroly na celé aplikaci.
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

const ZMENY = {
  behy: [
    {
      datum: '2026-10-10T05:00:00.000Z',
      zmeny: [
        { oblast: 'Střední školy', veta: 'Nově v datech: 1 obor – Kuchař (Škola 3).' },
        { oblast: 'Peníze kraje', veta: 'Přibyla 1 žádost o voucher.' },
      ],
    },
  ],
};

describe('App – hlídač změn a nálezy', () => {
  it('úvodní stránka ukáže poslední změny, stránka nálezů celou historii a automatické kontroly', async () => {
    const zaklad = fetchFromPublic();
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL) =>
      String(input).endsWith('zmeny.json') ? new Response(JSON.stringify(ZMENY), { status: 200 }) : zaklad(input)) as typeof fetch);
    location.hash = '#/kraj?m=domu';
    render(App);
    const box = await screen.findByTestId('domu-novinky', {}, { timeout: 5000 });
    expect(box.textContent).toContain('Kuchař');
    expect(box.textContent).toContain('10. 10. 2026');

    await zMenu('data', 'mode-nalezy');
    await waitFor(() => expect(screen.getByTestId('nalezy-list')).toBeTruthy());
    expect(screen.getByTestId('nalezy-zmeny').textContent).toContain('Přibyla 1 žádost o voucher.');
    // automatické kontroly nad daty (např. polohy zastávek v jiné obci)
    expect(screen.getByTestId('nalezy-list').textContent).toContain('souřadnice v jiné obci');
    expect(screen.getByTestId('nalezy-md')).toBeTruthy();
  }, 20000);

  it('bez zmeny.json se blok na úvodní stránce neukáže', async () => {
    location.hash = '#/kraj?m=domu';
    render(App);
    await waitFor(() => expect(screen.getByTestId('dlazdice-data')).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByTestId('domu-novinky')).toBeNull();
  });
});
