// @vitest-environment jsdom
//
// Režim „Kam na střední“ na celé aplikaci nad reálným snapshotem public/data
// (fixtures obory SŠ neobsahují): přepnutí režimu, výběr obce, seznam, detail školy, Esc.
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
  sessionStorage.setItem('kraj-term:boot-seen', '1');
  vi.stubGlobal('fetch', fetchFromPublic());
});
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('crt-off');
  sessionStorage.clear();
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('App – Kam na střední', () => {
  it('obec Cheb + maturita → obory v dosahu, detail školy, Esc detail zavře', async () => {
    // prázdná adresa → výchozí stránka „Kam na střední“, bez boot sekvence
    render(App);
    expect(screen.queryByTestId('boot')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('skoly-filtr')).toBeTruthy(), { timeout: 5000 });
    expect(location.hash).toContain('m=skoly');
    expect(document.documentElement.classList.contains('theme-clean')).toBe(true);
    // bez domova: obory celého kraje
    const vse = screen.getAllByTestId('obor-row').length;
    expect(vse).toBeGreaterThan(20);

    const domov = screen.getByTestId('skoly-domov') as HTMLSelectElement;
    await fireEvent.change(domov, { target: { value: '554481' } }); // Cheb
    await fireEvent.click(screen.getByTestId('skoly-typ-maturita'));
    expect(location.hash).toContain('d=554481');
    expect(location.hash).toContain('t=maturita');

    const rows = screen.getAllByTestId('obor-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(vse);
    expect(rows[0].textContent).toMatch(/Cheb/);

    await fireEvent.click(rows[0]);
    const detail = screen.getByTestId('skola-detail');
    expect(detail.textContent).toContain('km od domova');
    expect(detail.textContent).not.toMatch(/NaN|undefined/);
    expect(location.hash).toMatch(/s=\d+/);

    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('skola-detail')).toBeNull());

    // záložka Přehled pro kraj a přechod do jiného režimu vrátí CRT vzhled
    await fireEvent.click(screen.getByTestId('tab-kraj'));
    expect(screen.getByTestId('kraj-prehled').textContent).toMatch(/nastoupilo/);
    await fireEvent.click(screen.getByTestId('mode-explore'));
    await waitFor(() => expect(document.documentElement.classList.contains('theme-clean')).toBe(false));
  }, 20000);

  it('odkaz s filtry obnoví stejný pohled', async () => {
    location.hash = '#/kraj?m=skoly&d=554481&t=vyucni&km=10';
    render(App);
    await waitFor(() => expect(screen.getByTestId('skoly-filtr')).toBeTruthy(), { timeout: 5000 });
    expect((screen.getByTestId('skoly-domov') as HTMLSelectElement).value).toBe('554481');
    expect(screen.getByTestId('skoly-typ-vyucni').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('link-invalid')).toBeNull();
  }, 20000);
});
