// Režim „Kam vyrazit“: kategorie míst pro volný čas, jejich filtry a výpočty (čisté funkce).
import type { AreaCode, KategorieId, KvalitaVody, Misto } from './types.ts';
import { vzdalenostKm } from './skoly.ts';

export interface Volba {
  tag: string;
  label: string;
}
/** Skupina filtrů: uvnitř skupiny stačí jedna zvolená volba (NEBO), mezi skupinami platí všechny (A). */
export interface FiltrSkupina {
  id: string;
  label: string;
  volby: Volba[];
}

export interface KategorieDef {
  id: KategorieId;
  label: string;
  /** krátký popis na dlaždici rozcestníku */
  perex: string;
  /** barva značek a dlaždice (datová paleta brandbooku) */
  barva: string;
  /** SVG path ikony 24×24 (lineární, jednotná tloušťka čáry) */
  ikona: string;
  filtry: FiltrSkupina[];
  /** jak se jmenuje jedno místo (do vět „12 sjezdovek do 25 km“) */
  jednotky: [string, string, string];
  /** zobrazit filtr vstupného */
  vstupne: boolean;
}

const VODA_LABEL: Record<KvalitaVody, string> = {
  vhodna: 'voda vhodná ke koupání',
  mirne: 'vhodná, mírně zhoršené vlastnosti',
  zhorsena: 'zhoršená jakost vody',
  nevhodna: 'voda nevhodná ke koupání',
  nebezpecna: 'voda nebezpečná – zákaz koupání',
  na: 'hodnocení není k dispozici',
};
export function vodaLabel(t: KvalitaVody): string {
  return VODA_LABEL[t];
}

export const KATEGORIE: KategorieDef[] = [
  {
    id: 'sjezdovky',
    label: 'Sjezdovky a vleky',
    perex: 'Lyžařské areály s počtem vleků a lanovek, i ty s letním provozem.',
    barva: '#00469B',
    ikona: 'M3 20h18M5 20l7-14 7 14M9.5 11l2.5 2 2.5-2M17 4l-3 3',
    jednotky: ['areál', 'areály', 'areálů'],
    vstupne: false,
    filtry: [
      {
        id: 'velikost',
        label: 'Velikost areálu',
        volby: [
          { tag: 'maly', label: 'malý (1–2 vleky)' },
          { tag: 'stredni', label: 'střední (3–5)' },
          { tag: 'velky', label: 'velký (6 a víc)' },
        ],
      },
      {
        id: 'vybaveni',
        label: 'Vybavení',
        volby: [
          { tag: 'lanovka', label: 'lanovka' },
          { tag: 'pas', label: 'pás pro začátečníky' },
        ],
      },
      {
        id: 'sezona',
        label: 'Provoz',
        volby: [
          { tag: 'zima', label: 'jen v zimě' },
          { tag: 'celorocne', label: 'i mimo zimu' },
        ],
      },
    ],
  },
  {
    id: 'koupani',
    label: 'Koupání v přírodě',
    perex: 'Rybníky a jezera, kde hygienici měří kvalitu vody. Ukazujeme poslední výsledek.',
    barva: '#00998F',
    ikona: 'M2 17c2 0 2-1.5 4-1.5S8 17 10 17s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 21c2 0 2-1.5 4-1.5S8 21 10 21s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M15 4a2 2 0 1 0 0 .01M7 13l4-5 3 3 3-1',
    jednotky: ['koupací místo', 'koupací místa', 'koupacích míst'],
    vstupne: false,
    filtry: [
      {
        id: 'voda',
        label: 'Kvalita vody (poslední odběr)',
        volby: [
          { tag: 'voda-ok', label: 'vhodná ke koupání' },
          { tag: 'voda-zhorsena', label: 'zhoršená' },
          { tag: 'voda-zakaz', label: 'nevhodná / zákaz' },
          { tag: 'voda-na', label: 'bez hodnocení' },
        ],
      },
      {
        id: 'provoz',
        label: 'Provozovatel',
        volby: [
          { tag: 's-provozovatelem', label: 's provozovatelem (plavčík, zázemí)' },
          { tag: 'bez-provozovatele', label: 'volná příroda' },
        ],
      },
    ],
  },
  {
    id: 'bazeny',
    label: 'Bazény a aquaparky',
    perex: 'Kryté bazény, aquaparky a koupaliště s provozovatelem.',
    barva: '#3771B8',
    ikona: 'M4 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5M7 15V5a2 2 0 0 1 4 0M13 15V5a2 2 0 0 1 4 0M7 9h6',
    jednotky: ['bazén', 'bazény', 'bazénů'],
    vstupne: true,
    filtry: [
      {
        id: 'typ',
        label: 'Typ',
        volby: [
          { tag: 'aquapark', label: 'aquapark' },
          { tag: 'bazen', label: 'bazén' },
          { tag: 'koupaliste', label: 'koupaliště' },
        ],
      },
    ],
  },
  {
    id: 'hrady-zamky',
    label: 'Hrady a zámky',
    perex: 'Hrady, zámky, tvrze a zříceniny. Víme, které jsou přístupné.',
    barva: '#462E73',
    ikona: 'M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12M4 21h16M10 21v-5h4v5',
    jednotky: ['památka', 'památky', 'památek'],
    vstupne: true,
    filtry: [
      {
        id: 'typ',
        label: 'Typ',
        volby: [
          { tag: 'hrad', label: 'hrad' },
          { tag: 'zamek', label: 'zámek' },
          { tag: 'zricenina', label: 'zřícenina' },
          { tag: 'tvrz', label: 'tvrz' },
        ],
      },
      {
        id: 'pristup',
        label: 'Přístup',
        volby: [{ tag: 'pristupne', label: 'přístupné veřejnosti' }],
      },
      {
        id: 'pamatka',
        label: 'Ochrana',
        volby: [{ tag: 'pamatka', label: 'kulturní památka' }],
      },
    ],
  },
  {
    id: 'rozhledny',
    label: 'Rozhledny',
    perex: 'Rozhledny, vyhlídkové věže a vyhlídky. Některé jsou přístupné celoročně.',
    barva: '#680526',
    ikona: 'M12 3l-3 18M12 3l3 18M10 9h4M9.5 14h5M7 21h10M12 3V1',
    jednotky: ['rozhledna', 'rozhledny', 'rozhleden'],
    vstupne: true,
    filtry: [
      {
        id: 'typ',
        label: 'Typ',
        volby: [
          { tag: 'rozhledna', label: 'rozhledna' },
          { tag: 'vez', label: 'vyhlídková věž' },
          { tag: 'vyhlidka', label: 'vyhlídka' },
        ],
      },
      {
        id: 'pristup',
        label: 'Přístup',
        volby: [{ tag: 'nonstop', label: 'volně přístupná' }],
      },
    ],
  },
  {
    id: 'muzea',
    label: 'Muzea a galerie',
    perex: 'Muzea, galerie a skanzeny po celém kraji.',
    barva: '#00469B',
    ikona: 'M3 9l9-5 9 5M5 9v9M9 9v9M15 9v9M19 9v9M3 21h18M3 18h18',
    jednotky: ['muzeum', 'muzea', 'muzeí'],
    vstupne: true,
    filtry: [
      {
        id: 'typ',
        label: 'Typ',
        volby: [
          { tag: 'muzeum', label: 'muzeum' },
          { tag: 'galerie', label: 'galerie' },
          { tag: 'skanzen', label: 'skanzen' },
        ],
      },
    ],
  },
  {
    id: 'kultura',
    label: 'Divadla a kina',
    perex: 'Divadla, kina, letní kina a kulturní domy, kde se konají akce.',
    barva: '#B07800',
    ikona: 'M4 5h16v11H4zM8 21l4-5 4 5M9 9l5 2.5L9 14z',
    jednotky: ['místo', 'místa', 'míst'],
    vstupne: false,
    filtry: [
      {
        id: 'typ',
        label: 'Typ',
        volby: [
          { tag: 'divadlo', label: 'divadlo' },
          { tag: 'kino', label: 'kino' },
          { tag: 'letni-kino', label: 'letní kino' },
          { tag: 'kulturni-dum', label: 'kulturní dům' },
        ],
      },
    ],
  },
  {
    id: 'rodiny',
    label: 'S dětmi',
    perex: 'Minizoo, obory, lanová a zábavní centra a farmy.',
    barva: '#00998F',
    ikona: 'M8 7a2 2 0 1 0 0-.01M16 9a1.6 1.6 0 1 0 0-.01M5 21v-6l-1-4h8l-1 4v6M14 21v-5l-1-3h6l-1 3v5',
    jednotky: ['místo', 'místa', 'míst'],
    vstupne: true,
    filtry: [
      {
        id: 'typ',
        label: 'Co tam je',
        volby: [
          { tag: 'zvirata', label: 'zvířata' },
          { tag: 'lanove', label: 'lanové centrum' },
          { tag: 'zabavni', label: 'zábavní centrum' },
          { tag: 'farma', label: 'farma' },
          { tag: 'kone', label: 'koně' },
        ],
      },
      {
        id: 'pocasi',
        label: 'Počasí',
        volby: [{ tag: 'pod-strechou', label: 'pod střechou' }],
      },
    ],
  },
  {
    id: 'priroda',
    label: 'Příroda',
    perex: 'Přírodní rezervace, sopky, rašeliniště, botanické zahrady a arboreta.',
    barva: '#00998F',
    ikona: 'M12 22V12M12 12l-4-4M12 15l4-4M5 13a7 7 0 1 1 14 0c0 3-3 5-7 5s-7-2-7-5z',
    jednotky: ['místo', 'místa', 'míst'],
    vstupne: false,
    filtry: [
      {
        id: 'typ',
        label: 'Typ',
        volby: [
          { tag: 'pozoruhodnost', label: 'přírodní pozoruhodnost' },
          { tag: 'zahrada', label: 'botanická zahrada' },
          { tag: 'arboretum', label: 'arboretum' },
        ],
      },
      {
        id: 'ochrana',
        label: 'Ochrana',
        volby: [{ tag: 'chranene', label: 'chráněné území' }],
      },
    ],
  },
  {
    id: 'prameny',
    label: 'Prameny',
    perex: 'Přes 120 minerálních pramenů a studánek. Uvádíme, kde voda právě teče.',
    barva: '#3771B8',
    ikona: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11zM9.5 15a2.5 2.5 0 0 0 2.5 2.5',
    jednotky: ['pramen', 'prameny', 'pramenů'],
    vstupne: false,
    filtry: [
      {
        id: 'voda',
        label: 'Kolik vody teče',
        volby: [
          { tag: 'tece', label: 'teče dobře' },
          { tag: 'slabe', label: 'slabě' },
        ],
      },
      {
        id: 'druh',
        label: 'Druh',
        volby: [
          { tag: 'mineralni', label: 'minerální' },
          { tag: 'radioaktivni', label: 'radioaktivní' },
        ],
      },
      {
        id: 'pitny',
        label: 'Pitnost',
        volby: [{ tag: 'pitny', label: 'pitný' }],
      },
      {
        id: 'kde',
        label: 'Kde',
        volby: [{ tag: 've-meste', label: 'v obci (bez túry)' }],
      },
    ],
  },
  {
    id: 'sport',
    label: 'Sport',
    perex: 'Sportovní haly, zimní stadiony, golfová hřiště a jezdecké stáje.',
    barva: '#462E73',
    ikona: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18',
    jednotky: ['sportoviště', 'sportoviště', 'sportovišť'],
    vstupne: false,
    filtry: [
      {
        id: 'typ',
        label: 'Typ',
        volby: [
          { tag: 'hala', label: 'sportovní hala' },
          { tag: 'areal', label: 'areál / stadion' },
          { tag: 'led', label: 'zimní stadion' },
          { tag: 'golf', label: 'golf' },
          { tag: 'kone', label: 'jezdectví' },
        ],
      },
    ],
  },
  {
    id: 'pivovary',
    label: 'Pivovary',
    perex: 'Pivovary a minipivovary.',
    barva: '#680526',
    ikona: 'M6 4h10v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zM16 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M9 8v9M13 8v9',
    jednotky: ['pivovar', 'pivovary', 'pivovarů'],
    vstupne: false,
    filtry: [
      {
        id: 'typ',
        label: 'Typ',
        volby: [
          { tag: 'pivovar', label: 'pivovar' },
          { tag: 'minipivovar', label: 'minipivovar' },
        ],
      },
    ],
  },
  {
    id: 'dobroty',
    label: 'Regionální dobroty',
    perex: 'Výrobci oceněných místních potravin ze soutěže Dobroty Karlovarského kraje – maso, sýry, pečivo, med, nápoje.',
    barva: '#00998F',
    ikona: 'M3 9h18l-2 11H5zM8 9l4-6 4 6M9 13v4M15 13v4M12 13v4',
    jednotky: ['výrobce', 'výrobci', 'výrobců'],
    vstupne: false,
    filtry: [
      {
        id: 'druh',
        label: 'Co vyrábějí',
        volby: [
          { tag: 'maso', label: 'maso a uzeniny' },
          { tag: 'mleko', label: 'mléčné výrobky' },
          { tag: 'pecivo', label: 'pečivo a cukrovinky' },
          { tag: 'napoje', label: 'nápoje' },
          { tag: 'ovoce', label: 'ovoce, zelenina, med' },
          { tag: 'ostatni', label: 'ostatní' },
        ],
      },
      {
        id: 'oceneni',
        label: 'Ocenění',
        volby: [{ tag: 'vitez', label: 'vítěz kategorie (1. místo)' }],
      },
    ],
  },
  {
    id: 'pamatky',
    label: 'Památky a historie',
    perex: 'Památky UNESCO, národní kulturní památky, kostely a kláštery, archeologická naleziště, technické a pietní památky.',
    barva: '#462E73',
    ikona: 'M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10h20L12 3z',
    jednotky: ['památka', 'památky', 'památek'],
    vstupne: true,
    filtry: [
      {
        id: 'typ',
        label: 'Druh památky',
        volby: [
          { tag: 'unesco', label: 'UNESCO' },
          { tag: 'nkp', label: 'národní kulturní památka' },
          { tag: 'cirkevni', label: 'kostel, klášter, kaple' },
          { tag: 'archeo', label: 'archeologické naleziště' },
          { tag: 'technicka', label: 'technická a hornická' },
          { tag: 'pietni', label: 'vojenská a pietní' },
        ],
      },
      {
        id: 'navsteva',
        label: 'Návštěva',
        volby: [
          { tag: 'pristupne', label: 'přístupné' },
          { tag: 'prohlidky', label: 'prohlídky' },
        ],
      },
    ],
  },
];

export const KATEGORIE_BY_ID = Object.fromEntries(KATEGORIE.map((k) => [k.id, k])) as Record<KategorieId, KategorieDef>;

/** Tagy místa včetně odvozených (kvalita vody → voda-ok / voda-zhorsena / voda-zakaz / voda-na). */
export function tagyMista(m: Misto): string[] {
  if (m.kat !== 'koupani') return m.tagy;
  const t = m.voda?.trida ?? 'na';
  const v =
    t === 'vhodna' || t === 'mirne'
      ? 'voda-ok'
      : t === 'zhorsena'
        ? 'voda-zhorsena'
        : t === 'nevhodna' || t === 'nebezpecna'
          ? 'voda-zakaz'
          : 'voda-na';
  return [...m.tagy, v];
}

/** Česká množná čísla: 1 → [0], 2–4 → [1], jinak [2]. */
export function plural(n: number, f: [string, string, string]): string {
  return n === 1 ? f[0] : n >= 2 && n <= 4 ? f[1] : f[2];
}

export type Vstup = 'vse' | 'zdarma' | 'placene';
export type RazeniMist = 'vzdalenost' | 'nazev';

export interface FiltrMist {
  kat: KategorieId | null;
  domov: { lat: number; lon: number } | null;
  maxKm: number;
  tagy: string[];
  vstup: Vstup;
  q: string;
}

export interface VysledekMista {
  misto: Misto;
  /** vzdušnou čarou od bydliště; null = bydliště nezadáno */
  km: number | null;
}

/** Odstraní diakritiku a převede na malá písmena (pro hledání). */
export function bezDiakritiky(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Projde filtrem tagů: v každé skupině kategorie, kde je něco zvoleno, musí místo mít aspoň jeden tag. */
export function projdeTagy(m: Misto, def: KategorieDef | undefined, zvolene: string[]): boolean {
  if (!def || !zvolene.length) return true;
  const mt = new Set(tagyMista(m));
  for (const g of def.filtry) {
    const vGroup = g.volby.map((v) => v.tag).filter((tag) => zvolene.includes(tag));
    if (vGroup.length && !vGroup.some((tag) => mt.has(tag))) return false;
  }
  return true;
}

export function filtrujMista(mista: Misto[], f: FiltrMist, razeni: RazeniMist = 'vzdalenost'): VysledekMista[] {
  const def = f.kat ? KATEGORIE_BY_ID[f.kat] : undefined;
  const q = bezDiakritiky(f.q.trim());
  const out: VysledekMista[] = [];
  for (const m of mista) {
    if (f.kat && m.kat !== f.kat) continue;
    if (!projdeTagy(m, def, f.tagy)) continue;
    if (f.vstup === 'zdarma' && m.vstupne !== false) continue;
    if (f.vstup === 'placene' && m.vstupne !== true) continue;
    if (q && !bezDiakritiky(`${m.nazev} ${m.obecNazev} ${m.popis ?? ''}`).includes(q)) continue;
    const km = f.domov ? vzdalenostKm(f.domov.lat, f.domov.lon, m.lat, m.lon) : null;
    if (km !== null && km > f.maxKm) continue;
    out.push({ misto: m, km });
  }
  out.sort((a, b) =>
    razeni === 'vzdalenost' && a.km !== null && b.km !== null
      ? a.km - b.km
      : a.misto.nazev.localeCompare(b.misto.nazev, 'cs'),
  );
  return out;
}

/** Pro každou obec: kolik míst (už vyfiltrovaných podle tagů) je do `maxKm`. */
export function mistaVDosahu(
  mista: Misto[],
  centroidy: Record<AreaCode, { lat: number; lon: number }>,
  maxKm: number,
): Record<AreaCode, number> {
  const out: Record<AreaCode, number> = {};
  for (const [code, c] of Object.entries(centroidy)) {
    let n = 0;
    for (const m of mista) if (vzdalenostKm(c.lat, c.lon, m.lat, m.lon) <= maxKm) n++;
    out[code] = n;
  }
  return out;
}

/** Počet míst v každé kategorii. */
export function pocty(mista: Misto[]): Record<KategorieId, number> {
  const out = Object.fromEntries(KATEGORIE.map((k) => [k.id, 0])) as Record<KategorieId, number>;
  for (const m of mista) out[m.kat] = (out[m.kat] ?? 0) + 1;
  return out;
}

/** Krátké štítky místa pro kartu (z názvů voleb kategorie). */
export function stitky(m: Misto): string[] {
  const def = KATEGORIE_BY_ID[m.kat];
  const mt = new Set(m.tagy);
  const out: string[] = [];
  for (const g of def.filtry) for (const v of g.volby) if (mt.has(v.tag)) out.push(v.label);
  return out;
}

/** Věta „lidskou řečí“ o místě – šablona, bez AI. */
export function vetaOMiste(m: Misto, km: number | null, domovNazev: string): string {
  const def = KATEGORIE_BY_ID[m.kat];
  const casti: string[] = [];
  const kde = m.obecNazev ? ` v obci ${m.obecNazev}` : '';
  if (km !== null && domovNazev) {
    casti.push(`${m.nazev} leží${kde}, ${fmtKm(km)} vzdušnou čarou od obce ${domovNazev}.`);
  } else {
    casti.push(`${m.nazev} leží${kde}.`);
  }
  if (m.kat === 'sjezdovky') {
    const { vleky = 0, lanovky = 0, pasy = 0 } = m.cisla;
    const p: string[] = [];
    if (vleky) p.push(`${vleky} ${plural(vleky, ['vlek', 'vleky', 'vleků'])}`);
    if (lanovky) p.push(`${lanovky} ${plural(lanovky, ['lanovku', 'lanovky', 'lanovek'])}`);
    if (pasy) p.push(`${pasy} ${plural(pasy, ['pás', 'pásy', 'pásů'])} pro začátečníky`);
    if (p.length) casti.push(`Areál má ${p.join(', ')}.`);
  }
  if (m.kat === 'rozhledny' && m.cisla.vznik) casti.push(`Postavena byla v roce ${m.cisla.vznik}.`);
  if (m.kat === 'dobroty' && m.cisla.vyrobky) {
    const n = m.cisla.vyrobky;
    casti.push(
      `V soutěži Dobroty Karlovarského kraje ${plural(n, ['uspěl', 'uspěly', 'uspělo'])} ${n} ${plural(n, ['jeho výrobek', 'jeho výrobky', 'jeho výrobků'])}${m.cisla.rok ? `, naposledy v roce ${m.cisla.rok}` : ''}${m.tagy.includes('vitez') ? ' – i s vítězstvím v kategorii' : ''}.`,
    );
  }
  if (m.voda) {
    casti.push(
      m.voda.trida === 'na'
        ? 'Hodnocení kvality vody za letošní sezónu zatím není k dispozici.'
        : `Poslední odběr${m.voda.datum ? ` (${fmtDatum(m.voda.datum)})` : ''}: ${vodaLabel(m.voda.trida)}${m.voda.poznamka ? ` – ${m.voda.poznamka}` : ''}.`,
    );
  }
  if (def.vstupne && m.vstupne !== null) casti.push(m.vstupne ? 'Vstup je placený.' : 'Vstup je zdarma.');
  return casti.join(' ');
}

export function fmtKm(km: number): string {
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

export function fmtDatum(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return `${d}. ${mo}. ${y}`;
}
