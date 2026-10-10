// @vitest-environment jsdom
//
// Úvodní stránka a hlavní menu na celé aplikaci nad reálným snapshotem public/data:
// prázdná adresa → úvod, rychlé hledání obce → „Obec v kostce“ → odkazy s obcí,
// rozbalovací skupiny menu (Esc, klik mimo), mobilní Menu, otázka pro AI poradce.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/svelte';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import App from '../../src/App.svelte';
import { zMenu } from './menu-helper.ts';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

/** fetch z public/; `poradce` = proxy AI poradce odpoví „bez klíče“ (503 JSON) → poradce je vidět */
function fetchFromPublic(poradce = false): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/poradce')) {
      return poradce
        ? new Response(JSON.stringify({ ok: false }), { status: 503, headers: { 'content-type': 'application/json' } })
        : new Response('not found', { status: 404 });
    }
    const full = path.join(PUBLIC_DIR, url.replace(/^\.\//, ''));
    if (!existsSync(full)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(full, 'utf8'), { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchFromPublic());
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

const hledat = () => screen.getByTestId('domu-hledat') as HTMLInputElement;

describe('App – úvodní stránka', () => {
  it('prázdná adresa → úvod; hledání „karl“ → Enter → Obec v kostce → odkaz na Kam na střední s obcí', async () => {
    render(App);
    await waitFor(() => expect(hledat()).toBeTruthy(), { timeout: 5000 });
    expect(location.hash).toContain('m=domu');
    expect(screen.queryByTestId('skoly-filtr')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Co potřebujete vyřešit?');
    // pět oblastí jako dlaždice
    for (const g of ['vzdelani', 'bydleni', 'volny-cas', 'prace', 'data']) expect(screen.getByTestId(`dlazdice-${g}`)).toBeTruthy();
    // AI poradce v testu neběží → blok s otázkami se neukáže
    expect(screen.queryByTestId('domu-ai')).toBeNull();

    // našeptávač bez diakritiky
    await fireEvent.input(hledat(), { target: { value: 'karl' } });
    expect(hledat().getAttribute('aria-expanded')).toBe('true');
    const nabidka = screen.getByTestId('domu-nabidka');
    expect(nabidka.hidden).toBe(false);
    expect(nabidka.querySelector('[role="option"]')!.textContent).toMatch(/Karlovy Vary/);
    await fireEvent.keyDown(hledat(), { key: 'Enter' });

    const k = await screen.findByTestId('obec-kostka');
    expect(location.hash).toContain('ho=554961');
    expect(hledat().value).toBe('Karlovy Vary');
    expect(hledat().getAttribute('aria-expanded')).toBe('false');
    const t = k.textContent ?? '';
    expect(t).toMatch(/Karlovy Vary/);
    expect(t).toMatch(/Mateřská škola/);
    expect(t).toMatch(/Praktický lékař/);
    expect(t).toMatch(/Nemocnice/);
    expect(t).toMatch(/Magistrát města Karlovy Vary/);
    expect(t).toMatch(/\d+,\d km/);
    expect(t).not.toMatch(/NaN|undefined|null/);
    expect(Number(screen.getByTestId('kostka-zastavky').textContent)).toBeGreaterThan(0);
    expect(screen.getAllByTestId('kostka-vylet')).toHaveLength(3);
    expect(screen.getByTestId('kostka-skoly').getAttribute('href')).toContain('d=554961');
    expect(screen.getByTestId('kostka-urady').getAttribute('href')).toContain('uo=554961');
    expect(screen.getByTestId('kostka-zivot').getAttribute('href')).toContain('zo=554961');
    expect(screen.getAllByTestId('kostka-vylet')[0].getAttribute('href')).toMatch(/vd=554961.*vp=/);

    // odkaz na Kam na střední předá obec
    await fireEvent.click(screen.getByTestId('kostka-skoly'));
    await waitFor(() => expect(location.hash).toContain('m=skoly'));
    expect(location.hash).toContain('d=554961');
    expect((screen.getByTestId('skoly-domov') as HTMLSelectElement).value).toBe('554961');

    // logo vrátí na úvod a karta obce zůstane (ho= v adrese)
    await fireEvent.click(screen.getByTestId('brand-home'));
    await waitFor(() => expect(location.hash).toContain('m=domu'));
    expect(screen.getByTestId('obec-kostka')).toBeTruthy();
  }, 20000);

  it('šipky v nabídce, Esc nabídku zavře; odkaz s ho= otevře kartu obce; malá obec bez chyb', async () => {
    location.hash = '#/kraj?m=domu&ho=537969'; // Otovice
    render(App);
    const k = await screen.findByTestId('obec-kostka', {}, { timeout: 5000 });
    expect(k.textContent).toMatch(/Otovice/);
    expect(k.textContent).not.toMatch(/NaN|undefined|null/);

    await fireEvent.input(hledat(), { target: { value: 'che' } });
    await fireEvent.keyDown(hledat(), { key: 'ArrowDown' });
    const id = hledat().getAttribute('aria-activedescendant');
    expect(id).toMatch(/^domu-obec-\d+$/);
    expect(document.getElementById(id!)!.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById(id!)!.textContent).toMatch(/Cheb/);
    await fireEvent.keyDown(hledat(), { key: 'Escape' });
    expect(hledat().getAttribute('aria-expanded')).toBe('false');

    // nic nenalezeno
    await fireEvent.input(hledat(), { target: { value: 'xyzzy' } });
    expect(screen.getByTestId('domu-nabidka').textContent).toMatch(/Žádná obec/);
  }, 20000);
});

describe('App – hlavní menu', () => {
  it('skupina se otevře klikem, Esc ji zavře a vrátí fokus; Úřady převezmou obec z úvodu', async () => {
    location.hash = '#/kraj?m=domu&ho=537969';
    render(App);
    await screen.findByTestId('obec-kostka', {}, { timeout: 5000 });
    const bydleni = screen.getByTestId('menu-bydleni');
    expect(bydleni.getAttribute('aria-controls')).toBe('menu-bydleni');
    expect(document.getElementById('menu-bydleni')).toBeTruthy();

    await fireEvent.click(bydleni);
    expect(bydleni.getAttribute('aria-expanded')).toBe('true');
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(bydleni.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(bydleni);

    // klik mimo menu panel zavře
    await fireEvent.click(bydleni);
    expect(bydleni.getAttribute('aria-expanded')).toBe('true');
    await fireEvent.pointerDown(document.body);
    expect(bydleni.getAttribute('aria-expanded')).toBe('false');

    // jiná skupina zavře předchozí
    await fireEvent.click(bydleni);
    await fireEvent.click(screen.getByTestId('menu-data'));
    expect(bydleni.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('menu-data').getAttribute('aria-expanded')).toBe('true');

    await zMenu('bydleni', 'mode-urady');
    expect(location.hash).toContain('m=urady');
    expect(location.hash).toContain('uo=537969');
    expect(bydleni.getAttribute('aria-expanded')).toBe('false');
    expect(bydleni.classList.contains('on')).toBe(true);
    expect(screen.getByTestId('mode-urady').getAttribute('aria-current')).toBe('page');

    // Volný čas: zkratka do kategorie
    await zMenu('volny-cas', 'menu-kat-rozhledny');
    expect(location.hash).toContain('m=vylety');
    expect(location.hash).toContain('vk=rozhledny');
    expect(location.hash).toContain('vd=537969');

    // Data: Zdroje dat otevřou dialog
    await zMenu('data', 'sources-btn');
    expect(await screen.findByRole('dialog')).toBeTruthy();
  }, 20000);

  it('mobilní tlačítko Menu otevře a zavře panel se všemi skupinami', async () => {
    location.hash = '#/kraj?m=domu';
    render(App);
    await waitFor(() => expect(hledat()).toBeTruthy(), { timeout: 5000 });
    const toggle = screen.getByTestId('menu-toggle');
    const nav = screen.getByTestId('hlavni-menu');
    expect(toggle.getAttribute('aria-controls')).toBe(nav.id);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(nav.classList.contains('nav--open')).toBe(true);
    // všechny položky jsou v panelu
    for (const m of ['skoly', 'score', 'urady', 'vylety', 'podnikani', 'penize', 'explore', 'nalezy']) {
      expect(nav.querySelector(`[data-testid="mode-${m}"]`)).toBeTruthy();
    }
    await fireEvent.click(screen.getByTestId('mode-skoly'));
    expect(location.hash).toContain('m=skoly');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Esc zavře otevřené menu a vrátí fokus na tlačítko
    await fireEvent.click(toggle);
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  }, 20000);
});

describe('App – AI poradce z úvodní stránky', () => {
  it('tlačítko „Zeptat se AI na obec“ otevře chat s otázkou', async () => {
    vi.stubGlobal('fetch', fetchFromPublic(true));
    location.hash = '#/kraj?m=domu&ho=554481';
    render(App);
    await screen.findByTestId('obec-kostka', {}, { timeout: 5000 });
    // poradce bez klíče je vidět → ukážou se i otázky na úvodní stránce
    await screen.findByTestId('domu-ai');
    await fireEvent.click(screen.getByTestId('kostka-ai'));
    const panel = await screen.findByTestId('poradce-panel');
    // bez klíče se otázka jen vloží do pole (odeslat nejde)
    await waitFor(() =>
      expect((panel.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Jak se žije v obci Cheb? Co je tam blízko?'),
    );
  }, 20000);
});
