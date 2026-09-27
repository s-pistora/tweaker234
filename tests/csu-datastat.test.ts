import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDataStatCsv, buildIndicatorFiles, csuDataStat, CROSS_CHECK_IDS } from '../scripts/sources/csu-datastat.ts';

const fx = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('parseDataStatCsv – obecný parser CSV z ČSÚ DataStat (nad fixture úryvky)', () => {
  it('PORKR01: čte obyvatele kraje i řádek ČR ze stejného (plochého) sloupce území', () => {
    const r = parseDataStatCsv(fx('datastat-porkr01.csv'), {
      indicatorId: 'Počet obyvatel k 31. 12.',
      areaColumn: 'Uz02A.Polozka',
    });
    expect(r.CZ041[2024]).toBe(293195);
    expect(r.CZ041[2025]).toBe(292027);
    expect(r.CZ[2024]).toBe(10909500);
  });

  it('PORKR01: má historii od roku 2000 (review finding #1 – dřív jen 2015+)', () => {
    const r = parseDataStatCsv(fx('datastat-porkr01.csv'), {
      indicatorId: 'Počet obyvatel k 31. 12.',
      areaColumn: 'Uz02A.Polozka',
    });
    expect(r.CZ041[2000]).toBe(304400);
  });

  it('NEZ01: čte podíl nezaměstnaných kraje z hierarchického sloupce KRAJ (řádek ČR má tento sloupec prázdný, takže se přeskočí)', () => {
    const r = parseDataStatCsv(fx('datastat-nez01.csv'), {
      indicatorId: 'Podíl nezaměstnaných osob - celkem (%)',
      areaColumn: 'UZ023H2U.KRAJ.Polozka',
    });
    expect(r.CZ041[2024]).toBeCloseTo(4.846, 2);
    expect(r.CZ).toBeUndefined();
  });

  it('MZDR: čte mzdu kraje (ZJIST=2 už vyfiltrováno v samotném requestu, viz zdroj)', () => {
    const r = parseDataStatCsv(fx('datastat-mzdr.csv'), {
      indicatorId: 'Průměrná hrubá měsíční mzda na přepočtené počty zaměstnanců (Kč)',
      areaColumn: 'Uz0123vm.KRAJ.Polozka',
    });
    expect(r.CZ041[2024]).toBeCloseTo(39256.95, 1);
  });

  it('OBY01B: čte obyvatele ORP Karlovy Vary', () => {
    const r = parseDataStatCsv(fx('datastat-oby01b.csv'), {
      indicatorId: 'Počet obyvatel k 31. 12.',
      areaColumn: 'Uz4A.Polozka',
    });
    expect(r['4103'][2024]).toBe(88253);
  });

  it('OBY01B01: čte obyvatele obce Karlovy Vary', () => {
    const r = parseDataStatCsv(fx('datastat-oby01b01.csv'), {
      indicatorId: 'Počet obyvatel k 31. 12.',
      areaColumn: 'Uz45B.OBEC.Polozka',
    });
    expect(r['554961'][2024]).toBe(49073);
  });

  it('prázdná hodnota (Hodnota="") se namapuje na null', () => {
    // Konstruovaný minimální úryvek (stejné sloupce jako reálná odpověď PORKR01),
    // aby se otestovala cesta na prázdnou hodnotu – v zachycených fixture souborech
    // se reálně chybějící hodnota neobjevila (viz report, sekce "Deviace").
    const csv =
      '"Ukazatel","Roky","CasR.Ciselnik","CasR.Polozka","ČR, kraje","Uz02A.Ciselnik","Uz02A.Polozka","Hodnota","MJ_TEXT"\n' +
      '"Počet obyvatel k 31. 12.","2024","CAS_R","2024","Karlovarský kraj","108","CZ041","",""\n';
    const r = parseDataStatCsv(csv, { indicatorId: 'Počet obyvatel k 31. 12.', areaColumn: 'Uz02A.Polozka' });
    expect(r.CZ041[2024]).toBeNull();
  });

  it('neznámý ukazatel nevrátí žádné řádky', () => {
    const r = parseDataStatCsv(fx('datastat-porkr01.csv'), {
      indicatorId: 'Neexistující ukazatel',
      areaColumn: 'Uz02A.Polozka',
    });
    expect(Object.keys(r)).toHaveLength(0);
  });
});

describe('buildIndicatorFiles – sestavení IndicatorFile pro kraj/orp/obec z fixture úryvků', () => {
  const rawTexts = {
    porkr01: fx('datastat-porkr01.csv'),
    porkr02: fx('datastat-porkr02.csv'),
    porkr03: fx('datastat-porkr03.csv'),
    porkr04: fx('datastat-porkr04.csv'),
    nez01: fx('datastat-nez01.csv'),
    mzdr: fx('datastat-mzdr.csv'),
    oby02e: fx('datastat-oby02e.csv'),
    oby02eOrp: fx('datastat-oby02e-orp.csv'),
    oby02eObec: fx('datastat-oby02e-obec.csv'),
    oby01b: fx('datastat-oby01b.csv'),
    oby01b01: fx('datastat-oby01b01.csv'),
  };
  const files = buildIndicatorFiles(rawTexts);

  it('kraj: obyvatele, ČR jde do national a ne do values', () => {
    expect(files.kraj.level).toBe('kraj');
    expect(files.kraj.values.obyvatele.CZ041[2024]).toBe(293195);
    expect(files.kraj.values.obyvatele.CZ).toBeUndefined();
    expect(files.kraj.national?.obyvatele[2024]).toBe(10909500);
  });

  it('kraj: nezaměstnanost a mzda', () => {
    expect(files.kraj.values.nezamestnanost.CZ041[2024]).toBeCloseTo(4.846, 2);
    expect(files.kraj.values.mzda.CZ041[2024]).toBeCloseTo(39256.95, 1);
  });

  it('kraj: odvozený přírůstek na 1000 = přirozený + stěhováním', () => {
    const v = files.kraj.values.prirustek_na_1000.CZ041[2024];
    expect(v).toBeCloseTo(-5.41122958 + -1.0058681324, 5);
  });

  it('kraj: odvozené podíly 0-14 a 65+ z OBY02E', () => {
    const p014 = files.kraj.values.podil_0_14.CZ041[2024];
    const p65 = files.kraj.values.podil_65.CZ041[2024];
    expect(p014).toBeCloseTo((41623 / 293195) * 100, 3);
    expect(p65).toBeCloseTo((63248 / 293195) * 100, 3);
  });

  it('kraj: průměrný věk a index stáří (jednotka index_stari je "index", ne "%")', () => {
    expect(files.kraj.values.prumerny_vek.CZ041[2024]).toBeCloseTo(43.98634185, 3);
    expect(files.kraj.values.index_stari.CZ041[2024]).toBeCloseTo(151.9544483, 3);
    expect(files.kraj.indicators.index_stari.unit).toBe('index');
  });

  it('orp: obyvatele ORP Karlovy Vary + regional = KV kraj', () => {
    expect(files.orp.level).toBe('orp');
    expect(files.orp.values.obyvatele['4103'][2024]).toBe(88253);
    expect(files.orp.regional?.obyvatele[2024]).toBe(293195);
  });

  it('orp: přírůstek na 1000 = (přirozený + stěhováním) / střední stav * 1000 (OBY01B)', () => {
    // natural=-471, migration=53, střední stav (k 1.7.)=88080 → shoduje se s vlastním ČSÚ
    // ukazatelem "Celkový přírůstek/úbytek na 1 000 obyvatel" = -4.7456857402 (ověřeno živě).
    expect(files.orp.values.prirustek_na_1000['4103'][2024]).toBeCloseTo(((-471 + 53) / 88080) * 1000, 6);
  });

  it('orp: podíly 0-14 a 65+ z OBY02E (Uz024hA)', () => {
    expect(files.orp.values.podil_0_14['4103'][2024]).toBeCloseTo((12286 / 88253) * 100, 3);
    expect(files.orp.values.podil_65['4103'][2024]).toBeCloseTo((20336 / 88253) * 100, 3);
  });

  it('obec: obyvatele Karlovy Vary + regional = KV kraj', () => {
    expect(files.obec.level).toBe('obec');
    expect(files.obec.values.obyvatele['554961'][2024]).toBe(49073);
    expect(files.obec.regional?.obyvatele[2024]).toBe(293195);
  });

  it('obec: přírůstek na 1000 (OBY01B01) a podíly 0-14/65+ (OBY02E obec)', () => {
    // natural=-322, migration=42, střední stav=48927 → shoduje se s ČSÚ "Celkový přírůstek/úbytek" -280 os.
    expect(files.obec.values.prirustek_na_1000['554961'][2024]).toBeCloseTo(((-322 + 42) / 48927) * 1000, 6);
    expect(files.obec.values.podil_0_14['554961'][2024]).toBeCloseTo((6505 / 49073) * 100, 3);
    expect(files.obec.values.podil_65['554961'][2024]).toBeCloseTo((12085 / 49073) * 100, 3);
  });

  it('orp a obec mají STEJNÉ ukazatele (id/label/unit/higherIsBetter/decimals) jako kraj u sdílených ukazatelů', () => {
    for (const id of ['obyvatele', 'prirustek_na_1000', 'podil_0_14', 'podil_65'] as const) {
      expect(files.orp.indicators[id]).toEqual(files.kraj.indicators[id]);
      expect(files.obec.indicators[id]).toEqual(files.kraj.indicators[id]);
    }
  });

  it('všechny ukazatele mají higherIsBetter a sourceId', () => {
    for (const def of Object.values(files.kraj.indicators)) {
      expect(typeof def.higherIsBetter).toBe('boolean');
      expect(def.sourceId).toBe('csu-datastat');
    }
  });
});

describe('CROSS_CHECK_IDS', () => {
  it('neobsahuje mzdu (žádný nalezený nezávislý zdroj se stejnou definicí, viz report)', () => {
    expect(CROSS_CHECK_IDS).toEqual(['obyvatele', 'nezamestnanost']);
    expect(CROSS_CHECK_IDS).not.toContain('mzda');
  });
});

// Integrační test s reálnou sítí – celý adaptér (fetch + cache + parsování + odvození).
describe.skipIf(!process.env.LIVE)('csuDataStat.run – živě proti data.csu.gov.cz', () => {
  it('vrátí IndicatorFile pro kraj/orp/obec se skutečnými čísly KV kraje', async () => {
    const result = await csuDataStat.run({ rawDir: 'data-raw', now: new Date() });
    expect(result.source.status).toBe('ok');
    const [kraj, orp, obec] = result.indicators ?? [];
    expect(kraj.values.obyvatele.CZ041[2024]).toBe(293195);
    expect(kraj.values.nezamestnanost.CZ041[2024]).toBeCloseTo(4.846, 2);
    expect(kraj.values.mzda.CZ041[2024]).toBeCloseTo(39256.95, 1);
    expect(orp.values.obyvatele['4103'][2024]).toBe(88253);
    expect(obec.values.obyvatele['554961'][2024]).toBe(49073);
  }, 60_000);
});
