import { describe, it, expect } from 'vitest';
import {
  automatickeKontroly,
  bodyMimoObec,
  duplicitniObory,
  prijatoBezZameru,
  prijatoNadZamer,
  skolyBezWebu,
} from '../src/lib/kontroly.ts';
import { nalezyDoMarkdown, STATICKE_NALEZY } from '../src/lib/nalezy.ts';
import { makeObecLocator } from '../src/lib/map/locate.ts';
import { realnaData } from './helpers/snapshot.ts';
import type { Obor, PointLayer } from '../src/lib/types.ts';

const o = (p: Partial<Obor>) =>
  ({
    izo: '1',
    skola: 'Škola, příspěvková organizace',
    web: 'https://x.cz',
    kodOboru: '23-51-H/01',
    nazevOboru: 'Strojník',
    forma: 'denní',
    delka: 'tříleté',
    zamer: { 2025: 20 },
    prijato2025: 10,
    ...p,
  }) as Obor;

describe('kontroly nad umělými daty', () => {
  it('duplicita stejné školy, oboru, formy a délky', () => {
    expect(duplicitniObory([o({}), o({ forma: 'ostatní' })])).toBeNull();
    const n = duplicitniObory([o({}), o({})]);
    expect(n?.zavaznost).toBe('chyba');
    expect(n?.co).toContain('Strojník');
  });
  it('přijatých víc než 2× záměr a přijatí bez záměru', () => {
    expect(prijatoNadZamer([o({ prijato2025: 40 })])).toBeNull();
    expect(prijatoNadZamer([o({ prijato2025: 41 })])?.co).toContain('41 přijatých na 20 míst');
    expect(prijatoBezZameru([o({ zamer: { 2025: null } })])?.zavaznost).toBe('chybi');
    expect(prijatoBezZameru([o({ zamer: { 2025: null }, prijato2025: 0 })])).toBeNull();
  });
  it('školy bez webu se počítají jednou za školu; víc než 3 příklady se zkrátí', () => {
    const bez = ['1', '1', '2', '3', '4', '5', '6', '7'].map((izo) => o({ izo, web: '', skola: `Škola ${izo}` }));
    const n = skolyBezWebu(bez)!;
    expect(n.co).toMatch(/^7 škol nemá/);
    expect(n.co).toContain('a 4 další');
  });
});

describe('kontroly nad reálnými daty', () => {
  it('bod uvedený v cizí obci se najde, bod u hranice ne', async () => {
    const { snap, names } = await realnaData();
    const locate = makeObecLocator(snap.geo['kv-obce']);
    const cheb = { lat: 50.0795, lon: 12.3739 };
    const vrstva = (obec: string): PointLayer => ({ id: 'x', label: 'Test', sourceId: 'x', validFor: '', features: [{ id: 'a', name: 'Bod', ...cheb, obec, orp: '', attrs: {} }] });
    expect(bodyMimoObec(vrstva('554481'), locate, names)).toBeNull();
    expect(bodyMimoObec(vrstva('554961'), locate, names)?.co).toContain('uvedeno Karlovy Vary, poloha Cheb');
  });

  it('celý snapshot: nálezy mají vyplněné texty a nejsou to tisíce planých poplachů', async () => {
    const { snap, names } = await realnaData();
    const n = automatickeKontroly({ obory: snap.skoly!.obory, vrstvy: Object.values(snap.points), locate: makeObecLocator(snap.geo['kv-obce']), names });
    expect(n.length).toBeGreaterThan(0);
    for (const x of n) {
      expect(x.sada && x.co && x.reseni).toBeTruthy();
      expect(x.co).not.toMatch(/undefined|NaN/);
    }
    const zastavky = n.find((x) => x.sada === snap.points['zastavky']?.label);
    if (zastavky) expect(Number(zastavky.co.match(/^(\d+)/)![1])).toBeLessThan(100);
  });
});

describe('report v Markdownu', () => {
  it('nadpis, souhrn a sekce podle sady', () => {
    const md = nalezyDoMarkdown(STATICKE_NALEZY, '10. 10. 2026');
    expect(md.startsWith('# Nálezy v otevřených datech Karlovarského kraje\n')).toBe(true);
    expect(md).toContain(`Celkem ${STATICKE_NALEZY.length} nálezů`);
    expect(md).toContain('## Záměr počtu přijímaných uchazečů SŠ');
    expect(md).toContain('*Jak jsme to vyřešili:*');
  });
});
