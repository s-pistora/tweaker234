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
