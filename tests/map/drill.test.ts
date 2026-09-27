import { describe, it, expect } from 'vitest';
import { selectArea, levelUp, resolveView, detailTarget, KV } from '../../src/lib/map/drill.ts';

const parentOf = (c: string) => ({ '554481': '4102', '554961': '4103' })[c] ?? null;

describe('drill-down', () => {
  it('kraj: klik na KV → mapa ORP; jiný kraj → jen výběr', () => {
    expect(selectArea({ level: 'kraj', area: null, orp: null }, KV)).toEqual({ level: 'orp', area: null, orp: null });
    expect(selectArea({ level: 'kraj', area: null, orp: null }, 'CZ042')).toEqual({ level: 'kraj', area: 'CZ042', orp: null });
  });

  it('orp: klik → obce daného ORP; obec: klik → výběr obce', () => {
    expect(selectArea({ level: 'orp', area: null, orp: null }, '4103')).toEqual({ level: 'obec', area: null, orp: '4103' });
    expect(selectArea({ level: 'obec', area: null, orp: '4103' }, '554961')).toEqual({ level: 'obec', area: '554961', orp: '4103' });
  });

  it('levelUp: obec → orp (ORP vybráno) → kraj (KV vybrán) → kraj bez výběru → null', () => {
    const a = levelUp({ level: 'obec', area: '554961', orp: '4103' });
    expect(a).toEqual({ level: 'orp', area: '4103', orp: null });
    const b = levelUp(a!);
    expect(b).toEqual({ level: 'kraj', area: KV, orp: null });
    const c = levelUp(b!);
    expect(c).toEqual({ level: 'kraj', area: null, orp: null });
    expect(levelUp(c!)).toBeNull();
    expect(levelUp({ level: 'orp', area: null, orp: null })).toEqual({ level: 'kraj', area: KV, orp: null });
  });

  it('resolveView: ORP obcí se odvodí z vybrané obce, jinak z lokálního ORP, jinak fallback na orp', () => {
    expect(resolveView('obec', '554961', null, parentOf)).toEqual({ level: 'obec', area: '554961', orp: '4103' });
    expect(resolveView('obec', null, '4102', parentOf)).toEqual({ level: 'obec', area: null, orp: '4102' });
    expect(resolveView('obec', null, null, parentOf)).toEqual({ level: 'orp', area: null, orp: null });
    expect(resolveView('kraj', 'CZ042', '4102', parentOf)).toEqual({ level: 'kraj', area: 'CZ042', orp: null });
  });

  it('detailTarget: vybrané území, jinak kontext (ORP / KV)', () => {
    expect(detailTarget({ level: 'obec', area: '554961', orp: '4103' })).toEqual({ level: 'obec', code: '554961' });
    expect(detailTarget({ level: 'obec', area: null, orp: '4103' })).toEqual({ level: 'orp', code: '4103' });
    expect(detailTarget({ level: 'orp', area: null, orp: null })).toEqual({ level: 'kraj', code: KV });
    expect(detailTarget({ level: 'kraj', area: null, orp: null })).toBeNull();
  });
});
