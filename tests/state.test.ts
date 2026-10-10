// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import {
  parseHash,
  toHash,
  appState,
  initHashSync,
  linkInvalid,
  DEFAULT_SKOLY,
  DEFAULT_VYLETY,
  DEFAULT_ZIVOT,
  type AppState,
} from '../src/lib/state.ts';
import type { Snapshot } from '../src/lib/data/loader.ts';
import type { Manifest, IndicatorFile } from '../src/lib/types.ts';

const manifest: Manifest = {
  updatedAt: '2026-01-01T00:00:00.000Z',
  sources: [],
  files: { indicators: { kraj: 'indicators/kraj.json', orp: 'indicators/orp.json' }, points: {}, geo: {} },
};

const krajFile: IndicatorFile = {
  level: 'kraj',
  indicators: {
    obyvatele: {
      id: 'obyvatele',
      label: 'Počet obyvatel',
      unit: 'osoby',
      higherIsBetter: true,
      sourceId: 'fixture',
      decimals: 0,
    },
    nezamestnanost: {
      id: 'nezamestnanost',
      label: 'Podíl nezaměstnaných',
      unit: '%',
      higherIsBetter: false,
      sourceId: 'fixture',
      decimals: 1,
    },
  },
  values: {
    obyvatele: {
      CZ041: { 2020: 300000, 2021: 298500, 2022: 297000, 2023: 295500, 2024: 294000 },
    },
    nezamestnanost: {
      CZ041: { 2020: 5, 2021: 4.9, 2022: 4.8, 2023: 4.7, 2024: null },
    },
  },
};

const orpFile: IndicatorFile = {
  level: 'orp',
  indicators: {
    obyvatele: {
      id: 'obyvatele',
      label: 'Počet obyvatel',
      unit: 'osoby',
      higherIsBetter: true,
      sourceId: 'fixture',
      decimals: 0,
    },
    skoly: {
      id: 'skoly',
      label: 'Školy na 1000 obyvatel',
      unit: 'na 1000 obyv.',
      higherIsBetter: true,
      sourceId: 'fixture',
      decimals: 2,
    },
  },
  values: {
    obyvatele: {
      '4102': { 2024: 49200 },
      '4103': { 2024: 86400 },
    },
    skoly: {
      '4102': { 2024: 0.8 },
      '4103': { 2024: 0.9 },
    },
  },
};

function makeSnap(): Snapshot {
  return {
    manifest,
    indicators: { kraj: krajFile, orp: orpFile },
    points: {},
    geo: {},
    skoly: null,
    vylety: null,
    urady: null,
    penize: null,
    podnikani: null,
    updatedAt: manifest.updatedAt,
  };
}

describe('parseHash / toHash (cisté funkce)', () => {
  it('round-trip: parseHash(toHash(s)) == s pro platny stav', () => {
    const snap = makeSnap();
    const state: AppState = {
      level: 'orp',
      area: '4103',
      indicator: 'skoly',
      year: 2024,
      mode: 'explore',
      weights: { skoly: 3, lekari: 5 },
    };
    const { state: parsed, invalid } = parseHash(toHash(state), snap);
    expect(invalid).toBe(false);
    expect(parsed).toEqual(state);
  });

  it('#/orp/4103?u=skoly&r=2024&w=skoly:3,lekari:5 -> spravny stav', () => {
    const snap = makeSnap();
    const { state, invalid } = parseHash('#/orp/4103?u=skoly&r=2024&w=skoly:3,lekari:5', snap);
    expect(invalid).toBe(false);
    expect(state).toEqual({
      level: 'orp',
      area: '4103',
      indicator: 'skoly',
      year: 2024,
      mode: 'explore',
      weights: { skoly: 3, lekari: 5 },
    });
  });

  it('prazdny hash (#/ nebo "") -> vychozi stav, invalid:false', () => {
    // vychozi ukazatel je "nezamestnanost" (preferovany default, viz review finding #7),
    // ne prvni klic v `indicators` ("obyvatele") - a s nim i jiny vychozi rok (posledni s daty).
    const snap = makeSnap();
    for (const h of ['', '#', '#/']) {
      const { state, invalid } = parseHash(h, snap);
      expect(invalid).toBe(false);
      expect(state).toEqual({
        level: 'kraj',
        area: null,
        indicator: 'nezamestnanost',
        year: 2023,
        mode: 'explore',
        weights: {},
      });
    }
  });

  it('neznamy kod uzemi -> area:null, invalid:true, ostatni pole zustavaji', () => {
    const snap = makeSnap();
    const { state, invalid } = parseHash('#/orp/9999?u=skoly&r=2024', snap);
    expect(invalid).toBe(true);
    expect(state).toEqual({
      level: 'orp',
      area: null,
      indicator: 'skoly',
      year: 2024,
      mode: 'explore',
      weights: {},
    });
  });

  it('rok 1990 mimo dostupne roky -> fallback na nejnovejsi rok s daty, invalid:true', () => {
    const snap = makeSnap();
    const { state, invalid } = parseHash('#/kraj?u=obyvatele&r=1990', snap);
    expect(invalid).toBe(true);
    expect(state.year).toBe(2024);
  });

  it('neznamy ukazatel -> fallback na preferovany vychozi ukazatel urovne, invalid:true', () => {
    const snap = makeSnap();
    const { state, invalid } = parseHash('#/kraj?u=neexistuje', snap);
    expect(invalid).toBe(true);
    expect(state.indicator).toBe('nezamestnanost');
  });

  it('neznama uroven -> fallback na kraj, invalid:true', () => {
    const snap = makeSnap();
    const { state, invalid } = parseHash('#/okres/123', snap);
    expect(invalid).toBe(true);
    expect(state.level).toBe('kraj');
  });

  it('poskozeny format vah -> prazdne vahy, invalid:true', () => {
    const snap = makeSnap();
    const { state, invalid } = parseHash('#/orp/4103?w=neplatne;;;', snap);
    expect(invalid).toBe(true);
    expect(state.weights).toEqual({});
  });

  it('vahy z URL se oriznou na cela cisla 0-5 - mimo rozsah/necela se zahodi, invalid:true (review finding #6)', () => {
    const snap = makeSnap();
    const { state, invalid } = parseHash('#/orp/4103?w=skoly:7,lekari:5,x:-1,y:2.5', snap);
    expect(invalid).toBe(true);
    expect(state.weights).toEqual({ lekari: 5 });
  });

  it('platne vahy 0-5 (cela cisla) projdou beze zmeny, invalid:false', () => {
    const snap = makeSnap();
    const { state, invalid } = parseHash('#/orp/4103?w=skoly:0,lekari:5', snap);
    expect(invalid).toBe(false);
    expect(state.weights).toEqual({ skoly: 0, lekari: 5 });
  });

  it('neznamy rezim -> fallback na explore, invalid:true', () => {
    const snap = makeSnap();
    const { state, invalid } = parseHash('#/kraj?m=neco', snap);
    expect(invalid).toBe(true);
    expect(state.mode).toBe('explore');
  });
});

describe('initHashSync + appState store', () => {
  it('pri startu naparsuje aktualni location.hash do appState', () => {
    const snap = makeSnap();
    location.hash = '#/orp/4103?u=skoly&r=2024';
    const stop = initHashSync(snap);
    const s = get(appState);
    expect(s.level).toBe('orp');
    expect(s.area).toBe('4103');
    expect(s.indicator).toBe('skoly');
    stop();
  });

  it('zmena appState prepise location.hash (history.replaceState)', () => {
    const snap = makeSnap();
    location.hash = '';
    const stop = initHashSync(snap);
    const next: AppState = {
      level: 'kraj',
      area: 'CZ041',
      indicator: 'obyvatele',
      year: 2020,
      mode: 'explore',
      weights: {},
    };
    appState.set(next);
    expect(location.hash).toBe(toHash(next));
    stop();
  });

  it('externi hashchange (napr. back/forward) aktualizuje appState', () => {
    const snap = makeSnap();
    location.hash = '';
    const stop = initHashSync(snap);
    location.hash = '#/orp/4102';
    window.dispatchEvent(new Event('hashchange'));
    expect(get(appState).area).toBe('4102');
    stop();
  });
});

describe('linkInvalid store (review finding #1 - varovani "neplatny odkaz")', () => {
  it('nevalidni hash (neznama oblast + neznamy ukazatel + rok mimo rozsah) -> linkInvalid:true', () => {
    const snap = makeSnap();
    location.hash = '#/obec/999999?u=lekari&r=1990';
    const stop = initHashSync(snap);
    expect(get(linkInvalid)).toBe(true);
    stop();
  });

  it('validni hash -> linkInvalid:false', () => {
    const snap = makeSnap();
    location.hash = '#/orp/4103?u=skoly&r=2024';
    const stop = initHashSync(snap);
    expect(get(linkInvalid)).toBe(false);
    stop();
  });

  it('externi hashchange na nevalidni hash prepne linkInvalid na true', () => {
    const snap = makeSnap();
    location.hash = '#/orp/4103?u=skoly&r=2024';
    const stop = initHashSync(snap);
    expect(get(linkInvalid)).toBe(false);
    location.hash = '#/obec/999999?u=lekari&r=1990';
    window.dispatchEvent(new Event('hashchange'));
    expect(get(linkInvalid)).toBe(true);
    stop();
  });
});

describe('režim „Kam na střední“ v hashi', () => {
  const ob = (izo: string, kodObce: string, skupina: string) =>
    ({ izo, kodObce, skupina }) as unknown as NonNullable<Snapshot['skoly']>['obory'][number];
  function snapSkoly(): Snapshot {
    return {
      ...makeSnap(),
      skoly: { updatedAt: 'x', sourceIds: [], obory: [ob('600170462', '554481', '18'), ob('1', '554961', '79')] },
    };
  }

  it('ostatní režimy hash nemění (žádné pole skoly)', () => {
    const { state } = parseHash('#/kraj?m=explore', snapSkoly());
    expect(state.skoly).toBeUndefined();
    expect(toHash(state)).not.toContain('km=');
  });

  it('m=skoly bez parametrů → výchozí filtry', () => {
    const { state, invalid } = parseHash('#/kraj?m=skoly', snapSkoly());
    expect(invalid).toBe(false);
    expect(state.mode).toBe('skoly');
    expect(state.skoly).toEqual(DEFAULT_SKOLY);
  });

  it('round-trip všech parametrů', () => {
    const snap = snapSkoly();
    const { state } = parseHash('#/kraj?m=skoly', snap);
    state.skoly = { domov: '554481', typ: 'maturita', skupina: '18', maxKm: 30, skola: '600170462', razeni: 'volno' };
    const back = parseHash(toHash(state), snap);
    expect(back.invalid).toBe(false);
    expect(back.state).toEqual(state);
  });

  it('nevalidní hodnoty spadnou zvlášť na výchozí a označí odkaz jako neplatný', () => {
    const { state, invalid } = parseHash('#/kraj?m=skoly&d=999&t=xx&g=55&km=500&s=nic&o=zle', snapSkoly());
    expect(invalid).toBe(true);
    expect(state.skoly).toEqual(DEFAULT_SKOLY);
    const ok = parseHash('#/kraj?m=skoly&d=554481&km=500', snapSkoly());
    expect(ok.invalid).toBe(true);
    expect(ok.state.skoly?.domov).toBe('554481');
    expect(ok.state.skoly?.maxKm).toBe(DEFAULT_SKOLY.maxKm);
  });
});

describe('režim „Kam vyrazit“ v hashi', () => {
  const mi = (id: string, obec: string) => ({ id, obec, kat: 'rozhledny' }) as unknown as NonNullable<Snapshot['vylety']>['mista'][number];
  function snapVylety(): Snapshot {
    return { ...makeSnap(), vylety: { updatedAt: 'x', sourceIds: [], mista: [mi('rozhledny:1', '554961'), mi('vleky:3', '506486')] } };
  }

  it('m=vylety bez parametrů → rozcestník s výchozími filtry; jiné režimy pole vylety nemají', () => {
    const { state, invalid } = parseHash('#/kraj?m=vylety', snapVylety());
    expect(invalid).toBe(false);
    expect(state.vylety).toEqual(DEFAULT_VYLETY);
    expect(parseHash('#/kraj?m=explore', snapVylety()).state.vylety).toBeUndefined();
  });

  it('round-trip všech parametrů (včetně hledání s diakritikou a id místa s dvojtečkou)', () => {
    const snap = snapVylety();
    const { state } = parseHash('#/kraj?m=vylety', snap);
    state.vylety = {
      kat: 'sjezdovky',
      domov: '554961',
      maxKm: 45,
      tagy: ['velky', 'lanovka'],
      vstup: 'zdarma',
      misto: 'vleky:3',
      q: 'Boží Dar & okolí',
      razeni: 'nazev',
    };
    const back = parseHash(toHash(state), snap);
    expect(back.invalid).toBe(false);
    expect(back.state).toEqual(state);
  });

  it('nevalidní hodnoty spadnou na výchozí a označí odkaz jako neplatný', () => {
    const { state, invalid } = parseHash('#/kraj?m=vylety&vk=kasina&vd=1&vkm=999&vf=OK!&vv=asi&vp=nic&vo=x', snapVylety());
    expect(invalid).toBe(true);
    expect(state.vylety).toEqual(DEFAULT_VYLETY);
  });

  it('parametry vylety se nepletou s „Kam na střední“ (d/km zůstávají školám)', () => {
    const { state } = parseHash('#/kraj?m=vylety&vd=554961&vkm=20', snapVylety());
    expect(state.skoly).toBeUndefined();
    expect(state.vylety?.domov).toBe('554961');
    expect(state.vylety?.maxKm).toBe(20);
  });
});

describe('režim „Kde by se mi dobře žilo?“ v hashi', () => {
  function snapZivot(): Snapshot {
    const obec = {
      level: 'obec',
      indicators: {},
      values: { obyvatele: { '554961': { 2025: 1 }, '554481': { 2025: 1 } } },
      regional: {},
      national: {},
    } as unknown as IndicatorFile;
    return { ...makeSnap(), indicators: { ...makeSnap().indicators, obec } };
  }

  it('m=score bez parametrů → doporučený výběr; jiné režimy pole zivot nemají', () => {
    const { state, invalid } = parseHash('#/kraj?m=score', snapZivot());
    expect(invalid).toBe(false);
    expect(state.zivot).toEqual(DEFAULT_ZIVOT);
    expect(Object.keys(state.zivot!.pozadavky).length).toBeGreaterThan(0);
    expect(parseHash('#/kraj?m=explore', snapZivot()).state.zivot).toBeUndefined();
  });

  it('round-trip požadavků s důležitostí, obce a bodů na mapě', () => {
    const snap = snapZivot();
    const { state } = parseHash('#/kraj?m=score', snap);
    state.zivot = { pozadavky: { lekarna: 2, 'blizko-kv': 1 }, obec: '554481', ukaz: 'lekarna' };
    const hash = toHash(state);
    expect(hash).toContain('zp=lekarna:2,blizko-kv:1');
    expect(hash).toContain('zo=554481');
    expect(hash).toContain('zu=lekarna');
    const back = parseHash(hash, snap);
    expect(back.invalid).toBe(false);
    expect(back.state).toEqual(state);
  });

  it('prázdné zp= (vše zrušeno) přežije round-trip', () => {
    const snap = snapZivot();
    const { state } = parseHash('#/kraj?m=score&zp=', snap);
    expect(state.zivot?.pozadavky).toEqual({});
    expect(parseHash(toHash(state), snap).state.zivot?.pozadavky).toEqual({});
  });

  it('nevalidní hodnoty spadnou na výchozí (platné páry zůstanou) a označí odkaz jako neplatný', () => {
    const { state, invalid } = parseHash('#/kraj?m=score&zp=lekarna:3,neexistuje:1,zubar:2&zo=999&zu=nic', snapZivot());
    expect(invalid).toBe(true);
    expect(state.zivot).toEqual({ pozadavky: { zubar: 2 }, obec: null, ukaz: null });
  });

  it('starý parametr w= se dál parsuje beze změny', () => {
    const { state } = parseHash('#/orp/4103?m=score&w=skoly:3', snapZivot());
    expect(state.weights).toEqual({ skoly: 3 });
  });
});

describe('režim „Úřady“ v hashi', () => {
  it('m=urady + uo/us round-trip, neplatné hodnoty spadnou na výchozí', async () => {
    const { DEFAULT_URADY } = await import('../src/lib/state.ts');
    const snap = makeSnap();
    const { state } = parseHash('#/kraj?m=urady', snap);
    expect(state.urady).toEqual(DEFAULT_URADY);
    const bad = parseHash('#/kraj?m=urady&uo=999999&us=nesmysl', snap);
    expect(bad.invalid).toBe(true);
    expect(bad.state.urady).toEqual(DEFAULT_URADY);
    state.urady = { obec: null, situace: 'matrika' };
    expect(parseHash(toHash(state), snap).state.urady).toEqual(state.urady);
  });
});

describe('režim „Peníze kraje“ v hashi', () => {
  it('pt/pv/po round-trip, výchozí záložka se do hashe nepíše, neplatné hodnoty spadnou', async () => {
    const { DEFAULT_PENIZE } = await import('../src/lib/state.ts');
    const snap = makeSnap();
    const { state } = parseHash('#/kraj?m=penize', snap);
    expect(state.penize).toEqual(DEFAULT_PENIZE);
    expect(toHash(state)).not.toContain('pt=');
    state.penize = { tab: 'vouchery', typ: 'kreativni', orp: '4103' };
    expect(parseHash(toHash(state), snap).state.penize).toEqual(state.penize);
    const bad = parseHash('#/kraj?m=penize&pt=xx&pv=yy&po=abc', snap);
    expect(bad.invalid).toBe(true);
    expect(bad.state.penize).toEqual(DEFAULT_PENIZE);
  });
});

describe('režim „Podnikání“ v hashi', () => {
  it('kt/ko/kq round-trip, výchozí záložka se nepíše', async () => {
    const { DEFAULT_PODNIKANI } = await import('../src/lib/state.ts');
    const snap = makeSnap();
    const { state } = parseHash('#/kraj?m=podnikani', snap);
    expect(state.podnikani).toEqual(DEFAULT_PODNIKANI);
    state.podnikani = { tab: 'zony', obor: 'Fotografie', q: 'keramika Cheb' };
    expect(toHash(state)).toContain('kt=zony');
    expect(parseHash(toHash(state), snap).state.podnikani).toEqual(state.podnikani);
    expect(parseHash('#/kraj?m=podnikani&kt=nic', snap).invalid).toBe(true);
  });
});
