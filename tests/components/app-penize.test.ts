// @vitest-environment jsdom
//
// Režim „Peníze kraje“ na celé aplikaci nad reálným snapshotem public/data:
// přechod z menu, projekty, vouchery s filtrem, strategie.
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

describe('App – Peníze kraje', () => {
  it('menu → projekty → vouchery s filtrem ORP → strategie', async () => {
    location.hash = '#/kraj?m=skoly';
    render(App);
    await waitFor(() => expect(screen.getByTestId('skoly-filtr')).toBeTruthy(), { timeout: 5000 });
    await zMenu('prace', 'mode-penize');
    expect(location.hash).toContain('m=penize');

    expect(screen.getByTestId('projekty-aktualni').textContent).toContain('Karlovarské inovační centrum');
    expect(screen.getByTestId('projekty-ukoncene').querySelectorAll('li').length).toBeGreaterThan(10);
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);

    await fireEvent.click(screen.getByTestId('penize-tab-vouchery'));
    expect(location.hash).toContain('pt=vouchery');
    const vse = screen.getByTestId('voucher-souhrn').textContent ?? '';
    expect(vse).toMatch(/Kraj podpořil \d+ z \d+ žádostí/);
    await fireEvent.change(screen.getByTestId('voucher-orp'), { target: { value: '4101' } });
    expect(location.hash).toContain('po=4101');
    expect(screen.getByTestId('voucher-souhrn').textContent).toContain('v ORP Aš');
    expect(screen.getByTestId('voucher-souhrn').textContent).not.toBe(vse);

    await fireEvent.click(screen.getByTestId('penize-tab-strategie'));
    expect(screen.getByTestId('strategie-list').querySelectorAll('li').length).toBeGreaterThan(5);
  }, 20000);
});
