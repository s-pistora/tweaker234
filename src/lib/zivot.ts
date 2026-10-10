// Režim „Kde by se mi dobře žilo?“: požadavky na bydlení a jejich skóre pro 134 obcí
// Karlovarského kraje (čisté funkce, žádný přístup na DOM/síť).
//
// Každý požadavek má pro každou obec jedno číslo (metriku): vzdálenost ke
// nejbližšímu bodu, počet bodů v okruhu, ukazatel obce, vzdálenost do města nebo
// počet obyvatel. Metrika se převede na percentil v rámci kraje (0–100, viz
// `percentileRank`) – 100 = nejlepší obec kraje v daném požadavku.
// Skóre obce = vážený průměr percentilů zvolených požadavků (důležité = váha 1,
// velmi důležité = váha 2). Chybí-li obci hodnota, požadavek se u ní přeskočí a
// váhy ostatních se renormalizují (do jmenovatele jdou jen použité váhy).
import type { AreaCode, KategorieId, Misto, PointFeature } from './types.ts';
import type { Snapshot } from './data/loader.ts';
import type { LatLon } from './map/centroids.ts';
import { percentileRank } from './score.ts';
import { ustavniSkola, vzdalenostKm } from './skoly.ts';
import { fmtKm, plural } from './vylety.ts';

export type SkupinaId = 'Doprava a služby' | 'Volný čas' | 'Lidé a práce';
export const SKUPINY: readonly SkupinaId[] = ['Doprava a služby', 'Volný čas', 'Lidé a práce'];

/** Důležitost zvoleného požadavku: 1 = důležité, 2 = velmi důležité (= váha ve skóre). */
export type Dulezitost = 1 | 2;

/** Které body požadavek používá: bodová vrstva snapshotu, nebo místa pro volný čas. */
export type Vyber =
  | { vrstva: string; filtr?: (f: PointFeature) => boolean }
  | { kat: KategorieId[]; filtr?: (m: Misto) => boolean };

export type Metrika =
  /** km od středu obce k nejbližšímu bodu */
  | { druh: 'nejblizsi'; vyber: Vyber; co: string }
  /** počet bodů do `km` od středu obce; `tvary` = [1, 2–4, 5+], `nula` = věta pro 0 */
  | { druh: 'pocet'; vyber: Vyber; km: number; tvary: [string, string, string]; kratce: [string, string, string]; nula: string }
  /** ukazatel obce (poslední rok s daty) */
  | { druh: 'ukazatel'; ukazatel: string; nazev: string; jednotka: string; desetin: number }
  /** km od středu obce do středu města */
  | { druh: 'mesto'; obec: AreaCode; doMesta: string; primo: string }
  /** počet obyvatel (poslední rok) */
  | { druh: 'velikost' };

export interface Pozadavek {
  /** ascii kebab, používá se v URL (`zp=`) */
  id: string;
  label: string;
  skupina: SkupinaId;
  /** krátký popis pod názvem */
  popis: string;
  metrika: Metrika;
  /** jednotka metriky do vět a náhledu */
  jednotka: string;
  higherIsBetter: boolean;
  /** barva bodů na mapě (datová paleta brandbooku); jen u požadavků s body */
  barva?: string;
}

// --- výběry bodů --------------------------------------------------------------

/** Typ školy z vrstvy skoly („MŠ,ZŠ,SŠ“) obsahuje daný druh; bez ústavních škol (běžné dítě tam nechodí). */
const skola = (druh: string) => (f: PointFeature) =>
  String(f.attrs.typ ?? '').split(',').includes(druh) && !ustavniSkola(f.name);
const nrpzs = (...typy: string[]) => (f: PointFeature) => typy.includes(String(f.attrs.typ ?? ''));
const kraj = (typ: string, druh?: string) => (f: PointFeature) =>
  f.attrs.typ === typ && (druh === undefined || String(f.attrs.druh ?? '').startsWith(druh));

export const POZADAVKY: readonly Pozadavek[] = [
  // --- Doprava a služby ---
  {
    id: 'zastavka',
    label: 'Autobusová zastávka',
    skupina: 'Doprava a služby',
    popis: 'Kolik zastávek je do 1 km od středu obce.',
    metrika: {
      druh: 'pocet',
      vyber: { vrstva: 'zastavky' },
      km: 1,
      tvary: ['autobusová zastávka', 'autobusové zastávky', 'autobusových zastávek'],
      kratce: ['zastávka', 'zastávky', 'zastávek'],
      nula: 'Do 1 km od středu obce není žádná autobusová zastávka.',
    },
    jednotka: 'zastávek do 1 km',
    higherIsBetter: true,
    barva: 'var(--data-1)',
  },
  {
    id: 'materska-skola',
    label: 'Mateřská škola blízko',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližší mateřské škole.',
    metrika: { druh: 'nejblizsi', vyber: { vrstva: 'skoly', filtr: skola('MŠ') }, co: 'mateřská škola' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-2)',
  },
  {
    id: 'zakladni-skola',
    label: 'Základní škola blízko',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližší základní škole.',
    metrika: { druh: 'nejblizsi', vyber: { vrstva: 'skoly', filtr: skola('ZŠ') }, co: 'základní škola' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-1)',
  },
  {
    id: 'stredni-skola',
    label: 'Střední škola do dojezdu',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližší střední škole.',
    metrika: { druh: 'nejblizsi', vyber: { vrstva: 'skoly', filtr: skola('SŠ') }, co: 'střední škola' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-4)',
  },
  {
    id: 'lekar',
    label: 'Praktický lékař',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližší ordinaci praktického lékaře pro dospělé.',
    metrika: {
      druh: 'nejblizsi',
      vyber: { vrstva: 'zdravotnictvi', filtr: nrpzs('Samost. ordinace všeob. prakt. lékaře') },
      co: 'ordinace praktického lékaře',
    },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-2)',
  },
  {
    id: 'detsky-lekar',
    label: 'Dětský lékař',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližšímu praktickému lékaři pro děti a dorost.',
    metrika: {
      druh: 'nejblizsi',
      vyber: { vrstva: 'zdravotnictvi', filtr: nrpzs('Sam.ord.prakt.lékaře pro děti a dorost') },
      co: 'ordinace dětského lékaře',
    },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-3)',
  },
  {
    id: 'zubar',
    label: 'Zubní lékař',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližší zubní ordinaci.',
    metrika: {
      druh: 'nejblizsi',
      vyber: { vrstva: 'zdravotnictvi', filtr: nrpzs('Samostatná ordinace PL - stomatologa') },
      co: 'zubní ordinace',
    },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-4)',
  },
  {
    id: 'lekarna',
    label: 'Lékárna',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližší lékárně.',
    metrika: { druh: 'nejblizsi', vyber: { vrstva: 'zdravotnictvi', filtr: nrpzs('Lékárna') }, co: 'lékárna' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-2)',
  },
  {
    id: 'nemocnice',
    label: 'Nemocnice',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližší nemocnici v kraji.',
    metrika: { druh: 'nejblizsi', vyber: { vrstva: 'zdravotnictvi-kraj', filtr: kraj('nemocnice') }, co: 'nemocnice' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-6)',
  },
  {
    id: 'pohotovost',
    label: 'Pohotovost',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližší lékařské pohotovostní službě.',
    metrika: {
      druh: 'nejblizsi',
      vyber: { vrstva: 'zdravotnictvi-kraj', filtr: kraj('pohotovost', 'lékařská') },
      co: 'lékařská pohotovost',
    },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-6)',
  },
  {
    id: 'zachranka',
    label: 'Záchranná služba',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližší výjezdové základně záchranky.',
    metrika: { druh: 'nejblizsi', vyber: { vrstva: 'zdravotnictvi-kraj', filtr: kraj('zzs') }, co: 'základna záchranky' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-6)',
  },
  {
    id: 'socialni',
    label: 'Sociální služby',
    skupina: 'Doprava a služby',
    popis: 'Vzdálenost k nejbližšímu poskytovateli sociálních služeb.',
    metrika: { druh: 'nejblizsi', vyber: { vrstva: 'socialni' }, co: 'sociální služba' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-4)',
  },
  // --- Volný čas ---
  {
    id: 'bazen',
    label: 'Bazén nebo aquapark',
    skupina: 'Volný čas',
    popis: 'Vzdálenost ke krytému bazénu, aquaparku nebo koupališti.',
    metrika: { druh: 'nejblizsi', vyber: { kat: ['bazeny'] }, co: 'bazén nebo koupaliště' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-1)',
  },
  {
    id: 'koupani',
    label: 'Koupání s čistou vodou',
    skupina: 'Volný čas',
    popis: 'Koupací místo, kde byla voda při poslední kontrole vhodná.',
    metrika: {
      druh: 'nejblizsi',
      vyber: { kat: ['koupani'], filtr: (m: Misto) => m.voda?.trida === 'vhodna' || m.voda?.trida === 'mirne' },
      co: 'koupání s vhodnou vodou',
    },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-2)',
  },
  {
    id: 'sport',
    label: 'Sportoviště',
    skupina: 'Volný čas',
    popis: 'Sportovní hala, stadion, zimní stadion, golf nebo jízdárna.',
    metrika: { druh: 'nejblizsi', vyber: { kat: ['sport'] }, co: 'sportoviště' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-4)',
  },
  {
    id: 'kino-divadlo',
    label: 'Kino nebo divadlo',
    skupina: 'Volný čas',
    popis: 'Vzdálenost k nejbližšímu kinu, letnímu kinu nebo divadlu.',
    metrika: {
      druh: 'nejblizsi',
      vyber: { kat: ['kultura'], filtr: (m: Misto) => m.tagy.some((t: string) => t === 'kino' || t === 'letni-kino' || t === 'divadlo') },
      co: 'kino nebo divadlo',
    },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-3)',
  },
  {
    id: 'sjezdovka',
    label: 'Sjezdovka',
    skupina: 'Volný čas',
    popis: 'Vzdálenost k nejbližšímu lyžařskému areálu.',
    metrika: { druh: 'nejblizsi', vyber: { kat: ['sjezdovky'] }, co: 'sjezdovka' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-1)',
  },
  {
    id: 'priroda',
    label: 'Příroda a prameny',
    skupina: 'Volný čas',
    popis: 'Kolik přírodních míst a pramenů je do 5 km.',
    metrika: {
      druh: 'pocet',
      vyber: { kat: ['priroda', 'prameny'] },
      km: 5,
      tvary: ['přírodní místo nebo pramen', 'přírodní místa nebo prameny', 'přírodních míst a pramenů'],
      kratce: ['místo', 'místa', 'míst'],
      nula: 'Do 5 km od středu obce není žádné přírodní místo ani pramen z dat kraje.',
    },
    jednotka: 'míst do 5 km',
    higherIsBetter: true,
    barva: 'var(--data-2)',
  },
  {
    id: 'deti',
    label: 'Pro děti',
    skupina: 'Volný čas',
    popis: 'Minizoo, farma, lanové nebo zábavní centrum.',
    metrika: { druh: 'nejblizsi', vyber: { kat: ['rodiny'] }, co: 'místo pro rodiny s dětmi' },
    jednotka: 'km',
    higherIsBetter: false,
    barva: 'var(--data-3)',
  },
  {
    id: 'pamatky',
    label: 'Hrady, zámky a muzea',
    skupina: 'Volný čas',
    popis: 'Kolik hradů, zámků a muzeí je do 10 km.',
    metrika: {
      druh: 'pocet',
      vyber: { kat: ['hrady-zamky', 'muzea'] },
      km: 10,
      tvary: ['hrad, zámek nebo muzeum', 'hrady, zámky nebo muzea', 'hradů, zámků a muzeí'],
      kratce: ['místo', 'místa', 'míst'],
      nula: 'Do 10 km od středu obce není žádný hrad, zámek ani muzeum.',
    },
    jednotka: 'míst do 10 km',
    higherIsBetter: true,
    barva: 'var(--data-4)',
  },
  // --- Lidé a práce ---
  {
    id: 'mlada-obec',
    label: 'Mladá obec',
    skupina: 'Lidé a práce',
    popis: 'Vysoký podíl dětí do 14 let.',
    metrika: { druh: 'ukazatel', ukazatel: 'podil_0_14', nazev: 'Podíl dětí 0–14 let', jednotka: '%', desetin: 1 },
    jednotka: '%',
    higherIsBetter: true,
  },
  {
    id: 'obec-roste',
    label: 'Obec roste',
    skupina: 'Lidé a práce',
    popis: 'Přibývá obyvatel (narození i stěhování).',
    metrika: {
      druh: 'ukazatel',
      ukazatel: 'prirustek_na_1000',
      nazev: 'Celkový přírůstek obyvatel',
      jednotka: 'na 1000 obyvatel',
      desetin: 1,
    },
    jednotka: 'na 1000 obyv.',
    higherIsBetter: true,
  },
  {
    id: 'nezamestnanost',
    label: 'Nízká nezaměstnanost',
    skupina: 'Lidé a práce',
    popis: 'Malý podíl nezaměstnaných.',
    metrika: { druh: 'ukazatel', ukazatel: 'nezamestnanost', nazev: 'Podíl nezaměstnaných', jednotka: '%', desetin: 1 },
    jednotka: '%',
    higherIsBetter: false,
  },
  {
    id: 'klidna-obec',
    label: 'Klidná menší obec',
    skupina: 'Lidé a práce',
    popis: 'Čím méně obyvatel, tím lépe.',
    metrika: { druh: 'velikost' },
    jednotka: 'obyvatel',
    higherIsBetter: false,
  },
  {
    id: 'mesto',
    label: 'Město s vybaveností',
    skupina: 'Lidé a práce',
    popis: 'Čím víc obyvatel, tím lépe.',
    metrika: { druh: 'velikost' },
    jednotka: 'obyvatel',
    higherIsBetter: true,
  },
  {
    id: 'blizko-kv',
    label: 'Blízko Karlových Varů',
    skupina: 'Lidé a práce',
    popis: 'Vzdálenost do krajského města.',
    metrika: { druh: 'mesto', obec: '554961', doMesta: 'Karlových Varů', primo: 'Tohle jsou přímo Karlovy Vary.' },
    jednotka: 'km',
    higherIsBetter: false,
  },
  {
    id: 'blizko-cheb',
    label: 'Blízko Chebu',
    skupina: 'Lidé a práce',
    popis: 'Vzdálenost do Chebu.',
    metrika: { druh: 'mesto', obec: '554481', doMesta: 'Chebu', primo: 'Tohle je přímo Cheb.' },
    jednotka: 'km',
    higherIsBetter: false,
  },
];

export const POZADAVKY_BY_ID: Record<string, Pozadavek> = Object.fromEntries(POZADAVKY.map((p) => [p.id, p]));
export const POZADAVEK_IDS: readonly string[] = POZADAVKY.map((p) => p.id);

/**
 * Doporučený (výchozí) výběr: doprava, lékař, základní škola a práce – to, co řeší
 * většina lidí při stěhování. Díky němu mapa po otevření režimu není prázdná.
 */
export const DOPORUCENY_VYBER: Readonly<Record<string, Dulezitost>> = {
  zastavka: 1,
  lekar: 1,
  'zakladni-skola': 1,
  nezamestnanost: 1,
};

// --- kontext výpočtu ------------------------------------------------------------

export interface BodZivota {
  id: string;
  nazev: string;
  lat: number;
  lon: number;
  /** kde bod leží (název obce), může být '' */
  obecNazev: string;
  /** kód obce, ve které bod leží; null = v datech chybí */
  obec: AreaCode | null;
  /** adresa místa (jen místa pro volný čas); bodové vrstvy ji nemají */
  adresa: string | null;
  provider: string;
}

export interface MetrikaObci {
  values: Record<AreaCode, number | null>;
  /** rok dat (u ukazatelů obce), jinak null */
  rok: number | null;
}

export interface ZivotKontext {
  snap: Snapshot;
  /** střed každé obce kraje (= množina obcí, které se hodnotí) */
  obce: Record<AreaCode, LatLon>;
  names: Record<AreaCode, string>;
  /**
   * obce bez stálých obyvatel (např. vojenský újezd Hradiště): nehodnotí se vůbec –
   * všechny metriky mají null a do percentilů ani pořadí nevstupují
   */
  neobydlene: Set<AreaCode>;
  /** memo: body, metriky a percentily podle id požadavku */
  body: Map<string, BodZivota[]>;
  metriky: Map<string, MetrikaObci>;
  percentily: Map<string, Record<AreaCode, number | null>>;
}

export function vytvorKontext(
  snap: Snapshot,
  obce: Record<AreaCode, LatLon>,
  names: Record<AreaCode, string>,
): ZivotKontext {
  const ctx: ZivotKontext = {
    snap,
    obce,
    names,
    neobydlene: new Set(),
    body: new Map(),
    metriky: new Map(),
    percentily: new Map(),
  };
  // počet obyvatel v posledním roce s daty; 0 nebo chybějící údaj = obec bez obyvatel
  // (jen když počty obyvatel vůbec máme – jinak nic nevylučujeme)
  const pop = ukazatelObci(ctx, 'obyvatele');
  if (pop.rok !== null) {
    for (const [code, v] of Object.entries(pop.values)) if (v !== null && v <= 0) ctx.neobydlene.add(code); // chybějící údaj ≠ neobydlená obec
  }
  return ctx;
}

/** Body požadavku (pro metriku i pro mapu); [] u požadavků bez bodů nebo bez dat. */
export function bodyPozadavku(ctx: ZivotKontext, id: string): BodZivota[] {
  const hit = ctx.body.get(id);
  if (hit) return hit;
  const p = POZADAVKY_BY_ID[id];
  const m = p?.metrika;
  let out: BodZivota[] = [];
  if (m && (m.druh === 'nejblizsi' || m.druh === 'pocet')) {
    const v = m.vyber;
    if ('vrstva' in v) {
      const layer = ctx.snap.points[v.vrstva];
      const provider = ctx.snap.manifest.sources.find((s) => s.id === layer?.sourceId)?.provider ?? '';
      out = (layer?.features ?? [])
        .filter((f) => (v.filtr ? v.filtr(f) : true))
        .map((f) => ({
          id: f.id,
          nazev: f.name,
          lat: f.lat,
          lon: f.lon,
          obecNazev: String(f.attrs.obecNazev ?? ctx.names[f.obec] ?? ''),
          obec: f.obec || null,
          adresa: null,
          provider,
        }));
    } else {
      out = (ctx.snap.vylety?.mista ?? [])
        .filter((x) => v.kat.includes(x.kat) && (v.filtr ? v.filtr(x) : true))
        .map((x) => ({
          id: x.id,
          nazev: x.nazev,
          lat: x.lat,
          lon: x.lon,
          obecNazev: x.obecNazev,
          obec: x.obec,
          adresa: x.adresa,
          provider: 'Karlovarský kraj (datazapad.cz)',
        }));
    }
    // klíče bodů na mapě musí být unikátní
    const seen = new Set<string>();
    out = out.filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lon) && !seen.has(b.id) && !!seen.add(b.id));
  }
  ctx.body.set(id, out);
  return out;
}

/** Hodnota ukazatele obce v posledním roce, kdy má ukazatel aspoň jednu hodnotu. */
function ukazatelObci(ctx: ZivotKontext, ukazatel: string): MetrikaObci {
  const file = ctx.snap.indicators.obec;
  const byArea = file?.values[ukazatel];
  const values: Record<AreaCode, number | null> = {};
  if (!byArea) {
    for (const code of Object.keys(ctx.obce)) values[code] = null;
    return { values, rok: null };
  }
  let rok: number | null = null;
  for (const byYear of Object.values(byArea)) {
    for (const [y, v] of Object.entries(byYear)) {
      if (typeof v === 'number' && Number.isFinite(v) && (rok === null || Number(y) > rok)) rok = Number(y);
    }
  }
  for (const code of Object.keys(ctx.obce)) {
    const v = rok !== null ? byArea[code]?.[rok] : undefined;
    values[code] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  return { values, rok };
}

/** Metrika požadavku pro všechny obce (memo podle id). Neznámé id → všude null. */
export function metrika(ctx: ZivotKontext, id: string): MetrikaObci {
  const hit = ctx.metriky.get(id);
  if (hit) return hit;
  const m = POZADAVKY_BY_ID[id]?.metrika;
  let out: MetrikaObci = { values: {}, rok: null };
  if (!m) {
    for (const code of Object.keys(ctx.obce)) out.values[code] = null;
  } else if (m.druh === 'nejblizsi' || m.druh === 'pocet') {
    const body = bodyPozadavku(ctx, id);
    for (const [code, c] of Object.entries(ctx.obce)) {
      if (!body.length) {
        out.values[code] = null;
        continue;
      }
      if (m.druh === 'nejblizsi') {
        let min = Infinity;
        for (const b of body) min = Math.min(min, vzdalenostKm(c.lat, c.lon, b.lat, b.lon));
        out.values[code] = min;
      } else {
        let n = 0;
        for (const b of body) if (vzdalenostKm(c.lat, c.lon, b.lat, b.lon) <= m.km) n++;
        out.values[code] = n;
      }
    }
  } else if (m.druh === 'ukazatel') {
    out = ukazatelObci(ctx, m.ukazatel);
  } else if (m.druh === 'velikost') {
    out = ukazatelObci(ctx, 'obyvatele');
  } else {
    const cil = ctx.obce[m.obec];
    for (const [code, c] of Object.entries(ctx.obce)) {
      out.values[code] = cil ? vzdalenostKm(c.lat, c.lon, cil.lat, cil.lon) : null;
    }
  }
  for (const code of ctx.neobydlene) out.values[code] = null;
  ctx.metriky.set(id, out);
  return out;
}

/** Percentil obcí v požadavku (0–100, 100 = nejlepší v kraji), memo podle id. */
export function percentily(ctx: ZivotKontext, id: string): Record<AreaCode, number | null> {
  const hit = ctx.percentily.get(id);
  if (hit) return hit;
  const p = POZADAVKY_BY_ID[id];
  const out = percentileRank(metrika(ctx, id).values, p?.higherIsBetter ?? true);
  ctx.percentily.set(id, out);
  return out;
}

// --- skóre ----------------------------------------------------------------------

export interface CastSkore {
  id: string;
  value: number;
  percentile: number;
  weight: Dulezitost;
}

export interface ZivotSkore {
  score: number | null;
  parts: CastSkore[];
  /** zvolené požadavky, pro které obci chybí údaj (vynechány, váhy renormalizovány) */
  skipped: string[];
  /** obec bez stálých obyvatel – nehodnotí se */
  neobydlena?: boolean;
}

/** Skóre všech obcí podle zvolených požadavků; prázdný výběr → všude null. */
export function spocitejSkore(ctx: ZivotKontext, vybrane: Record<string, Dulezitost>): Record<AreaCode, ZivotSkore> {
  const ids = Object.keys(vybrane).filter((id) => id in POZADAVKY_BY_ID && (vybrane[id] === 1 || vybrane[id] === 2));
  const out: Record<AreaCode, ZivotSkore> = {};
  for (const code of Object.keys(ctx.obce)) {
    if (ctx.neobydlene.has(code)) {
      out[code] = { score: null, parts: [], skipped: [], neobydlena: true };
      continue;
    }
    const parts: CastSkore[] = [];
    const skipped: string[] = [];
    for (const id of ids) {
      const p = percentily(ctx, id)[code];
      const v = metrika(ctx, id).values[code];
      if (p === null || p === undefined || v === null || v === undefined) {
        skipped.push(id);
        continue;
      }
      parts.push({ id, value: v, percentile: p, weight: vybrane[id] });
    }
    const totalW = parts.reduce((s, x) => s + x.weight, 0);
    out[code] = {
      score: totalW > 0 ? parts.reduce((s, x) => s + x.percentile * x.weight, 0) / totalW : null,
      parts,
      skipped,
    };
  }
  return out;
}

export interface PoradiObce {
  code: AreaCode;
  score: number;
  /** pořadí v kraji (shodné skóre = shodné pořadí) */
  rank: number;
}

/** Obce seřazené od nejvyššího skóre (bez obcí se skóre null). */
export function poradi(skore: Record<AreaCode, ZivotSkore>, names: Record<AreaCode, string> = {}): PoradiObce[] {
  const list = Object.entries(skore)
    .filter((e): e is [AreaCode, ZivotSkore & { score: number }] => e[1].score !== null)
    .map(([code, s]) => ({ code, score: s.score, rank: 0 }))
    .sort((a, b) => b.score - a.score || (names[a.code] ?? a.code).localeCompare(names[b.code] ?? b.code, 'cs'));
  for (let i = 0; i < list.length; i++) {
    // zaokrouhlené skóre (to, co uživatel vidí) se stejnou hodnotou = stejné pořadí
    list[i].rank = i > 0 && Math.round(list[i].score) === Math.round(list[i - 1].score) ? list[i - 1].rank : i + 1;
  }
  return list;
}

export interface Srovnani {
  /** kolik ostatních obcí je v požadavku na tom hůř / lépe / stejně */
  horsich: number;
  lepsich: number;
  shodnych: number;
  /** obcí s údajem včetně této */
  celkem: number;
}

/**
 * Srovnání obce s ostatními obcemi kraje v jednom požadavku podle skutečných hodnot.
 * Percentil (průměrné pořadí) se hodí pro skóre, ale do věty „lépe než X % obcí“ ne:
 * při shodách (např. 29 obcí bez zastávky) by tvrdil, že obec někoho předčí.
 */
export function srovnani(ctx: ZivotKontext, id: string, code: AreaCode): Srovnani | null {
  const p = POZADAVKY_BY_ID[id];
  const values = metrika(ctx, id).values;
  const v = values[code];
  if (!p || v === null || v === undefined) return null;
  const s: Srovnani = { horsich: 0, lepsich: 0, shodnych: 0, celkem: 1 };
  for (const [c, x] of Object.entries(values)) {
    if (c === code || x === null || x === undefined) continue;
    s.celkem++;
    if (x === v) s.shodnych++;
    else if (x < v === p.higherIsBetter) s.horsich++;
    else s.lepsich++;
  }
  return s;
}

/** „lépe než 62 % obcí“ / „nejlépe v kraji (spolu s 3 dalšími obcemi)“ / „nejslabší v kraji“. */
export function textSrovnani(s: Srovnani): string {
  if (s.celkem <= 1) return 'jediná obec s údajem';
  const spolu = s.shodnych
    ? ` (spolu s ${s.shodnych} ${plural(s.shodnych, ['další obcí', 'dalšími obcemi', 'dalšími obcemi'])})`
    : '';
  if (s.lepsich === 0) return `nejlépe v kraji${spolu}`;
  if (s.horsich === 0) return `nejslabší v kraji${spolu}`;
  return `lépe než ${Math.round((100 * s.horsich) / (s.celkem - 1))} % obcí`;
}

/** Nejsilnější stránky obce: části s nejvyšším percentilem (při shodě vyšší váha). */
export function silneStranky(s: ZivotSkore | undefined, n = 2): CastSkore[] {
  if (!s) return [];
  return [...s.parts].sort((a, b) => b.percentile - a.percentile || b.weight - a.weight).slice(0, n);
}

// --- věty -----------------------------------------------------------------------

/** České číslo (desetinná čárka, mezera v tisících), záporné s typografickým minus „−“. */
const fmtCs = (n: number, desetin = 0) =>
  new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: desetin, maximumFractionDigits: desetin })
    .format(n)
    .replace('-', '−');

/** Krátká hodnota metriky do náhledu/seznamu, např. „2,4 km“, „6 zastávek do 1 km“, „16,2 %“. */
export function kratkaHodnota(id: string, value: number): string {
  const p = POZADAVKY_BY_ID[id];
  if (!p || !Number.isFinite(value)) return '';
  const m = p.metrika;
  if (m.druh === 'nejblizsi' || m.druh === 'mesto') return fmtKm(value);
  if (m.druh === 'pocet') return `${fmtCs(value)} ${plural(value, m.kratce)} do ${m.km} km`;
  if (m.druh === 'ukazatel') return `${fmtCs(value, m.desetin)} ${m.jednotka === '%' ? '%' : p.jednotka}`;
  return `${fmtCs(value)} ${p.jednotka}`;
}

/** Věta „lidskou řečí“ o hodnotě požadavku v obci – šablona, bez AI, nikdy NaN. */
export function vetaPozadavku(ctx: ZivotKontext, id: string, code: AreaCode, value: number): string {
  const p = POZADAVKY_BY_ID[id];
  if (!p || !Number.isFinite(value)) return '';
  const m = p.metrika;
  const rok = metrika(ctx, id).rok;
  switch (m.druh) {
    case 'nejblizsi':
      return `Nejbližší ${m.co} je ${fmtKm(value)} od středu obce.`;
    case 'pocet': {
      if (value === 0) return m.nula;
      const sloveso = value >= 2 && value <= 4 ? 'jsou' : 'je';
      return `Do ${m.km} km od středu obce ${sloveso} ${fmtCs(value)} ${plural(value, m.tvary)}.`;
    }
    case 'ukazatel': {
      const num = fmtCs(value, m.desetin);
      const jed = m.jednotka === '%' ? '%' : m.jednotka;
      return `${m.nazev} je ${num} ${jed}${rok !== null ? ` (${rok})` : ''}.`;
    }
    case 'velikost':
      return `V obci žije ${fmtCs(value)} obyvatel${rok !== null ? ` (${rok})` : ''}.`;
    case 'mesto':
      return code === m.obec ? m.primo : `Do ${m.doMesta} je to ${fmtKm(value)} vzdušnou čarou.`;
  }
}
