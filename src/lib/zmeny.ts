// Hlídač změn: porovná dva snapshoty dat (před a po aktualizaci) a popíše změny lidskou řečí.
// Čisté funkce nad JSON soubory public/data – volá je skript scripts/zmeny.ts, výsledek čte
// frontend ze souboru public/data/zmeny.json („Co je nového v datech“).

export interface Zmena {
  /** oblast aplikace, např. „Střední školy“ */
  oblast: string;
  veta: string;
}

export interface BehHlidace {
  /** ISO čas běhu */
  datum: string;
  zmeny: Zmena[];
}

export interface ZmenyFile {
  /** běhy od nejnovějšího, jen ty, které něco našly */
  behy: BehHlidace[];
}

export const MAX_BEHU = 30;

export function isZmenyFile(x: unknown): x is ZmenyFile {
  if (typeof x !== 'object' || x === null) return false;
  const b = (x as { behy?: unknown }).behy;
  return (
    Array.isArray(b) &&
    b.every(
      (r) =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as BehHlidace).datum === 'string' &&
        Array.isArray((r as BehHlidace).zmeny),
    )
  );
}

/** Soubory snapshotu: relativní cesta v public/data → naparsovaný JSON (nebo undefined). */
export type Soubory = Record<string, unknown>;

const pl = (n: number, f: [string, string, string]) => (n === 1 ? f[0] : n >= 2 && n <= 4 ? f[1] : f[2]);
const fmt = (n: number) => new Intl.NumberFormat('cs-CZ').format(n);
const PRIKLADU = 3;
function vycet(xs: string[]): string {
  const zbyva = xs.length - PRIKLADU;
  return xs.slice(0, PRIKLADU).join(', ') + (zbyva > 0 ? ` a ${zbyva} ${pl(zbyva, ['další', 'další', 'dalších'])}` : '');
}

type Zaznam = Record<string, unknown>;
const pole = (x: unknown, klic: string): Zaznam[] => {
  const v = (x as Record<string, unknown> | undefined)?.[klic];
  return Array.isArray(v) ? (v as Zaznam[]) : [];
};

/** Nové a zrušené záznamy podle klíče. */
export function rozdilZaznamu(
  pred: Zaznam[],
  po: Zaznam[],
  klic: (z: Zaznam) => string,
): { nove: Zaznam[]; zrusene: Zaznam[]; spolecne: [Zaznam, Zaznam][] } {
  const a = new Map(pred.map((z) => [klic(z), z]));
  const b = new Map(po.map((z) => [klic(z), z]));
  return {
    nove: [...b].filter(([k]) => !a.has(k)).map(([, z]) => z),
    zrusene: [...a].filter(([k]) => !b.has(k)).map(([, z]) => z),
    spolecne: [...b].filter(([k]) => a.has(k)).map(([k, z]) => [a.get(k)!, z]),
  };
}

function noveZrusene(oblast: string, co: [string, string, string], nove: string[], zrusene: string[]): Zmena[] {
  const out: Zmena[] = [];
  if (nove.length) out.push({ oblast, veta: `Nově v datech: ${nove.length} ${pl(nove.length, co)} – ${vycet(nove)}.` });
  if (zrusene.length) out.push({ oblast, veta: `Už v datech není: ${zrusene.length} ${pl(zrusene.length, co)} – ${vycet(zrusene)}.` });
  return out;
}

const oborKlic = (z: Zaznam) => `${z.izo}|${z.kodOboru}|${z.forma}|${z.delka}`;
const oborNazev = (z: Zaznam) => `${z.nazevOboru} (${String(z.skola ?? '').replace(/,?\s*příspěvková organizace$/i, '')})`;

function zmenyOboru(pred: unknown, po: unknown): Zmena[] {
  const oblast = 'Střední školy';
  const r = rozdilZaznamu(pole(pred, 'obory'), pole(po, 'obory'), oborKlic);
  const out = noveZrusene(oblast, ['obor', 'obory', 'oborů'], r.nove.map(oborNazev), r.zrusene.map(oborNazev));
  const mist: string[] = [];
  for (const [a, b] of r.spolecne) {
    const za = (a.zamer as Record<string, number | null> | undefined)?.['2026'] ?? null;
    const zb = (b.zamer as Record<string, number | null> | undefined)?.['2026'] ?? null;
    if (za !== zb) mist.push(`${oborNazev(b)} ${za ?? 0} → ${zb ?? 0}`);
  }
  if (mist.length) out.push({ oblast, veta: `Změnil se počet míst pro 2026/27 u ${mist.length} ${pl(mist.length, ['oboru', 'oborů', 'oborů'])}: ${vycet(mist)}.` });
  const por = rozdilZaznamu(pole(pred, 'poradny'), pole(po, 'poradny'), (z) => String(z.nazev));
  out.push(...noveZrusene(oblast, ['poradna', 'poradny', 'poraden'], por.nove.map((z) => String(z.nazev)), por.zrusene.map((z) => String(z.nazev))));
  return out;
}

function zmenyVoucheru(pred: unknown, po: unknown): Zmena[] {
  const r = rozdilZaznamu(pole(pred, 'features'), pole(po, 'features'), (z) => String(z.id));
  if (!r.nove.length && !r.zrusene.length) return [];
  const castka = r.nove.reduce((s, z) => {
    const a = z.attrs as Record<string, unknown> | undefined;
    return s + (a?.uspesna === true && typeof a.prideleno === 'number' ? a.prideleno : 0);
  }, 0);
  const out: Zmena[] = [];
  if (r.nove.length)
    out.push({
      oblast: 'Peníze kraje',
      veta: `${pl(r.nove.length, ['Přibyla', 'Přibyly', 'Přibylo'])} ${r.nove.length} ${pl(r.nove.length, ['žádost', 'žádosti', 'žádostí'])} o voucher${castka ? ` (přiděleno celkem ${fmt(castka)} Kč)` : ''}.`,
    });
  if (r.zrusene.length)
    out.push({ oblast: 'Peníze kraje', veta: `Už v datech není: ${r.zrusene.length} ${pl(r.zrusene.length, ['žádost', 'žádosti', 'žádostí'])} o voucher.` });
  return out;
}

function zmenyProjektu(pred: unknown, po: unknown): Zmena[] {
  const oblast = 'Peníze kraje';
  const r = rozdilZaznamu(pole(pred, 'projekty'), pole(po, 'projekty'), (z) => String(z.id));
  const out = noveZrusene(oblast, ['projekt', 'projekty', 'projektů'], r.nove.map((z) => String(z.nazev)), r.zrusene.map((z) => String(z.nazev)));
  const skoncene = r.spolecne.filter(([a, b]) => a.stav === 'probiha' && b.stav === 'ukonceno').map(([, b]) => String(b.nazev));
  if (skoncene.length) out.push({ oblast, veta: `${pl(skoncene.length, ['Skončil', 'Skončily', 'Skončilo'])} ${skoncene.length} ${pl(skoncene.length, ['projekt', 'projekty', 'projektů'])}: ${vycet(skoncene)}.` });
  return out;
}

function zmenyBodu(nazev: string, pred: unknown, po: unknown): Zmena[] {
  const r = rozdilZaznamu(pole(pred, 'features'), pole(po, 'features'), (z) => String(z.id));
  const label = String((po as Zaznam | undefined)?.label ?? (pred as Zaznam | undefined)?.label ?? nazev);
  return noveZrusene(label, ['záznam', 'záznamy', 'záznamů'], r.nove.map((z) => String(z.name)), r.zrusene.map((z) => String(z.name)));
}

function zmenyMist(pred: unknown, po: unknown): Zmena[] {
  const r = rozdilZaznamu(pole(pred, 'mista'), pole(po, 'mista'), (z) => String(z.id));
  return noveZrusene('Kam vyrazit', ['místo', 'místa', 'míst'], r.nove.map((z) => String(z.nazev)), r.zrusene.map((z) => String(z.nazev)));
}

function zmenyPodnikani(pred: unknown, po: unknown): Zmena[] {
  const out: Zmena[] = [];
  for (const [k, co] of [
    ['kreativci', ['kreativec', 'kreativci', 'kreativců']],
    ['infra', ['místo pro podnikání', 'místa pro podnikání', 'míst pro podnikání']],
    ['zony', ['průmyslová zóna', 'průmyslové zóny', 'průmyslových zón']],
  ] as const) {
    const r = rozdilZaznamu(pole(pred, k), pole(po, k), (z) => String(z.id));
    out.push(...noveZrusene('Podnikání', [...co], r.nove.map((z) => String(z.nazev)), r.zrusene.map((z) => String(z.nazev))));
  }
  return out;
}

/** Nejnovější rok s nějakou hodnotou pro každý ukazatel. */
function posledniRoky(file: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const values = (file as { values?: Record<string, Record<string, Record<string, number | null>>> } | undefined)?.values ?? {};
  for (const [id, byArea] of Object.entries(values)) {
    let max = -Infinity;
    for (const byYear of Object.values(byArea)) for (const [r, v] of Object.entries(byYear)) if (v !== null) max = Math.max(max, Number(r));
    if (Number.isFinite(max)) out[id] = max;
  }
  return out;
}

function zmenyUkazatelu(level: string, pred: unknown, po: unknown): Zmena[] {
  const a = posledniRoky(pred);
  const b = posledniRoky(po);
  const labels = (po as { indicators?: Record<string, { label?: string }> } | undefined)?.indicators ?? {};
  const nove = Object.entries(b)
    .filter(([id, r]) => a[id] !== undefined && r > a[id])
    .map(([id, r]) => `${labels[id]?.label ?? id} (${r})`);
  if (!nove.length) return [];
  const kde = level === 'obec' ? 'obce' : level === 'orp' ? 'ORP' : 'kraje';
  return [{ oblast: 'Statistika kraje', veta: `Nová data za ${kde}: ${vycet(nove)}.` }];
}

/** Všechny změny mezi dvěma snapshoty (klíče = cesty jako v manifestu, např. 'skoly/obory.json'). */
export function porovnej(pred: Soubory, po: Soubory): Zmena[] {
  const out: Zmena[] = [];
  out.push(...zmenyOboru(pred['skoly/obory.json'], po['skoly/obory.json']));
  out.push(...zmenyMist(pred['vylety/mista.json'], po['vylety/mista.json']));
  out.push(...zmenyProjektu(pred['penize/penize.json'], po['penize/penize.json']));
  out.push(...zmenyVoucheru(pred['points/vouchery.json'], po['points/vouchery.json']));
  out.push(...zmenyPodnikani(pred['podnikani/podnikani.json'], po['podnikani/podnikani.json']));
  for (const cesta of new Set([...Object.keys(pred), ...Object.keys(po)])) {
    const m = /^points\/(.+)\.json$/.exec(cesta);
    if (m && m[1] !== 'vouchery') out.push(...zmenyBodu(m[1], pred[cesta], po[cesta]));
    const u = /^indicators\/(kraj|orp|obec)\.json$/.exec(cesta);
    if (u) out.push(...zmenyUkazatelu(u[1], pred[cesta], po[cesta]));
  }
  return out;
}

/** Připíše běh na začátek historie (jen když něco našel), nejvýš MAX_BEHU běhů. */
export function pripisBeh(file: ZmenyFile | null, beh: BehHlidace): ZmenyFile {
  const behy = file?.behy ?? [];
  if (!beh.zmeny.length) return { behy };
  return { behy: [beh, ...behy].slice(0, MAX_BEHU) };
}
