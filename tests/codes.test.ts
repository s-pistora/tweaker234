import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCodes, loadCodes } from '../scripts/codes.ts';

const fx = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('codes – převodník RÚIAN↔ČSÚ (nad fixture úryvky reálných číselníků)', () => {
  const codes = buildCodes(fx('cis65.csv'), fx('cis100.csv'), fx('vazba43_65.csv'));

  it('orpRuianToCsu převádí RÚIAN kód ORP na ČSÚ kód', () => {
    expect(codes.orpRuianToCsu('531')).toBe('4103');
  });

  it('krajRuianToNuts převádí RÚIAN kód kraje na NUTS3', () => {
    expect(codes.krajRuianToNuts('51')).toBe('CZ041');
  });

  it('orpOfObec najde ORP obce Karlovy Vary', () => {
    expect(codes.orpOfObec('554961')).toBe('4103');
  });

  it('kvOrp obsahuje právě 7 ORP Karlovarského kraje', () => {
    expect(codes.kvOrp.length).toBe(7);
    expect(codes.kvOrp).toEqual(['4101', '4102', '4103', '4104', '4105', '4106', '4107']);
  });

  it('obceOfOrp vrací obce patřící pod ORP Karlovy Vary (dle fixture úryvku)', () => {
    const obce = codes.obceOfOrp('4103');
    expect(obce).toContain('554961');
    expect(obce.length).toBe(41);
  });

  it('neznámý RÚIAN kód ORP vyhodí chybu', () => {
    expect(() => codes.orpRuianToCsu('999999')).toThrow();
  });

  it('orpOfObec vrací undefined pro neznámou obec', () => {
    expect(codes.orpOfObec('000000')).toBeUndefined();
  });

  // Integrační test s plným živým stažením číselníků – běží jen s LIVE=1.
  it.skipIf(!process.env.LIVE)('živě: součet obcí přes všech 7 KV ORP je 134', async () => {
    const live = await loadCodes('data-raw/codes');
    const total = live.kvOrp.reduce((sum, orp) => sum + live.obceOfOrp(orp).length, 0);
    expect(total).toBe(134);
  });
});

describe('buildCodes – honoruje platnost číselníku (admplod/admnepo), fix round 1 review finding #4', () => {
  // Konstruovaný úryvek (reálné sloupce cis65 – CISORP) se DVĚMA řádky pro stejný RÚIAN kód '900':
  // starým, historicky ZRUŠENÝM (admnepo v minulosti) a aktuálním (admplod v minulosti, bez konce).
  // Neplatný řádek je záměrně AŽ ZA platným, aby test odhalil naivní "poslední řádek vyhrává".
  const cis65WithHistory =
    '"kodjaz","akrcis","kodcis","chodnota","zkrtext","text","admplod","admnepo","kod_ruian"\n' +
    '"CS","CISORP",65,"9001","Nové ORP","Nové ORP","2010-01-01","9999-09-09","900"\n' +
    '"CS","CISORP",65,"9000","Staré (zrušené) ORP","Staré (zrušené) ORP","2000-01-01","2009-12-31","900"\n';
  const cis100Empty =
    '"kodjaz","akrcis","kodcis","chodnota","zkrtext","text","admplod","admnepo","cznuts","kod_ruian","zkrkraj"\n';
  const vazbaEmpty =
    '"kodjaz","typvaz","akrcis1","kodcis1","chodnota1","text1","akrcis2","kodcis2","chodnota2","text2"\n';

  it('u souběhu platného a neplatného (zrušeného) řádku vyhraje platný k `now`, i když je v souboru dřív', () => {
    const codes = buildCodes(cis65WithHistory, cis100Empty, vazbaEmpty, new Date('2026-01-01'));
    expect(codes.orpRuianToCsu('900')).toBe('9001');
  });

  it('k datu před platností nové položky (ale v okně staré) vrátí historickou hodnotu', () => {
    const codes = buildCodes(cis65WithHistory, cis100Empty, vazbaEmpty, new Date('2005-06-01'));
    expect(codes.orpRuianToCsu('900')).toBe('9000');
  });

  it('bez `now` (výchozí = aktuální datum) vrátí aktuálně platnou položku', () => {
    const codes = buildCodes(cis65WithHistory, cis100Empty, vazbaEmpty);
    expect(codes.orpRuianToCsu('900')).toBe('9001');
  });
});
