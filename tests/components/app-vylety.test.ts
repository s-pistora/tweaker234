// @vitest-environment jsdom
//
// Režim „Kam vyrazit“ na celé aplikaci nad reálným snapshotem public/data:
// rozcestník → kategorie → filtr → detail místa → Esc zpět, sdílený odkaz, průvodce.
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

describe('App – Kam vyrazit', () => {
  it('rozcestník → sjezdovky → filtr + bydliště → detail → Esc zpět na rozcestník', async () => {
    // prázdná adresa → úvodní stránka; Kam vyrazit z menu Volný čas
    render(App);
    await waitFor(() => expect(screen.getByTestId('domu-hledat')).toBeTruthy(), { timeout: 5000 });
    await zMenu('volny-cas', 'mode-vylety');
    expect(location.hash).toContain('m=vylety');

    // rozcestník: dlaždice všech kategorií s počty
    const tile = screen.getByTestId('kat-sjezdovky');
    expect(tile.textContent).toMatch(/\d+\s+areál/);
    await fireEvent.click(tile);
    expect(location.hash).toContain('vk=sjezdovky');
    expect(screen.getByTestId('vylety-filtr')).toBeTruthy();
    const vsechny = screen.getAllByTestId(/^misto-vleky:/).length;
    expect(vsechny).toBeGreaterThan(5);

    // filtr přímo pro kategorii: lanovka
    await fireEvent.click(screen.getByTestId('chip-lanovka'));
    expect(location.hash).toContain('vf=lanovka');
    const sLanovkou = screen.getAllByTestId(/^misto-vleky:/);
    expect(sLanovkou.length).toBeGreaterThan(0);
    expect(sLanovkou.length).toBeLessThan(vsechny);

    // bydliště Karlovy Vary → vzdálenosti v kartách a v nadpisu
    await fireEvent.change(screen.getByTestId('vylety-domov'), { target: { value: '554961' } });
    expect(location.hash).toContain('vd=554961');
    expect(document.querySelector('h1')!.textContent).toMatch(/od obce Karlovy Vary/);
    const prvni = screen.getAllByTestId(/^misto-vleky:/)[0];
    expect(prvni.textContent).toMatch(/\d+(,\d)? km/);

    await fireEvent.click(prvni);
    const detail = screen.getByTestId('misto-detail');
    expect(detail.textContent).toMatch(/vleků a lanovek/);
    expect(detail.textContent).toMatch(/vzdušnou čarou od obce Karlovy Vary/);
    expect(detail.textContent).not.toMatch(/NaN|undefined|null/);
    expect(location.hash).toMatch(/vp=vleky/);

    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('misto-detail')).toBeNull());
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('kat-koupani')).toBeTruthy());
    expect(location.hash).not.toContain('vk=');
  }, 20000);

  it('odkaz na koupání s filtrem kvality vody obnoví stejný pohled', async () => {
    location.hash = '#/kraj?m=vylety&vk=koupani&vf=voda-ok';
    render(App);
    await waitFor(() => expect(screen.getByTestId('vylety-filtr')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('chip-voda-ok').getAttribute('aria-pressed')).toBe('true');
    for (const card of screen.queryAllByTestId(/^misto-koupaci/)) {
      expect(card.textContent).toMatch(/vhodná/);
      expect(card.textContent).not.toMatch(/nevhodná|nebezpečná/);
    }
  }, 20000);

  it('mapa nabízí jen Karlovarský kraj (ORP), ne kraje ČR', async () => {
    location.hash = '#/kraj?m=explore';
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('path[data-code="4103"]')).toBeTruthy(), { timeout: 5000 });
    expect(container.querySelector('path[data-code="CZ042"]')).toBeNull();
    expect(location.hash).toMatch(/^#\/orp/);
  }, 20000);

  it('průvodce: nejvýš 10 kroků přes úvod, menu a části; každý cíl existuje; Esc vrátí původní stránku', async () => {
    location.hash = '#/kraj?m=skoly';
    render(App);
    await waitFor(() => expect(screen.getByTestId('skoly-filtr')).toBeTruthy(), { timeout: 5000 });
    await fireEvent.click(screen.getByTestId('tour-btn'));
    const tour = await screen.findByTestId('pruvodce');
    const celkem = Number(/Krok 1 z (\d+)/.exec(tour.textContent ?? '')?.[1]);
    // AI poradce v testech neběží → jeho krok se vynechá
    expect(celkem).toBe(9);
    const CILE = ['', 'hledani', 'kostka', 'nav', 'dd-volny-cas', 'filtr', 'zivot-panel', 'urady', 'tools'];
    const karta = () => screen.getByRole('dialog');
    for (let i = 0; i < celkem; i++) {
      await waitFor(() => expect(tour.textContent).toMatch(new RegExp(`Krok ${i + 1} z`)));
      await waitFor(() => expect(karta().getAttribute('data-cil')).toBe(CILE[i]), { timeout: 3000 });
      if (CILE[i]) expect(document.querySelector(`[data-tour="${CILE[i]}"]`)).toBeTruthy();
      if (i === 0) expect(location.hash).toContain('m=domu');
      if (i === 2) {
        expect(location.hash).toContain('ho=554961');
        expect(screen.getByTestId('obec-kostka').textContent).toMatch(/Karlovy Vary/);
      }
      // krok s panelem Volný čas ho otevře, další ho zavře
      if (i === 4) expect(screen.getByTestId('menu-volny-cas').getAttribute('aria-expanded')).toBe('true');
      if (i === 5) {
        expect(screen.getByTestId('menu-volny-cas').getAttribute('aria-expanded')).toBe('false');
        expect(location.hash).toContain('vk=koupani');
      }
      if (i === 7) expect(location.hash).toContain('m=urady');
      if (i < celkem - 1) await fireEvent.click(screen.getByTestId('pruvodce-dalsi'));
    }
    await fireEvent.keyDown(karta(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('pruvodce')).toBeNull());
    await waitFor(() => expect(location.hash).toContain('m=skoly'));
    expect(location.hash).not.toContain('ho=');
  }, 30000);
});
