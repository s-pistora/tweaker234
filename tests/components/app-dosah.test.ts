// @vitest-environment jsdom
//
// Mapy v běžící aplikaci: s bydlištěm se kreslí jen objekty do zvolené vzdálenosti.
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

import { vzdalenostKm } from '../../src/lib/skoly.ts';
import { areaFeatures } from '../../src/lib/map/project.ts';
import { centroidy } from '../../src/lib/map/centroids.ts';
const pub = (p: string) => JSON.parse(readFileSync(path.join(PUBLIC_DIR, 'data', p), 'utf8'));
const stredy = centroidy(areaFeatures(pub('geo/kv-obce.topo.json')));
const skolaPoloha = new Map<string, { lat: number; lon: number }>(
  pub('skoly/obory.json').obory.map((o: { izo: string; lat: number; lon: number }) => [o.izo, o]),
);
const mistoPoloha = new Map<string, { lat: number; lon: number }>(
  pub('vylety/mista.json').mista.map((m: { id: string; lat: number; lon: number }) => [m.id, m]),
);

describe('App – mapy respektují dosah', () => {
  for (const [obec, km] of [
    ['554481', 10],
    ['560286', 25],
    ['554961', 5],
  ] as const) {
    it(`Kam na střední: obec ${obec}, ${km} km – jen školy v dosahu, žádné šedé tečky`, async () => {
      location.hash = `#/kraj?m=skoly&d=${obec}&km=${km}`;
      render(App);
      await waitFor(() => expect(screen.getByTestId('skoly-mapa')).toBeTruthy(), { timeout: 5000 });
      const mapa = screen.getByTestId('skoly-mapa');
      expect(mapa.querySelectorAll('.tecka')).toHaveLength(0);
      const znacky = [...mapa.querySelectorAll('circle.skola')];
      expect(znacky.length).toBeGreaterThan(0);
      const d = stredy[obec];
      for (const z of znacky) {
        const p = skolaPoloha.get(z.getAttribute('data-izo')!)!;
        expect(vzdalenostKm(d.lat, d.lon, p.lat, p.lon)).toBeLessThanOrEqual(km);
      }
      // počet škol na mapě = počet karet škol v seznamu
      const nadpis = screen.getByTestId('obory-list').querySelector('h2')!.textContent!;
      expect(Number(nadpis.match(/\d+/)![0])).toBe(znacky.length);
      // kružnice dosahu je vykreslená
      expect(mapa.querySelector('.kruh')).toBeTruthy();
    }, 20000);
  }

  it('Kam vyrazit: rozcestník i kategorie – body jen do dosahu', async () => {
    for (const hash of ['#/kraj?m=vylety&vd=554481&vkm=10', '#/kraj?m=vylety&vk=pamatky&vd=560286&vkm=20']) {
      cleanup();
      location.hash = hash;
      const { container } = render(App);
      await waitFor(() => expect(container.querySelector('[data-pt]')).toBeTruthy(), { timeout: 5000 });
      const obec = /vd=(\d+)/.exec(hash)![1];
      const km = Number(/vkm=(\d+)/.exec(hash)![1]);
      const d = stredy[obec];
      const body = [...container.querySelectorAll('[data-pt]')];
      for (const b of body) {
        const p = mistoPoloha.get(b.getAttribute('data-pt')!)!;
        expect(p).toBeTruthy();
        expect(vzdalenostKm(d.lat, d.lon, p.lat, p.lon)).toBeLessThanOrEqual(km);
      }
    }
  }, 30000);
});

describe('App – tlačítka mapy škol', () => {
  it('+ přiblíží, − oddálí, „Celý kraj“ vrátí celý pohled; klik na obec nastaví bydliště', async () => {
    location.hash = '#/kraj?m=skoly';
    render(App);
    await waitFor(() => expect(screen.getByTestId('skoly-mapa')).toBeTruthy(), { timeout: 5000 });
    const svg = screen.getByTestId('skoly-mapa').querySelector('svg')!;
    const sirka = () => Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const cely = sirka();
    await fireEvent.click(screen.getByRole('button', { name: 'Přiblížit' }));
    await waitFor(() => expect(sirka()).toBeLessThan(cely));
    const pri = sirka();
    await fireEvent.click(screen.getByRole('button', { name: 'Oddálit' }));
    await waitFor(() => expect(sirka()).toBeGreaterThan(pri));
    await fireEvent.click(screen.getByRole('button', { name: 'Přiblížit' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Celý kraj' }));
    await waitFor(() => expect(sirka()).toBe(cely));
    // klik na obec = bydliště → kružnice a přiblížení na okolí
    await fireEvent.click(svg.querySelector('path[data-code="554481"]')!);
    await waitFor(() => expect(location.hash).toContain('d=554481'));
    await waitFor(() => expect(svg.querySelector('.kruh')).toBeTruthy());
  }, 20000);
});

describe('App – mapa Kam vyrazit se přiblíží na dosah', () => {
  it('s bydlištěm je výřez mapy menší než celý kraj, bez bydliště celý kraj', async () => {
    location.hash = '#/kraj?m=vylety&vk=hrady-zamky&vd=554481&vkm=15';
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('[data-testid="map"] svg')).toBeTruthy(), { timeout: 5000 });
    const svg = container.querySelector('[data-testid="map"] svg')!;
    await waitFor(() => expect(Number(svg.getAttribute('viewBox')!.split(' ')[2])).toBeLessThan(600));
    // podklad je jednobarevný (žádné vzory tříd)
    const vyplne = new Set([...svg.querySelectorAll('path.area')].map((p) => p.getAttribute('fill')));
    expect([...vyplne]).toEqual(['#dfe8f3']);
  }, 20000);
});

describe('App – profil Moje obec', () => {
  it('z Obce v kostce na úvodu do profilu: čísla, sekce, přechod do části s předvyplněnou obcí', async () => {
    location.hash = '#/kraj?m=domu&ho=560537';
    render(App);
    await waitFor(() => expect(screen.getByTestId('obec-kostka')).toBeTruthy(), { timeout: 5000 });
    await fireEvent.click(screen.getByTestId('kostka-profil'));
    await waitFor(() => expect(screen.getByTestId('profil-cisla')).toBeTruthy());
    expect(location.hash).toContain('m=obec');
    expect(document.querySelector('h1')!.textContent).toBe('Loket');
    expect(screen.getByTestId('profil-cisla').textContent).toContain('obyvatel');
    const sekce = screen.getByTestId('profil-sekce');
    expect(sekce.querySelectorAll('section')).toHaveLength(4);
    expect(sekce.textContent).toContain('Městský úřad Loket');
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
    await fireEvent.click(screen.getByText('Kontakty a datové schránky'));
    await waitFor(() => expect(screen.getByTestId('urady-karty')).toBeTruthy());
    expect((screen.getByTestId('urady-obec') as HTMLSelectElement).value).toBe('560537');
  }, 20000);
});

describe('App – hledání napříč aplikací', () => {
  it('najde obec, místo i školu bez diakritiky a otevře správnou část', async () => {
    render(App);
    await waitFor(() => expect(screen.getByTestId('domu-hledat')).toBeTruthy(), { timeout: 5000 });
    const pole = screen.getByTestId('hledani') as HTMLInputElement;
    await fireEvent.focus(pole);
    await fireEvent.input(pole, { target: { value: 'hrad loket' } });
    const vys = await screen.findByTestId('hledani-vysledky');
    const hrad = [...vys.querySelectorAll('li')].find((li) => li.textContent!.includes('Hrad Loket'))!;
    expect(hrad).toBeTruthy();
    await fireEvent.mouseDown(hrad);
    await waitFor(() => expect(location.hash).toContain('m=vylety'));
    expect(location.hash).toMatch(/vp=/);

    await fireEvent.focus(pole);
    await fireEvent.input(pole, { target: { value: 'gymnazium ostrov' } });
    const vys2 = await screen.findByTestId('hledani-vysledky');
    expect(vys2.querySelector('li')!.textContent).toContain('Střední škola');
    await fireEvent.keyDown(pole, { key: 'Enter' });
    await waitFor(() => expect(location.hash).toContain('m=skoly'));
    expect(location.hash).toMatch(/[?&]s=\d+/);

    await fireEvent.focus(pole);
    await fireEvent.input(pole, { target: { value: 'sokolov' } });
    await screen.findByTestId('hledani-vysledky');
    await fireEvent.keyDown(pole, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('profil-cisla')).toBeTruthy());
    expect(document.querySelector('h1')!.textContent).toBe('Sokolov');
  }, 20000);
});

describe('App – srovnání oborů', () => {
  it('dva obory přidané tlačítkem + se ukážou vedle sebe v tabulce', async () => {
    location.hash = '#/kraj?m=skoly&d=554481&km=20';
    render(App);
    await waitFor(() => expect(screen.getAllByTestId('porovnat').length).toBeGreaterThan(2), { timeout: 5000 });
    const btns = screen.getAllByTestId('porovnat');
    await fireEvent.click(btns[0]);
    expect(screen.getByTestId('srovnani-lista').textContent).toContain('vybráno 1 z 3');
    expect((screen.getByTestId('srovnani-otevrit') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(btns[1]);
    await fireEvent.click(screen.getByTestId('srovnani-otevrit'));
    const dlg = await screen.findByTestId('srovnani');
    expect(dlg.querySelectorAll('thead th')).toHaveLength(2);
    expect(dlg.textContent).toContain('Loni obsazeno');
    expect(dlg.textContent).not.toMatch(/NaN|undefined/);
    await fireEvent.click(dlg.querySelectorAll<HTMLButtonElement>('.rm')[0]);
    await waitFor(() => expect(screen.getByTestId('srovnani').querySelectorAll('thead th')).toHaveLength(1));
  }, 20000);
});

describe('App – tip na celý den', () => {
  it('po volbě obce sestaví okruh se zastávkami v dosahu a odkazem na Mapy.cz', async () => {
    location.hash = '#/kraj?m=vylety&vd=560537&vkm=20';
    render(App);
    const den = await screen.findByTestId('den-tip', {}, { timeout: 5000 });
    expect(den.querySelectorAll('li').length).toBeGreaterThanOrEqual(2);
    expect(den.textContent).not.toMatch(/NaN|undefined/);
    const prvni = den.querySelector('li strong')!.textContent;
    expect((screen.getByTestId('den-mapy') as HTMLAnchorElement).href).toContain('mapy.cz');
    await fireEvent.click(screen.getByTestId('den-jiny'));
    await waitFor(() => expect(screen.getByTestId('den-tip').querySelector('li strong')!.textContent).not.toBe(prvni));
  }, 20000);
});
