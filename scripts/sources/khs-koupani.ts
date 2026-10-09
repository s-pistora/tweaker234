// Výtah hodnocení kvality vody z webu Krajské hygienické stanice Karlovarského kraje (khskv.cz).
//
// Sada „Koupací místa s kontrolou kvality vody“ (datazapad.cz) u každého místa odkazuje na stránku
// KHS. Ta má pro každé odběrné místo tabulku: řádky „Datum odběru“, „Datum hodnocení“, „Hodnocení“
// (obrázek smile_<barva>.gif) a „Poznámka“. Bereme poslední vyplněné hodnocení každé tabulky
// a z odběrných míst toho nejhoršího – na koupališti platí nejhorší naměřený stav.
import type { KvalitaVody } from '../../src/lib/types.ts';

const BARVA: Record<string, KvalitaVody> = {
  blue: 'vhodna',
  green: 'mirne',
  orange: 'zhorsena',
  red: 'nevhodna',
  black: 'nebezpecna',
};
const PORADI: KvalitaVody[] = ['na', 'vhodna', 'mirne', 'zhorsena', 'nevhodna', 'nebezpecna'];

export interface HodnoceniVody {
  trida: KvalitaVody;
  /** datum posledního odběru (ISO yyyy-mm-dd) */
  datum: string | null;
  poznamka: string | null;
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

function cells(row: string): string[] {
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
}

/** „31. 8.“ + rok → '2026-08-31' */
function isoDatum(s: string, rok: number): string | null {
  const m = /(\d{1,2})\.\s*(\d{1,2})\.?/.exec(s);
  if (!m) return null;
  return `${rok}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function parseKhs(html: string): HodnoceniVody {
  const rokM = /Kontrola kvality vody v roce (\d{4})/.exec(html);
  const rok = rokM ? Number(rokM[1]) : new Date().getFullYear();
  const start = rokM ? html.indexOf(rokM[0]) : 0;
  let nejhorsi: HodnoceniVody = { trida: 'na', datum: null, poznamka: null };

  for (const tm of html.slice(start).matchAll(/<table[\s\S]*?<\/table>/g)) {
    const rows = [...tm[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => cells(m[1]));
    const radek = (label: string) => rows.find((r) => r.length && text(r[0]).startsWith(label))?.slice(1) ?? [];
    const odber = radek('Datum odběru');
    const hodn = radek('Hodnocení');
    const pozn = radek('Poznámka');
    if (!hodn.length) continue; // legenda nebo jiná tabulka
    let i = hodn.length - 1;
    while (i >= 0 && !/smile_(\w+)\./.test(hodn[i])) i--;
    if (i < 0) continue;
    const barva = /smile_(\w+)\./.exec(hodn[i])![1];
    const trida = BARVA[barva] ?? 'na';
    const h: HodnoceniVody = {
      trida,
      datum: odber[i] ? isoDatum(text(odber[i]), rok) : null,
      poznamka: pozn[i] ? text(pozn[i]) || null : null,
    };
    if (PORADI.indexOf(h.trida) > PORADI.indexOf(nejhorsi.trida)) nejhorsi = h;
  }
  return nejhorsi;
}

export async function stahniHodnoceni(url: string): Promise<HodnoceniVody> {
  try {
    const res = await fetch(url.replace(/^http:/, 'https:'));
    if (!res.ok) throw new Error(String(res.status));
    return parseKhs(await res.text());
  } catch {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      return parseKhs(await res.text());
    } catch {
      return { trida: 'na', datum: null, poznamka: null };
    }
  }
}
