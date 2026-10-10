// Režim „Podnikání“: Galerie kreativců, inovační infrastruktura (inkubátory, coworkingy,
// pobočky VŠ…) a průmyslové zóny. Zdroj: DATAZÁPAD (Karlovarský kraj).
// Čisté funkce – převod CSV (datový skript) i filtrování (frontend).

export interface Kreativec {
  id: string;
  nazev: string;
  /** obory z „Kategorie“ (např. „Fotografie“, „Řemeslo“) */
  obory: string[];
  obec: string;
  orp: string;
  web: string;
  profil: string;
  email: string;
  tel: string;
}

export type InfraTyp =
  | 'inovacni'
  | 'coworking'
  | 'dilna'
  | 'inkubator'
  | 'vyzkum'
  | 'vs'
  | 'kkc'
  | 'organizace';

export const INFRA_TYP: Record<InfraTyp, string> = {
  inkubator: 'Podnikatelský inkubátor',
  coworking: 'Coworking',
  inovacni: 'Inovační centrum',
  dilna: 'Otevřená dílna',
  kkc: 'Kulturní a kreativní centrum',
  vs: 'Pobočka vysoké školy',
  vyzkum: 'Výzkumná organizace',
  organizace: 'Podpora podnikání',
};

const INFRA_SLOUPCE: [string, InfraTyp][] = [
  ['inovační_centrum', 'inovacni'],
  ['coworkingové_centrum', 'coworking'],
  ['otevřená_dílna', 'dilna'],
  ['podnikatelský_inkubátor', 'inkubator'],
  ['výzkumná_organizace', 'vyzkum'],
  ['pobočka_vysoké_školy', 'vs'],
  ['kulturní_a_kreativní_centrum', 'kkc'],
  ['významná_organizace', 'organizace'],
];

export interface Infra {
  id: string;
  nazev: string;
  typy: InfraTyp[];
  popis: string;
  provozovatel: string;
  sektor: string;
  rok: number | null;
  adresa: string;
  obec: string;
  web: string;
}

export interface Zona {
  id: string;
  nazev: string;
  stav: 'stavajici' | 'zamer';
  obec: string;
  orp: string;
  web: string;
  lat: number | null;
  lon: number | null;
}

export interface PodnikaniFile {
  updatedAt: string;
  sourceIds: string[];
  kreativci: Kreativec[];
  infra: Infra[];
  zony: Zona[];
  chybyDat: string[];
}

export function isPodnikaniFile(x: unknown): x is PodnikaniFile {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.updatedAt === 'string' &&
    Array.isArray(o.kreativci) &&
    Array.isArray(o.infra) &&
    Array.isArray(o.zony) &&
    o.kreativci.every((k) => typeof k === 'object' && k !== null && Array.isArray((k as Kreativec).obory))
  );
}

// --- převod dat ------------------------------------------------------------------

type Radek = Record<string, string>;
const t = (v: string | undefined) => (v ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const web = (v: string | undefined) => {
  const s = t(v);
  return /^https?:\/\//i.test(s) ? s : '';
};
const num = (v: string | undefined) => {
  const n = Number(t(v).replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** Obory Kreativního Česka, jejichž název sám obsahuje čárku – při dělení se nesmí rozpadnout. */
const VICESLOVNE: [string[], string][] = [
  [['průmyslový', 'produktový a módní design'], 'Průmyslový, produktový a módní design'],
  [['film', 'televize', 'video'], 'Film, televize, video'],
  [['hudba', 'zvuk'], 'Hudba a zvuk'],
];

/** „Řemeslo, kreativní vzdělávání“ → ['Řemeslo', 'Kreativní vzdělávání'] (sjednocené velké písmeno). */
export function obory(kategorie: string): string[] {
  const casti = kategorie
    .split(/[,;]/)
    .map((x) => t(x).toLowerCase())
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < casti.length; i++) {
    const shoda = VICESLOVNE.find(([seq]) => seq.every((w, j) => casti[i + j] === w));
    let o: string;
    if (shoda) {
      o = shoda[1];
      i += shoda[0].length - 1;
    } else {
      o = casti[i].charAt(0).toUpperCase() + casti[i].slice(1);
    }
    if (!out.includes(o)) out.push(o);
  }
  return out;
}

/** Zdvojené uvozovky z exportu → české „…“. */
function nazev(s: string): string {
  let open = true;
  return t(s)
    .replace(/"{2,}/g, '"')
    .replace(/"/g, () => {
      const q = open ? '„' : '“';
      open = !open;
      return q;
    });
}

export function kreativci(rows: Radek[]): Kreativec[] {
  return rows
    .filter((r) => t(r['Název']))
    .map((r, i) => ({
      id: `k${i + 1}`,
      nazev: nazev(r['Název']),
      obory: obory(t(r['Kategorie'])),
      obec: t(r['Název obce']),
      orp: t(r['Název obce s rozšířenou působností']),
      web: web(r['Webová stránka kreativce']),
      profil: web(r['Webová stránka Galerie kreativců']) || web(r['Webová stránka Kreativní Česko']),
      email: t(r['Kontaktní e-mail']).replace(/^mailto:/i, ''),
      tel: t(r['Telefonní kontakt']).replace(/^tel:/i, ''),
    }))
    .sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'));
}

/** Inovační infrastruktura; stejné místo uvedené vícekrát (pro každý typ zvlášť) se sloučí. */
export function infra(rows: Radek[]): { infra: Infra[]; duplicit: number } {
  const m = new Map<string, Infra>();
  let duplicit = 0;
  rows.forEach((r, i) => {
    const nazev = t(r['název']).replace(/[“”"]/g, '').replace(/\s+/g, ' ');
    if (!nazev) return;
    const typy = INFRA_SLOUPCE.filter(([s]) => t(r[s]).toLowerCase() === 'true').map(([, typ]) => typ);
    const klic = `${nazev.toLowerCase()}|${t(r['název_obce'])}`;
    const prev = m.get(klic);
    if (prev) {
      duplicit++;
      for (const ty of typy) if (!prev.typy.includes(ty)) prev.typy.push(ty);
      if (!prev.popis) prev.popis = t(r['popis']);
      return;
    }
    m.set(klic, {
      id: `i${i + 1}`,
      nazev,
      typy,
      popis: t(r['popis']),
      provozovatel: t(r['provozovatel']),
      sektor: t(r['sektor']),
      rok: num(r['rok_založení']),
      adresa: t(r['adresa_místa']) || t(r['sídlo']),
      obec: t(r['název_obce']),
      web: web(r['webová_stránka']),
    });
  });
  return { infra: [...m.values()].sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs')), duplicit };
}

export function zony(rows: Radek[]): Zona[] {
  return rows
    .filter((r) => t(r['Název']))
    .map((r, i) => ({
      id: `z${i + 1}`,
      nazev: t(r['Název']),
      stav: (t(r['Záměr']).toLowerCase() === 'true' || /záměr/i.test(t(r['Stav'])) ? 'zamer' : 'stavajici') as Zona['stav'],
      obec: t(r['Název obce']),
      orp: t(r['Název obce s rozšířenou působností']),
      web: web(r['Webová stránka']),
      lat: num(r['Zeměpisná šířka v souřadnicovém systému WGS84']),
      lon: num(r['Zeměpisná délka v souřadnicovém systému WGS84']),
    }))
    .sort((a, b) => a.stav.localeCompare(b.stav) || a.nazev.localeCompare(b.nazev, 'cs'));
}

/** Nesrovnalosti v datech (zpětná vazba pro DATAZÁPAD). */
export function kontrola(k: Kreativec[], dupInfra: number, z: Zona[]): string[] {
  const out: string[] = [];
  const bezObce = k.filter((x) => !x.obec).length;
  if (bezObce) out.push(`Galerie kreativců: ${bezObce} z ${k.length} kreativců nemá uvedenou obec ani adresu.`);
  if (dupInfra) out.push(`Inovační infrastruktura: ${dupInfra} záznamy jsou duplicitní (stejné místo uvedené pro každý typ zvlášť).`);
  const divne = z.filter((x) => /věznice|polygon/i.test(x.nazev)).map((x) => x.nazev);
  if (divne.length) out.push(`Průmyslové zóny: mezi zónami jsou i ${divne.join(' a ')} – nejde o plochy pro nové investory.`);
  return out;
}

// --- vyhledávání ---------------------------------------------------------------

export const bezDiakritiky = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function filtrKreativci(k: Kreativec[], obor: string, q: string): Kreativec[] {
  const slova = bezDiakritiky(q.trim()).split(/\s+/).filter(Boolean);
  return k.filter(
    (x) =>
      (!obor || x.obory.includes(obor)) &&
      slova.every((w) => bezDiakritiky(`${x.nazev} ${x.obory.join(' ')} ${x.obec}`).includes(w)),
  );
}

/** Obory podle počtu kreativců (sestupně). */
export function poctyOboru(k: Kreativec[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of k) for (const o of x.obory) m.set(o, (m.get(o) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs'));
}
