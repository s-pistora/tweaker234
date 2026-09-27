// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { parseHash, toHash, appState, initHashSync, linkInvalid, type AppState } from '../src/lib/state.ts';
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
