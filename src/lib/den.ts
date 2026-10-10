/** „Naplánujte mi den“: tři zastávky z různých kategorií poblíž, seřazené do okruhu od domova. */
import type { KategorieId, Misto } from './types.ts';
import { vzdalenostKm } from './skoly.ts';

export interface Slot {
  cas: string;
  kat: KategorieId[];
}

export const SLOTY: Slot[] = [
  { cas: 'Dopoledne', kat: ['hrady-zamky', 'muzea', 'pamatky'] },
  { cas: 'Odpoledne', kat: ['rozhledny', 'priroda'] },
  { cas: 'Na závěr', kat: ['pivovary', 'prameny', 'rodiny', 'kultura'] },
];

/** max. vzdálenost mezi dvěma zastávkami (km), ať se den nerozjede po celém kraji */
const MEZI_ZASTAVKAMI_KM = 15;
/** přednostně aspoň tolik km mezi zastávkami, ať to je opravdu výlet, ne procházka po jednom náměstí */
const MIN_POPOJET_KM = 2;

export interface Zastavka {
  cas: string;
  misto: Misto;
  /** km od předchozí zastávky (u první od domova), vzdušnou čarou */
  km: number;
}

export interface Den {
  zastavky: Zastavka[];
  /** celý okruh včetně návratu domů, vzdušnou čarou */
  celkemKm: number;
  mapyUrl: string;
}

type Bod = { lat: number; lon: number };

/**
 * `varianta` určuje, kterou z blízkých možností vybrat (tlačítko „Jiný tip“) – stejná varianta
 * dá vždy stejný den. Vrací null, když v dosahu nejsou aspoň dvě vhodná místa.
 */
export function naplanujDen(mista: Misto[], domov: Bod, maxKm: number, varianta = 0): Den | null {
  const vDosahu = mista.filter((m) => vzdalenostKm(domov.lat, domov.lon, m.lat, m.lon) <= maxKm);
  const zastavky: Zastavka[] = [];
  const pouzite = new Set<string>();
  let kde: Bod = domov;
  SLOTY.forEach((slot, i) => {
    const kandidati = vDosahu
      .filter((m) => slot.kat.includes(m.kat) && !pouzite.has(m.nazev.toLowerCase()))
      .map((m) => ({ m, km: vzdalenostKm(kde.lat, kde.lon, m.lat, m.lon) }))
      .filter((x) => i === 0 || x.km <= MEZI_ZASTAVKAMI_KM)
      .sort((a, b) => a.km - b.km);
    const dal = i === 0 ? kandidati : kandidati.filter((x) => x.km >= MIN_POPOJET_KM);
    const nabidka = (dal.length ? dal : kandidati).slice(0, i === 0 ? 8 : 5);
    if (!kandidati.length) return;
    // každá zastávka se mění jiným tempem, ať „Jiný tip“ nepřinese jen posunutý seznam
    const vyber = nabidka[(varianta * (i + 1) + i) % nabidka.length];
    zastavky.push({ cas: slot.cas, misto: vyber.m, km: vyber.km });
    pouzite.add(vyber.m.nazev.toLowerCase());
    kde = vyber.m;
  });
  if (zastavky.length < 2) return null;
  const zpet = vzdalenostKm(kde.lat, kde.lon, domov.lat, domov.lon);
  const celkemKm = zastavky.reduce((a, z) => a + z.km, 0) + zpet;
  return { zastavky, celkemKm, mapyUrl: mapyTrasa(domov, zastavky.map((z) => z.misto)) };
}

/** Odkaz na plánovač tras Mapy.cz: okruh z domova přes zastávky zpět domů. */
export function mapyTrasa(domov: Bod, body: Bod[]): string {
  const f = (b: Bod) => `${b.lon.toFixed(5)},${b.lat.toFixed(5)}`;
  const q = new URLSearchParams({
    mapset: 'basic',
    start: f(domov),
    end: f(domov),
    routeType: 'car_fast',
  });
  if (body.length) q.set('waypoints', body.map(f).join(';'));
  return `https://mapy.cz/fnc/v1/route?${q.toString()}`;
}
