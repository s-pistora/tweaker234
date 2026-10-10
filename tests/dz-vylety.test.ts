import { describe, it, expect } from 'vitest';
import { SADY, field, licence, toMisto, vstupne } from '../scripts/sources/dz-vylety.ts';
import { parseKhs } from '../scripts/sources/khs-koupani.ts';

const sada = (slug: string) => SADY.find((s) => s.slug === slug)!;

// úryvky skutečných atributů z ArcGIS služeb datazapad.cz (názvy sloupců se liší velikostí a jsou zkrácené)
const VLEK = {
  OBJECTID: 3,
  Název: 'Skiareál Hranice - Boží Dar',
  Počet_lanovek: null,
  Počet_vleků: 11,
  Počet_pásů__pojízdných_koberců_: 5,
  Poznámka: 'zimní i letní provoz',
  Webová_stránka: 'https://skiarealhranice.cz/',
  Telefonní_kontakt: 'tel:+420603539020',
  Kontaktní_e_mail: 'mailto:info@bozidar.cz',
  Kód_vyššího_územně_samosprávnéh: 'CZ041',
  Název_obce: 'Boží Dar',
  Kód_obce: 506486,
  Kód_obce_s_rozšířenou_působnost: 4106,
  Zeměpisná_délka_v_souřadnicovém: 12.927269,
  Zeměpisná_šířka_v_souřadnicovém: 50.410385,
  Zápis_vektorové_geometrie: 'POINT(50.4103853 12.9272686)',
  x: 12.927269,
  y: 50.410385,
};

const ROZHLEDNA = {
  OBJECTID: 1,
  název: 'Rozhledna Klínovec u Jáchymova',
  rozhledna: 'true',
  vyhlídková_věž: 'false',
  vyhlídka: 'false',
  vznik: 1884,
  přístup: 'přístupná za poplatek v otevíracích hodinách',
  vstupní_poplatek: 'true',
  kód_vyššího_územně_samosprávného_celku: 'CZ041',
  název_obce: 'Jáchymov',
  kód_obce: 555215,
  kód_obce_s_rozšířenou_působností: 4106,
  název_ulice: 'Jáchymov',
  číslo_domovní: 1016,
  poštovní_směrovací_číslo: 36301,
  x: 12.967892,
  y: 50.395943,
};

describe('dz-vylety: normalizace záznamu', () => {
  it('sjezdovka: čísla, tagy velikosti a provozu, kontakty bez tel:/mailto:, kódy území jako text', () => {
    const m = toMisto(VLEK, sada('vleky'), 0)!;
    expect(m).toMatchObject({
      id: 'vleky:3',
      kat: 'sjezdovky',
      nazev: 'Skiareál Hranice - Boží Dar',
      obec: '506486',
      orp: '4106',
      tel: '+420603539020',
      email: 'info@bozidar.cz',
      web: 'https://skiarealhranice.cz/',
      cisla: { vleky: 11, lanovky: 0, pasy: 5 },
    });
    expect(m.lon).toBeCloseTo(12.927, 3); // ze sloupce WGS84, ne z prohozeného WKT
    expect(m.lat).toBeCloseTo(50.41, 2);
    expect(m.tagy).toEqual(['velky', 'pas', 'celorocne']);
  });

  it('rozhledna: vstupné z boolean sloupce, rok vzniku, složená adresa, přístup jako poznámka', () => {
    const m = toMisto(ROZHLEDNA, sada('rozhledny'), 0)!;
    expect(m.vstupne).toBe(true);
    expect(m.cisla).toEqual({ vznik: 1884 });
    expect(m.adresa).toBe('Jáchymov 1016, 36301 Jáchymov');
    expect(m.poznamka).toBe('přístupná za poplatek v otevíracích hodinách');
    expect(m.tagy).toEqual(['rozhledna']);
  });

  it('záznam mimo Karlovarský kraj nebo bez souřadnic se zahodí', () => {
    expect(toMisto({ ...ROZHLEDNA, kód_vyššího_územně_samosprávného_celku: 'CZ042' }, sada('rozhledny'), 0)).toBeNull();
    expect(toMisto({ ...ROZHLEDNA, x: null, y: null }, sada('rozhledny'), 0)).toBeNull();
  });

  it('vstupné z textového sloupce „vstup“', () => {
    expect(vstupne({ vstup: 'zpoplatněný' })).toBe(true);
    expect(vstupne({ vstup: 'volný' })).toBe(false);
    expect(vstupne({ vstup: 'dobrovolné vstupné' })).toBe(false);
    expect(vstupne({})).toBeNull();
  });

  it('field: přesný název má přednost před prefixem (název ≠ název_obce)', () => {
    expect(field({ název_obce: 'Cheb', název: 'Hrad Cheb' }, ['název'])).toBe('Hrad Cheb');
    expect(field({ Kód_obce_s_rozšířenou_působnost: 4102, Kód_obce: 554481 }, ['kód_obce'])).toBe(554481);
  });

  it('licence z popisu položky', () => {
    expect(licence('<p>Licence: Creative Commons Uveďte původ 4.0 (CC BY 4.0)</p>')).toBe('CC BY 4.0');
    expect(licence('CC0 1.0')).toBe('CC0 1.0');
    expect(licence(undefined)).toBe('neuvedeno poskytovatelem');
  });
});

const KHS_HTML = `
<h4>Kontrola kvality vody v roce 2026</h4>
<h5>Rybník – pláž</h5>
<table><tbody>
<tr><td><span>Datum odběru</span></td><td>25. 5.</td><td>8. 6.</td><td>22. 6.</td><td></td></tr>
<tr><td><span>Datum hodnocení</span></td><td>28. 5.</td><td>11. 6.</td><td>25. 6.</td><td></td></tr>
<tr><td><span>Hodnocení</span></td><td><img src="http://www.khskv.cz/wp-content/uploads/2026/05/smile_blue.gif"></td><td><img src="x/smile_green.gif"></td><td><img src="x/smile_orange.gif"></td><td></td></tr>
<tr><td><span>Poznámka</span></td><td></td><td></td><td><span>sinice, chlorofyl-a</span></td><td></td></tr>
</tbody></table>
<h5>Rybník – molo</h5>
<table><tbody>
<tr><td>Datum odběru</td><td>25. 5.</td><td>8. 6.</td></tr>
<tr><td>Hodnocení</td><td><img src="x/smile_blue.gif"></td><td><img src="x/smile_green.gif"></td></tr>
<tr><td>Poznámka</td><td></td><td></td></tr>
</tbody></table>
<table><tbody>
<tr><td><img src="x/smile_black.gif"></td><td>voda nebezpečná ke koupání</td></tr>
</tbody></table>`;

describe('khs-koupani: výtah hodnocení vody', () => {
  it('bere poslední vyplněné hodnocení a z odběrných míst to nejhorší; legenda se ignoruje', () => {
    expect(parseKhs(KHS_HTML)).toEqual({ trida: 'zhorsena', datum: '2026-06-22', poznamka: 'sinice, chlorofyl-a' });
  });
  it('stránka bez tabulek → bez hodnocení', () => {
    expect(parseKhs('<p>Kontrola kvality vody v roce 2026</p>')).toEqual({ trida: 'na', datum: null, poznamka: null });
  });
});

describe('Dobroty Karlovarského kraje: výrobky → výrobci', () => {
  it('sloučí oceněné výrobky jednoho výrobce do jednoho místa se seznamem a štítky', async () => {
    const { SADY, seskupDobroty } = await import('../scripts/sources/dz-vylety.ts');
    const cfg = SADY.find((s) => s.slug === 'dobroty')!;
    const radek = (nazev: string, rok: number, umisteni: string, flag: string) => ({
      OBJECTID: 1,
      název: nazev,
      rok_soutěže: rok,
      kategorie: 'Masné výrobky',
      umístění_v_kategorii: umisteni,
      masné_výrobky: flag === 'maso' ? 'true' : 'false',
      mléčné_výrobky: flag === 'mleko' ? 'true' : 'false',
      výrobce: 'Josef Pelant',
      webová_stránka: 'https://www.maso-pelant.cz/',
      kód_vyššího_územně_samosprávného_celku: 'CZ041',
      název_obce: 'Bochov',
      kód_obce: 555029,
      x: 12.984177,
      y: 50.19035,
    });
    const mista = seskupDobroty(
      [radek('Klobása z komína', 2026, '1.', 'maso'), radek('Pršut', 2025, '2.', 'maso'), radek('Sýr', 2024, '3.', 'mleko')],
      cfg,
    );
    expect(mista).toHaveLength(1);
    const m = mista[0];
    expect(m.nazev).toBe('Josef Pelant');
    expect(m.kat).toBe('dobroty');
    expect(m.tagy.sort()).toEqual(['maso', 'mleko', 'vitez']);
    expect(m.cisla).toEqual({ vyrobky: 3, rok: 2026 });
    expect(m.popis).toContain('Klobása z komína (Masné výrobky, 2026, 1. místo)');
    expect(m.web).toBe('https://www.maso-pelant.cz/');
  });
});
