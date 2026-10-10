// Plánovač přihlášek na střední školu: čisté funkce nad obory (bez DOM/sítě).
//
// Pravidla 1. kola (vyhláška č. 422/2023 Sb.): až 3 přihlášky na obory bez talentové zkoušky,
// pořadí přihlášek = priorita. Termíny jednotné přijímací zkoušky 2027 podle sdělení MŠMT
// č. j. MSMT-525/2026-13 – nejsou to otevřená data kraje, jsou vložené ručně.

import type { Obor } from './types.ts';
import { naplnenost, tridaNaplnenosti, vzdalenostKm, type Domov, type TridaNaplnenosti } from './skoly.ts';

export const PLAN_MAX = 3;

const FORMA_KOD: Record<string, string> = { denní: 'd', dálková: 'z' };

/** Stabilní id oboru do adresy: IZO školy, kód oboru a forma (stejný kód bývá v denní i jiné formě). */
export function planId(o: Pick<Obor, 'izo' | 'kodOboru' | 'forma'>): string {
  return `${o.izo}_${o.kodOboru}_${FORMA_KOD[o.forma] ?? 'o'}`;
}

/** Obory plánu ve stejném pořadí jako id; neznámá id se vynechají. */
export function oboryPlanu(plan: string[], obory: Obor[]): Obor[] {
  const podleId = new Map(obory.map((o) => [planId(o), o]));
  return plan.map((id) => podleId.get(id)).filter((o): o is Obor => o !== undefined);
}

/** Přidá obor na konec plánu (nejnižší priorita); plný plán nebo duplicita = beze změny. */
export function pridej(plan: string[], id: string): string[] {
  if (plan.includes(id) || plan.length >= PLAN_MAX) return plan;
  return [...plan, id];
}

export function odeber(plan: string[], id: string): string[] {
  return plan.filter((x) => x !== id);
}

/** Posune obor v pořadí o `smer` (-1 = výš, +1 = níž); na okraji beze změny. */
export function posun(plan: string[], id: string, smer: -1 | 1): string[] {
  const i = plan.indexOf(id);
  const j = i + smer;
  if (i < 0 || j < 0 || j >= plan.length) return plan;
  const out = [...plan];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// --- šance -------------------------------------------------------------------

export interface Sance {
  trida: TridaNaplnenosti;
  /** krátké hodnocení */
  nazev: string;
  /** věta s čísly */
  veta: string;
}

const SANCE_NAZEV: Record<TridaNaplnenosti, string> = {
  volno: 'Dobrá šance',
  ok: 'Obor bývá skoro plný',
  pretlak: 'Velký zájem',
  na: 'Nelze odhadnout',
};

/** Slovní odhad šance podle loňské obsazenosti. Není to pravděpodobnost přijetí. */
export function sanceOboru(o: Obor): Sance {
  const n = naplnenost(o);
  const trida = tridaNaplnenosti(n);
  const z = o.zamer[2025];
  let veta: string;
  if (n === null || o.prijato2025 === null || z === null || z === undefined) {
    veta = 'Loňská obsazenost oboru v datech není.';
  } else if (trida === 'volno') {
    veta = `Loni zůstalo volných ${z - o.prijato2025} z ${z} míst.`;
  } else if (trida === 'ok') {
    veta = `Loni nastoupilo ${o.prijato2025} z ${z} plánovaných míst.`;
  } else {
    veta = `Loni nastoupilo ${o.prijato2025} žáků na ${z} plánovaných míst – škola přijala víc, než plánovala.`;
  }
  return { trida, nazev: SANCE_NAZEV[trida], veta };
}

// --- záloha ------------------------------------------------------------------

export interface Doporuceni {
  /** upozornění k plánu (prázdné = plán je v pořádku) */
  upozorneni: string[];
  /** obory jako záloha: stejné skupiny, v dosahu, s volnými místy */
  alternativy: { obor: Obor; km: number | null }[];
}

/**
 * Upozorní, když plán nemá „jistotu“ (žádný obor s volnými místy), a navrhne nejvýš `n`
 * alternativ ze stejných skupin oborů do `maxKm` od domova, seřazené od nejvíc volných.
 */
export function zalohaPlanu(
  plan: Obor[],
  vsechny: Obor[],
  domov: Domov | null,
  maxKm: number,
  n = 2,
): Doporuceni {
  const upozorneni: string[] = [];
  if (plan.length === 0) return { upozorneni, alternativy: [] };
  const tridy = plan.map((o) => tridaNaplnenosti(naplnenost(o)));
  const maJistotu = tridy.includes('volno');
  if (!maJistotu) {
    upozorneni.push(
      plan.length === 1
        ? 'Máte jen jeden obor a ten nemá loni volná místa. Přidejte obor, kde místa zbyla.'
        : 'Žádný z vybraných oborů neměl loni volná místa. Doporučujeme přidat obor, kde místa zbyla.',
    );
  }
  if (plan.length < PLAN_MAX) {
    upozorneni.push(`Můžete podat až ${PLAN_MAX} přihlášky – využijte i zbývající místo v plánu.`);
  }
  const mimo = plan.filter((o) => (o.zamer[2026] ?? 0) <= 0);
  for (const o of mimo) upozorneni.push(`Obor ${o.nazevOboru} (${o.skola}) pro 2026/27 nepřijímá.`);

  const vPlanu = new Set(plan.map(planId));
  const skupiny = new Set(plan.map((o) => o.skupina));
  const alternativy = vsechny
    .filter((o) => !vPlanu.has(planId(o)) && skupiny.has(o.skupina) && (o.zamer[2026] ?? 0) > 0)
    .filter((o) => tridaNaplnenosti(naplnenost(o)) === 'volno')
    .map((o) => ({ obor: o, km: domov ? vzdalenostKm(domov.lat, domov.lon, o.lat, o.lon) : null }))
    .filter((x) => x.km === null || x.km <= maxKm)
    .sort((a, b) => (naplnenost(a.obor) ?? 1) - (naplnenost(b.obor) ?? 1) || (a.km ?? 0) - (b.km ?? 0))
    .slice(0, maJistotu ? 0 : n);
  return { upozorneni, alternativy };
}

// --- termíny -----------------------------------------------------------------

export interface Termin {
  id: string;
  /** ISO datum začátku (YYYY-MM-DD) */
  od: string;
  /** ISO datum konce včetně; = od u jednodenních */
  do: string;
  nazev: string;
  popis: string;
  /** pro které obory platí: všechny / jen s jednotnou zkouškou (4leté, resp. víceleté) */
  pro: 'vse' | 'jpz4' | 'jpzVicelete' | 'jpz';
}

export const TERMINY_ZDROJ = {
  nazev: 'MŠMT: termíny jednotné přijímací zkoušky 2026/2027 (č. j. MSMT-525/2026-13), vyhláška č. 422/2023 Sb.',
  url: 'https://msmt.gov.cz/media/wp-content/uploads/2026/08/Sdeleni-o-terminech_2026-2027.pdf',
};

export const TERMINY_2027: Termin[] = [
  {
    id: 'prihlasky',
    od: '2027-02-01',
    do: '2027-02-20',
    nazev: 'Podání přihlášek (1. kolo)',
    popis: 'Elektronicky přes DiPSy (prihlaskynastredni.cz), nebo na papíře. Až 3 obory, pořadí = priorita.',
    pro: 'vse',
  },
  {
    id: 'skolni',
    od: '2027-03-15',
    do: '2027-04-23',
    nazev: 'Školní a talentové přijímací zkoušky',
    popis: 'Pokud je škola pořádá – přesné datum najdete na webu školy.',
    pro: 'vse',
  },
  {
    id: 'jpz4-1',
    od: '2027-04-12',
    do: '2027-04-12',
    nazev: 'Jednotná přijímací zkouška – 1. termín (čtyřleté obory)',
    popis: 'Čeština a matematika na škole, kterou máte v přihlášce na 1. místě.',
    pro: 'jpz4',
  },
  {
    id: 'jpz4-2',
    od: '2027-04-13',
    do: '2027-04-13',
    nazev: 'Jednotná přijímací zkouška – 2. termín (čtyřleté obory)',
    popis: 'Čeština a matematika na škole, kterou máte v přihlášce na 2. místě. Počítá se lepší výsledek.',
    pro: 'jpz4',
  },
  {
    id: 'jpzv-1',
    od: '2027-04-14',
    do: '2027-04-14',
    nazev: 'Jednotná přijímací zkouška – 1. termín (víceletá gymnázia)',
    popis: 'Čeština a matematika.',
    pro: 'jpzVicelete',
  },
  {
    id: 'jpzv-2',
    od: '2027-04-15',
    do: '2027-04-15',
    nazev: 'Jednotná přijímací zkouška – 2. termín (víceletá gymnázia)',
    popis: 'Čeština a matematika. Počítá se lepší výsledek.',
    pro: 'jpzVicelete',
  },
  {
    id: 'jpz-nahradni',
    od: '2027-04-29',
    do: '2027-04-30',
    nazev: 'Jednotná přijímací zkouška – náhradní termíny',
    popis: 'Jen pro ty, kdo se z vážných důvodů (nemoc) omluvili z řádného termínu.',
    pro: 'jpz',
  },
];

/** Jednotná zkouška se koná u maturitních oborů kromě skupiny 82 Umění a užité umění. */
export function maJpz(o: Pick<Obor, 'typ' | 'skupina'>): boolean {
  return o.typ === 'maturita' && o.skupina !== '82';
}

function vicelete(o: Pick<Obor, 'delka'>): boolean {
  return /šestilet|osmilet/.test(o.delka);
}

/** Termíny, které se týkají oborů v plánu (bez plánu = jen obecné termíny). */
export function terminyProPlan(plan: Obor[], terminy: Termin[] = TERMINY_2027): Termin[] {
  const jpz = plan.filter(maJpz);
  const ctyrlete = jpz.some((o) => !vicelete(o));
  const vic = jpz.some(vicelete);
  return terminy.filter(
    (t) =>
      t.pro === 'vse' ||
      (t.pro === 'jpz' && jpz.length > 0) ||
      (t.pro === 'jpz4' && ctyrlete) ||
      (t.pro === 'jpzVicelete' && vic),
  );
}

// --- iCalendar ---------------------------------------------------------------

/** Escapování textu podle RFC 5545 (\, ;, , a konce řádků). */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zalomení řádku na 75 oktetů (RFC 5545, 3.1) – pokračování začíná mezerou. */
function slozRadek(radek: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of radek) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (len + b > limit) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const icsDatum = (iso: string) => iso.replace(/-/g, '');

function denPo(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Kalendář s termíny plánu (celodenní události). V popisu je seznam vybraných oborů v pořadí
 * priority, ať je v kalendáři po ruce. `ted` = časové razítko DTSTAMP (kvůli testům).
 */
export function planDoIcs(plan: Obor[], terminy: Termin[], ted: Date = new Date()): string {
  const stamp = ted.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const seznam = plan.length
    ? plan.map((o, i) => `${i + 1}. ${o.nazevOboru} – ${o.skola.replace(/,?\s*příspěvková organizace$/i, '')}`).join('\n')
    : '';
  const radky = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Otevrena data Karlovarskeho kraje//Planovac prihlasek//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Přijímačky na střední 2027',
  ];
  for (const t of terminy) {
    const popis = [t.popis, seznam && `Moje přihlášky:\n${seznam}`, `Zdroj termínů: ${TERMINY_ZDROJ.url}`]
      .filter(Boolean)
      .join('\n\n');
    radky.push(
      'BEGIN:VEVENT',
      `UID:${t.id}-2027@kraj-term`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDatum(t.od)}`,
      `DTEND;VALUE=DATE:${icsDatum(denPo(t.do))}`,
      `SUMMARY:${icsText(t.nazev)}`,
      `DESCRIPTION:${icsText(popis)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  radky.push('END:VCALENDAR');
  return radky.map(slozRadek).join('\r\n') + '\r\n';
}

const MESICE = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

/** „1. února 2027“, rozsah „1.–20. února 2027“, „15. března – 23. dubna 2027“. */
export function datumTerminu(t: Pick<Termin, 'od' | 'do'>): string {
  const [y1, m1, d1] = t.od.split('-').map(Number);
  const [y2, m2, d2] = t.do.split('-').map(Number);
  if (t.od === t.do) return `${d1}. ${MESICE[m1 - 1]} ${y1}`;
  if (y1 === y2 && m1 === m2) return `${d1}.–${d2}. ${MESICE[m1 - 1]} ${y1}`;
  return `${d1}. ${MESICE[m1 - 1]} – ${d2}. ${MESICE[m2 - 1]} ${y2}`;
}
