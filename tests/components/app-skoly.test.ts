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
  // jsdom nemá ResizeObserver (mapa jím měří svou velikost)
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
  sessionStorage.clear();
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('App – Kam na střední', () => {
  it('obec Cheb + maturita → obory v dosahu, detail školy, Esc detail zavře', async () => {
    // prázdná adresa → úvodní stránka info centra, z ní dlaždicí do „Kam na střední“
    render(App);
    expect(screen.queryByTestId('boot')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('domu-dlazdice')).toBeTruthy(), { timeout: 5000 });
    expect(location.hash).toContain('m=domu');
    await fireEvent.click(screen.getByTestId('domu-skoly'));
    await waitFor(() => expect(screen.getByTestId('skoly-filtr')).toBeTruthy());
    expect(location.hash).toContain('m=skoly');
    // bez domova: školy celého kraje (karty po 8, uvnitř obory)
    const nadpis = () => screen.getByTestId('obory-list').querySelector('h2')!.textContent ?? '';
    expect(nadpis()).toMatch(/škol v kraji/);
    const vse = Number(nadpis().match(/\d+/)![0]);
    expect(vse).toBeGreaterThan(20);
    expect(screen.getAllByTestId('obor-row')).toHaveLength(8);
    // mapa: značka pro každou školu ve výsledcích
    expect(screen.getByTestId('skoly-mapa').querySelectorAll('circle.skola')).toHaveLength(vse);

    const domov = screen.getByTestId('skoly-domov') as HTMLSelectElement;
    await fireEvent.change(domov, { target: { value: '554481' } }); // Cheb
    await fireEvent.click(screen.getByTestId('skoly-typ-maturita'));
    expect(location.hash).toContain('d=554481');
    expect(location.hash).toContain('t=maturita');

    const rows = screen.getAllByTestId('obor-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(nadpis()).toMatch(/od Cheb/);
    // kružnice dosahu kolem domova
    expect(screen.getByTestId('skoly-mapa').querySelector('.kruh')).toBeTruthy();
    // poradny a stažení dat
    expect(screen.getByTestId('poradny').textContent).toContain('Pedagogicko-psychologická poradna');
    expect(screen.getByTestId('stahnout-data').textContent).toMatch(/Stáhnout data \(CSV, \d+/);
    expect(Number(nadpis().match(/\d+/)![0])).toBeLessThan(vse);
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
    expect(screen.getByTestId('kraj-prehled').textContent).toMatch(/nastoupili/);
    await fireEvent.click(screen.getByTestId('mode-explore'));
    await waitFor(() => expect(location.hash).toContain('m=explore'));
  }, 20000);

  it('odkaz s filtry obnoví stejný pohled', async () => {
    location.hash = '#/kraj?m=skoly&d=554481&t=vyucni&km=10';
    render(App);
    await waitFor(() => expect(screen.getByTestId('skoly-filtr')).toBeTruthy(), { timeout: 5000 });
    expect((screen.getByTestId('skoly-domov') as HTMLSelectElement).value).toBe('554481');
    expect(screen.getByTestId('skoly-typ-vyucni').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('link-invalid')).toBeNull();

    // klik na značku školy v mapě otevře detail
    const znacka = screen.getByTestId('skoly-mapa').querySelector('circle.skola')!;
    await fireEvent.click(znacka);
    const detail = await screen.findByTestId('skola-detail');
    expect(detail.textContent).toContain(znacka.getAttribute('aria-label')!.split(',')[0].replace(/,?\s*příspěvková organizace$/i, ''));
  }, 20000);

  it('plánovač: přidat obory z detailu školy, pořadí v adrese, termíny a kalendář', async () => {
    location.hash = '#/kraj?m=skoly&d=554481&t=maturita&km=25';
    render(App);
    await waitFor(() => expect(screen.getByTestId('skoly-filtr')).toBeTruthy(), { timeout: 5000 });
    await fireEvent.click(screen.getByTestId('tab-plan'));
    expect(screen.getByTestId('plan-prazdny')).toBeTruthy();
    await fireEvent.click(screen.getByTestId('tab-hledat'));

    await fireEvent.click(screen.getAllByTestId('obor-row')[0]);
    const tlacitka = screen.getAllByTestId('plan-toggle');
    await fireEvent.click(tlacitka[0]);
    expect(location.hash).toMatch(/p=\d+_/);
    expect(screen.getAllByTestId('plan-toggle')[0].getAttribute('aria-pressed')).toBe('true');
    await fireEvent.keyDown(window, { key: 'Escape' });

    await fireEvent.click(screen.getByTestId('tab-plan'));
    expect(screen.getByTestId('tab-plan').textContent).toContain('(1)');
    expect(screen.getAllByTestId('plan-polozka')).toHaveLength(1);
    expect(screen.getByTestId('plan-terminy').textContent).toContain('12. dubna 2027');
    expect(screen.getByTestId('planovac').textContent).not.toMatch(/NaN|undefined/);

    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: () => {} }));
    await fireEvent.click(screen.getByTestId('plan-ics'));
    expect(createObjectURL).toHaveBeenCalled();

    await fireEvent.click(screen.getByTestId('plan-odebrat'));
    expect(screen.getByTestId('plan-prazdny')).toBeTruthy();
    expect(location.hash).not.toContain('p=');
  }, 20000);
});
