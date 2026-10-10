/** Hledání napříč celou aplikací: školy, obory, místa k výletu, obce, úřady a kreativci. */

export type Cil =
  | { kind: 'obec'; kod: string }
  | { kind: 'skola'; izo: string }
  | { kind: 'misto'; id: string }
  | { kind: 'urad'; kod: string }
  | { kind: 'kreativec'; nazev: string };

export interface Polozka {
  /** skupina ve výsledcích, např. „Střední škola“ */
  typ: string;
  nazev: string;
  meta: string;
  cil: Cil;
}

/** Malá písmena bez diakritiky, aby šlo psát „karlovy vary“ i „Karlový Vary“. */
export function normalizuj(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Zaznam extends Polozka {
  _n: string;
  _m: string;
}

export function vytvorIndex(polozky: Polozka[]): Zaznam[] {
  const videno = new Set<string>();
  const out: Zaznam[] = [];
  for (const p of polozky) {
    const k = p.typ + '|' + JSON.stringify(p.cil) + '|' + p.nazev;
    if (videno.has(k)) continue;
    videno.add(k);
    out.push({ ...p, _n: normalizuj(p.nazev), _m: normalizuj(p.meta) });
  }
  return out;
}

/**
 * Vrátí nejvýš `limit` výsledků. Všechna slova dotazu musí být v názvu nebo popisu.
 * Pořadí: shoda na začátku názvu, shoda na začátku slova v názvu, kdekoli v názvu, jen v popisu.
 */
export function hledej(index: Zaznam[], dotaz: string, limit = 12): Polozka[] {
  const q = normalizuj(dotaz);
  if (q.length < 2) return [];
  const slova = q.split(' ');
  const hodnocene: { p: Zaznam; s: number }[] = [];
  for (const p of index) {
    if (!slova.every((w) => p._n.includes(w) || p._m.includes(w))) continue;
    let s = 3;
    if (p._n.startsWith(q)) s = 0;
    else if ((' ' + p._n).includes(' ' + q)) s = 1;
    else if (p._n.includes(q)) s = 2;
    hodnocene.push({ p, s });
  }
  hodnocene.sort((a, b) => a.s - b.s || a.p.nazev.length - b.p.nazev.length || a.p.nazev.localeCompare(b.p.nazev, 'cs'));
  return hodnocene.slice(0, limit).map(({ p }) => ({ typ: p.typ, nazev: p.nazev, meta: p.meta, cil: p.cil }));
}
