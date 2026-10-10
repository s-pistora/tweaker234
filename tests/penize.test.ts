import { describe, it, expect } from 'vitest';
import {
  kc,
  kontrolaProjektu,
  parseCastka,
  parseDatum,
  platiVRoce,
  podle,
  projektyAktualni,
  projektyUkoncene,
  prubeh,
  souhrn,
  strategie,
  vouchery,
  isPenizeFile,
} from '../src/lib/penize.ts';

describe('penize: převod dat kraje', () => {
  it('částky ve všech zápisech, které se v datech kraje vyskytují', () => {
    expect(parseCastka('70000000')).toBe(70_000_000);
    expect(parseCastka('22 804 017,46')).toBeCloseTo(22_804_017.46);
    expect(parseCastka('22 804 017,46')).toBeCloseTo(22_804_017.46);
    expect(parseCastka('412536663,15')).toBeCloseTo(412_536_663.15);
    expect(parseCastka('74040869.35')).toBeCloseTo(74_040_869.35);
    expect(parseCastka('')).toBeNull();
  });

  it('data „2024_01_01“ i jen rok', () => {
    expect(parseDatum('2024_01_01')).toBe('2024-01-01');
    expect(parseDatum('2022')).toBe('2022');
    expect(parseDatum('nesmysl')).toBe('');
  });

  it('aktuální projekt: rozpočet, dotace, termíny; kontrola prošlého termínu a chybějících výdajů', () => {
    const p = projektyAktualni([
      {
        'Název projektu': 'Cyklostezka Ohře – Dalovice – Všeborovice',
        'Předpokládané výdaje': '45000000',
        'Předpokládaná celková výše dotace': '35 275 000,00',
        'Zahájení realizace projektu': '2022_04_01',
        'Předpokládané ukončení projektu': '2025_09_30',
        'Spolufinancování': 'Integrovaný regionální operační program',
      },
      { 'Název projektu': 'Technická pomoc', 'Zahájení realizace projektu': '2024_01_01', 'Předpokládané ukončení projektu': '2027_12_31' },
    ]);
    expect(p[0]).toMatchObject({ vydaje: 45_000_000, dotace: 35_275_000, od: '2022-04-01', do: '2025-09-30', stav: 'probiha' });
    const chyby = kontrolaProjektu(p, '2026-10-10');
    expect(chyby.some((c) => c.includes('měl skončit 30. 9. 2025'))).toBe(true);
    expect(chyby.some((c) => c.includes('nemá uvedené výdaje'))).toBe(true);
  });

  it('ukončené projekty: duplicitní řádky se sloučí a spočítají', () => {
    const r = { 'Název projektu': 'CLARA III', 'Registrační číslo projektu': 'X1', 'Zahájení realizace projektu': '2016_10_01', 'Ukončení realizace projektu': '2019_09_30' };
    const { projekty, duplicit } = projektyUkoncene([r, { ...r }, { ...r, 'Název projektu': 'Jiný' }]);
    expect(projekty).toHaveLength(2);
    expect(duplicit).toBe(1);
    expect(isPenizeFile({ updatedAt: 'x', sourceIds: [], projekty, strategie: [], chybyDat: [] })).toBe(true);
  });

  it('strategie: oblasti, platnost a řazení od nejnovějších', () => {
    const s = strategie([
      { 'název_dokumentu': 'Starý plán', 'rok_zahájení_platnosti': '2015', 'rok_ukončení_platnosti': '2019', 'oblast_působnosti': 'Doprava' },
      { 'název_dokumentu': 'Program rozvoje', 'rok_zahájení_platnosti': '2021', 'rok_ukončení_platnosti': '2027', 'oblast_působnosti': 'Sociální oblast; Zdravotnictví' },
    ]);
    expect(s[0].nazev).toBe('Program rozvoje');
    expect(s[0].oblasti).toEqual(['Sociální oblast', 'Zdravotnictví']);
    expect(platiVRoce(s[0], 2026)).toBe(true);
    expect(platiVRoce(s[1], 2026)).toBe(false);
  });
});

describe('penize: výpočty', () => {
  it('průběh projektu v čase', () => {
    expect(prubeh({ od: '2024-01-01', do: '2025-01-01' }, '2024-07-02')).toBeCloseTo(0.5, 1);
    expect(prubeh({ od: '2022', do: '2026' }, '2030-01-01')).toBe(1);
    expect(prubeh({ od: '', do: '2026' }, '2026-01-01')).toBeNull();
  });

  it('peníze krátce i celé', () => {
    // Intl odděluje tisíce nezlomitelnou mezerou
    const k = (n: number | null, kr?: boolean) => kc(n, kr).replace(/\u00a0|\u202f/g, ' ');
    expect(k(824_000_000)).toBe('824 mil. Kč');
    expect(k(24_186_353)).toBe('24,2 mil. Kč');
    expect(k(1_250_000_000)).toBe('1,3 mld. Kč');
    expect(k(170_000)).toBe('170 tis. Kč');
    expect(k(24_186_353, false)).toBe('24 186 353 Kč');
    expect(k(null)).toBe('—');
  });

  it('vouchery: souhrn počítá přidělené jen u úspěšných, agregace podle roku', () => {
    const f = (id: string, typ: string, rok: number, prideleno: number, uspesna: boolean) => ({
      id,
      name: id,
      lon: 12,
      lat: 50,
      obec: '554961',
      orp: '4103',
      attrs: { typ, rok, pozadovano: prideleno || 100, prideleno, uspesna },
    });
    const v = vouchery([f('a', 'inovacni', 2020, 100, true), f('b', 'inovacni', 2020, 50, true), f('c', 'kreativni', 2021, 0, false)]);
    expect(souhrn(v)).toEqual({ zadosti: 3, uspesne: 2, prideleno: 150, pozadovano: 250 });
    expect(podle(v, (x) => x.rok)).toEqual([{ klic: 2020, prideleno: 150, pocet: 2 }]);
  });
});
