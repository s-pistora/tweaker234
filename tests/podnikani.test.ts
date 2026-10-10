import { describe, it, expect } from 'vitest';
import { filtrKreativci, infra, kontrola, kreativci, obory, poctyOboru, zony, isPodnikaniFile } from '../src/lib/podnikani.ts';

describe('podnikani: převod dat kraje', () => {
  it('obory: víceslovné názvy s čárkou se nerozpadnou, velikost písmen se sjednotí', () => {
    expect(obory('Průmyslový, produktový a módní design, řemeslo')).toEqual(['Průmyslový, produktový a módní design', 'Řemeslo']);
    expect(obory('Film, Televize, Video')).toEqual(['Film, televize, video']);
    expect(obory('Řemeslo, kreativní vzdělávání')).toEqual(['Řemeslo', 'Kreativní vzdělávání']);
    expect(obory('')).toEqual([]);
  });

  it('kreativci: zdvojené uvozovky v názvu, web a profil, e-mail bez mailto', () => {
    const k = kreativci([
      {
        Název: 'Andrea Havlíčková ""Cesta z města""',
        Kategorie: 'Řemeslo',
        'Webová stránka kreativce': 'https://example.cz',
        'Webová stránka Galerie kreativců': 'https://zijemekreativitou.cz/x',
        'Kontaktní e-mail': 'mailto:a@b.cz',
        'Název obce': 'Karlovy Vary',
      },
    ]);
    expect(k[0].nazev).toBe('Andrea Havlíčková „Cesta z města“');
    expect(k[0]).toMatchObject({ web: 'https://example.cz', profil: 'https://zijemekreativitou.cz/x', email: 'a@b.cz' });
    expect(filtrKreativci(k, 'Řemeslo', 'cesta mesta')).toHaveLength(1);
    expect(filtrKreativci(k, 'Fotografie', '')).toHaveLength(0);
    expect(poctyOboru(k)).toEqual([['Řemeslo', 1]]);
  });

  it('infrastruktura: stejné místo pro více typů se sloučí', () => {
    const r = (typ: string) => ({ název: 'VARY&TE', název_obce: 'Karlovy Vary', [typ]: 'true' });
    const { infra: i, duplicit } = infra([r('coworkingové_centrum'), r('otevřená_dílna'), r('kulturní_a_kreativní_centrum')]);
    expect(i).toHaveLength(1);
    expect(duplicit).toBe(2);
    expect(i[0].typy.sort()).toEqual(['coworking', 'dilna', 'kkc']);
  });

  it('zóny a kontrola dat', () => {
    const z = zony([
      { Název: 'Průmyslový park Cheb', Stav: 'stávající', Záměr: 'false', 'Název obce': 'Cheb' },
      { Název: 'Průmyslová plocha Skalná', Stav: 'záměr', Záměr: 'true', 'Název obce': 'Skalná' },
      { Název: 'Věznice Horní Slavkov', Stav: 'stávající', 'Název obce': 'Horní Slavkov' },
    ]);
    expect(z.filter((x) => x.stav === 'zamer').map((x) => x.nazev)).toEqual(['Průmyslová plocha Skalná']);
    const k = kreativci([{ Název: 'Bez obce', Kategorie: 'Foto' }]);
    const ch = kontrola(k, 2, z);
    expect(ch.some((c) => c.includes('1 z 1 kreativců'))).toBe(true);
    expect(ch.some((c) => c.includes('Věznice Horní Slavkov'))).toBe(true);
    expect(isPodnikaniFile({ updatedAt: 'x', sourceIds: [], kreativci: k, infra: [], zony: z, chybyDat: ch })).toBe(true);
  });
});
