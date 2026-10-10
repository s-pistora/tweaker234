// @vitest-environment jsdom
//
// Režim „Kde by se mi dobře žilo?“ na celé aplikaci nad reálným snapshotem public/data:
// vlastní mapa 134 obcí, výběr požadavků v URL, body na mapě, detail obce s větami.
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

describe('App – Kde by se mi dobře žilo?', () => {
  it('mapa obcí, požadavky v URL, body na mapě a detail obce', async () => {
    location.hash = '#/kraj?m=score';
    render(App);
    const mapa = await screen.findByTestId('zivot-mapa', {}, { timeout: 8000 });

    // vlastní mapa všech 134 obcí, obarvená podle doporučeného výběru
    expect(mapa.querySelectorAll('path[data-code]')).toHaveLength(134);
    expect(location.hash).toMatch(/zp=[^&]*zastavka:1/);
    expect(location.hash).toMatch(/^#\/kraj/); // drill-down Statistiky se nemění
    expect(screen.getByTestId('zivot-top').querySelectorAll('li')).toHaveLength(10);

    // přidat požadavek a nastavit ho jako velmi důležitý
    await fireEvent.click(screen.getByTestId('zp-lekarna'));
    expect(location.hash).toMatch(/zp=[^&]*lekarna:1/);
    await fireEvent.click(screen.getByTestId('zd-lekarna-2'));
    expect(location.hash).toMatch(/zp=[^&]*lekarna:2/);
    expect(screen.getByTestId('zivot-pocet').textContent).toMatch(/5/);

    // lékárny na mapě
    await fireEvent.click(screen.getByTestId('zu-lekarna'));
    expect(location.hash).toContain('zu=lekarna');
    await waitFor(() => expect(mapa.querySelectorAll('[data-pt]').length).toBeGreaterThan(20));
    expect(screen.getByTestId('zivot-ukaz').textContent).toMatch(/Lékárna/);

    // detail obce (Karlovy Vary) z mapy
    await fireEvent.click(mapa.querySelector('path[data-code="554961"]')!);
    expect(location.hash).toContain('zo=554961');
    const detail = screen.getByTestId('zivot-detail');
    expect(detail.textContent).toMatch(/Karlovy Vary/);
    // pořadí jen mezi hodnocenými obcemi (obec bez obyvatel se neřadí)
    expect(detail.textContent).toMatch(/\d+\.\s+z 133/);
    // detail otevřel uživatel → fokus v detailu; po zavření zpět
    expect(detail.contains(document.activeElement)).toBe(true);
    expect(detail.textContent).toMatch(/Nejbližší lékárna je \d+(,\d)? km od středu obce\./);
    expect(detail.textContent).toMatch(/Podíl nezaměstnaných je \d+,\d %/);
    expect(detail.textContent).not.toMatch(/NaN|undefined|null/);

    // Esc nejdřív zavře detail, pak skryje body
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('zivot-detail')).toBeNull());
    expect(location.hash).not.toContain('zo=');
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(mapa.querySelectorAll('[data-pt]')).toHaveLength(0));

    // zrušit vše → bez skóre, odkaz to pamatuje
    await fireEvent.click(screen.getByTestId('zivot-reset'));
    expect(location.hash).toMatch(/zp=(&|$)/);
    expect(screen.getByTestId('zivot-top').querySelectorAll('li')).toHaveLength(0);
    await fireEvent.click(screen.getByTestId('zivot-doporuceny'));
    expect(screen.getByTestId('zivot-top').querySelectorAll('li')).toHaveLength(10);
  }, 30000);

  it('odkaz s detailem obce otevře stejný pohled', async () => {
    location.hash = '#/kraj?m=score&zp=mlada-obec:2,blizko-cheb:1&zo=554481';
    render(App);
    const detail = await screen.findByTestId('zivot-detail', {}, { timeout: 8000 });
    expect(detail.textContent).toMatch(/Cheb/);
    expect(detail.textContent).toMatch(/Tohle je přímo Cheb\./);
    expect(detail.textContent).toMatch(/Podíl dětí 0–14 let je \d+,\d % \(\d{4}\)\./);
    expect(detail.textContent).toMatch(/velmi důležité/);
    // otevření z odkazu fokus nekrade
    expect(detail.contains(document.activeElement)).toBe(false);
  }, 20000);

  it('přiblížená obec: vrstvy všech požadavků, chybějící služba s odkazem na jinou obec, vybrané místo', async () => {
    // Milhostov (malá obec u Chebu): nemocnice ani lékárna v obci není
    location.hash = '#/kraj?m=score&zp=nemocnice:1,lekarna:1,mlada-obec:1&zo=554651';
    render(App);
    const detail = await screen.findByTestId('zivot-detail', {}, { timeout: 8000 });
    const mapa = screen.getByTestId('zivot-mapa');

    // mapa ukazuje jen vybranou obec (bez okolních obcí)
    expect(mapa.querySelectorAll('path[data-code]')).toHaveLength(1);
    expect(mapa.querySelector('path[data-code="554651"]')).toBeTruthy();

    // legenda: jen požadavky s body, přepínač s aria-pressed a počtem v obci
    const vrstvy = screen.getByTestId('zivot-vrstvy');
    expect(vrstvy.querySelectorAll('button[aria-pressed]')).toHaveLength(2);
    expect(screen.getByTestId('zv-nemocnice').textContent).toMatch(/v obci 0/);
    // body obou vrstev, každá jiný tvar značky; nejbližší nemocnice je na mapě i mimo výřez
    const znacky = () => [...mapa.querySelectorAll('[data-pt]')].map((e) => e.getAttribute('data-pt')!);
    await waitFor(() => expect(znacky().some((id) => id.startsWith('nemocnice|'))).toBe(true));
    expect(znacky().some((id) => id.startsWith('lekarna|'))).toBe(true);
    const tvary = new Set([...mapa.querySelectorAll('[data-pt]')].map((e) => e.textContent));
    expect(tvary.size).toBe(2);

    // skrýt vrstvu
    await fireEvent.click(screen.getByTestId('zv-lekarna'));
    expect(screen.getByTestId('zv-lekarna').getAttribute('aria-pressed')).toBe('false');
    expect(znacky().some((id) => id.startsWith('lekarna|'))).toBe(false);

    // „V obci A není. Nejbližší je v obci B (x km): …“ a B je tlačítko
    const chybi = screen.getByTestId('zivot-chybi');
    expect(chybi.textContent).toMatch(/Nemocnice.*v obci Milhostov není\. Nejbližší je\s+v obci\s+\S+.*\(\d+(,\d)? km\)/s);
    // za dvojtečkou je název místa (ne prázdno) a věta nekončí dvojitou tečkou
    expect(chybi.textContent).toMatch(/km\):\s*\p{L}/u);
    expect(chybi.textContent).not.toMatch(/\.\./);
    expect(detail.textContent).not.toMatch(/NaN|undefined|null/);
    const obecB = chybi.querySelector('button')!;
    const nazevB = obecB.textContent!;
    await fireEvent.click(obecB);
    await waitFor(() => expect(screen.getByTestId('zivot-detail').querySelector('h2')!.textContent).toBe(nazevB));
    expect(location.hash).not.toContain('zo=554651');

    // „Celý kraj“ vrátí všech 134 obcí, detail zůstane
    await fireEvent.click(screen.getByTestId('zivot-cely-kraj'));
    expect(screen.getByTestId('zivot-priblizit')).toBeTruthy();
    expect(mapa.querySelectorAll('path[data-code]')).toHaveLength(134);
    expect(screen.getByTestId('zivot-detail')).toBeTruthy();
  }, 30000);

  it('obec bez stálých obyvatel: v detailu jen poznámka, v pořadí chybí', async () => {
    location.hash = '#/kraj?m=score&zp=klidna-obec:1&zo=555177';
    render(App);
    const detail = await screen.findByTestId('zivot-detail', {}, { timeout: 8000 });
    expect(screen.getByTestId('zivot-neobydlena').textContent).toMatch(/nemá stálé obyvatele, nehodnotíme ji/);
    expect(detail.textContent).not.toMatch(/žije 0 obyvatel/);
    expect(screen.getByTestId('zivot-top').querySelector('[data-testid="zt-555177"]')).toBeNull();
  }, 20000);
});
