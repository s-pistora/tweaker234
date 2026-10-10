// Kontrola dosahu: s bydlištěm se smí ukázat jen objekty do zvolené vzdálenosti – a žádný
// objekt v dosahu nesmí chybět. Projde všech 134 obcí kraje × několik vzdáleností nad reálnými daty.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { areaFeatures } from '../src/lib/map/project.ts';
import { centroidy } from '../src/lib/map/centroids.ts';
import { filtrujObory, proZakyZeZs, vzdalenostKm } from '../src/lib/skoly.ts';
import { filtrujMista, KATEGORIE } from '../src/lib/vylety.ts';
import type { Misto, Obor } from '../src/lib/types.ts';

const json = (p: string) => JSON.parse(readFileSync(`public/data/${p}`, 'utf8'));
const obce = centroidy(areaFeatures(json('geo/kv-obce.topo.json')));
const obory: Obor[] = (json('skoly/obory.json').obory as Obor[]).filter(proZakyZeZs);
const mista: Misto[] = json('vylety/mista.json').mista;
const KM = [5, 15, 30, 80];

describe('dosah – Kam na střední', () => {
  it('134 obcí × 4 vzdálenosti: jen obory do dosahu a žádný v dosahu nechybí', () => {
    expect(Object.keys(obce)).toHaveLength(134);
    for (const domov of Object.values(obce)) {
      for (const km of KM) {
        const v = filtrujObory(obory, { domov, typ: 'vse', skupina: '', maxKm: km });
        for (const r of v) expect(r.km!).toBeLessThanOrEqual(km);
        const vDosahu = obory.filter((o) => (o.zamer[2026] ?? 0) > 0 && vzdalenostKm(domov.lat, domov.lon, o.lat, o.lon) <= km);
        expect(v.length).toBe(vDosahu.length);
      }
    }
  });
});

describe('dosah – Kam vyrazit', () => {
  it('134 obcí × 4 vzdálenosti × všechny kategorie: jen místa do dosahu, nic nechybí', () => {
    for (const domov of Object.values(obce)) {
      for (const km of KM) {
        for (const kat of [null, ...KATEGORIE.map((k) => k.id)]) {
          const v = filtrujMista(mista, { kat, domov, maxKm: km, tagy: [], vstup: 'vse', q: '' });
          for (const r of v) expect(r.km!).toBeLessThanOrEqual(km);
          const ocek = mista.filter((m) => (!kat || m.kat === kat) && vzdalenostKm(domov.lat, domov.lon, m.lat, m.lon) <= km).length;
          expect(v.length).toBe(ocek);
        }
      }
    }
  });
});
