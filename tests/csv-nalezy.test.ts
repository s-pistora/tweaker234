import { describe, it, expect } from 'vitest';
import { doCsv, nazevSouboru } from '../src/lib/csv.ts';
import { STATICKE_NALEZY, souhrnNalezu, zAutomatickychKontrol } from '../src/lib/nalezy.ts';
import { parsePoradny } from '../scripts/sources/dz-prijimani.ts';

describe('csv', () => {
  it('BOM, středník, uvozování a desetinná čárka pro český Excel', () => {
    const t = doCsv([
      { nazev: 'Škola "Na kopci"; Cheb', km: 3.5, ok: true },
      { nazev: 'Druhá', poznamka: 'jen tady' },
    ]);
    expect(t.startsWith('\uFEFF')).toBe(true);
    const radky = t.slice(1).trim().split('\r\n');
    expect(radky[0]).toBe('nazev;km;ok;poznamka');
    expect(radky[1]).toBe('"Škola ""Na kopci""; Cheb";3,5;true;');
    expect(radky[2]).toBe('Druhá;;;jen tady');
  });

  it('název souboru bez diakritiky a mezer', () => {
    expect(nazevSouboru('Kam vyrazit – Regionální dobroty, Karlovy Vary')).toBe('kam-vyrazit-regionalni-dobroty-karlovy-vary');
    expect(nazevSouboru('')).toBe('data');
  });
});

describe('nálezy v datech', () => {
  it('statické nálezy mají všechna pole a souhrn sedí', () => {
    for (const n of STATICKE_NALEZY) expect(n.sada && n.co && n.reseni).toBeTruthy();
    const s = souhrnNalezu(STATICKE_NALEZY);
    expect(s.podle.chyba + s.podle.nesoulad + s.podle.chybi).toBe(s.celkem);
  });

  it('automatické kontroly: sada z prefixu, velké písmeno, závažnost', () => {
    const n = zAutomatickychKontrol(
      ['Živnostenské úřady: obec Otovice má neexistující kód obce 574317.', 'Stavební úřady: chybí katastrální území obce X.', 'Bez prefixu'],
      'Úřady',
    );
    expect(n[0]).toMatchObject({ sada: 'Živnostenské úřady', zavaznost: 'chyba' });
    expect(n[0].co.startsWith('Obec Otovice')).toBe(true);
    expect(n[1].zavaznost).toBe('chybi');
    expect(n[2].sada).toBe('Úřady');
  });
});

describe('poradny', () => {
  it('souřadnice ze sloupců N/E, název bez „příspěvková organizace“, adresa', () => {
    const csv =
      'OBJECTID,ORGANIZACE,NAZEVOBCE,NAZEVULICE,DOMCIS,ORIENCIS,PSC,TYP_ZARIZENI,DATOVKA,WEB,X,Y,N,E\n' +
      '1,"Pedagogicko-psychologická poradna Karlovy Vary, příspěvková organizace, pobočka Cheb",Cheb,Palackého,1562,8,35002,Pedagogicko-psychologická poradna,abc,https://pppkv.cz/,-1022879.18,-887807.54,50.07104175,12.3698\n';
    const [p] = parsePoradny(csv);
    expect(p.nazev).toBe('Pedagogicko-psychologická poradna Karlovy Vary, pobočka Cheb');
    expect(p.adresa).toBe('Palackého 1562/8, 350 02 Cheb');
    expect(p.lat).toBeCloseTo(50.071, 3);
    expect(p.lon).toBeCloseTo(12.3698, 3);
  });
});
