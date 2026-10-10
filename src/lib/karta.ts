// Karta obce pro starostu: jednostránkový přehled jedné obce z dat, která aplikace už má
// (obyvatelé, služby, školy, peníze, podnikání, úřady). Čisté funkce – žádná nová data.

import type { AreaCode, IndicatorFile, Obor } from './types.ts';
import type { Snapshot } from './data/loader.ts';
import type { Radek } from './csv.ts';
import { filtrujObory, vzdalenostKm } from './skoly.ts';
import { vouchery, kc } from './penize.ts';
import {
  DOPORUCENY_VYBER,
  POZADAVKY_BY_ID,
  kratkaHodnota,
  metrika,
  poradi,
  spocitejSkore,
  srovnani,
  textSrovnani,
  vetaPozadavku,
  type ZivotKontext,
} from './zivot.ts';

export interface RadekKarty {
  /** co se měří */
  co: string;
  /** hlavní číslo / krátká hodnota */
  hodnota: string;
  /** věta lidskou řečí (může být '') */
  veta: string;
}

export interface SekceKarty {
  id: string;
  nadpis: string;
  radky: RadekKarty[];
}

export interface Karta {
  kod: AreaCode;
  nazev: string;
  orp: string;
  /** nejdůležitější věty nahoře karty */
  shrnuti: string[];
  sekce: SekceKarty[];
}

const fmt = (n: number, d = 0) =>
  new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n).replace('-', '−');
const pl = (n: number, f: [string, string, string]) => (n === 1 ? f[0] : n >= 2 && n <= 4 ? f[1] : f[2]);
const kmTxt = (km: number) => `${km < 10 ? fmt(km, 1) : fmt(km)} km`;

/** Poslední a první rok s hodnotou ukazatele obce. */
export function radaUkazatele(
  file: IndicatorFile | undefined,
  id: string,
  kod: AreaCode,
): { prvni: { rok: number; v: number } | null; posledni: { rok: number; v: number } | null } {
  const byYear = file?.values[id]?.[kod] ?? {};
  const body = Object.entries(byYear)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
    .map(([r, v]) => ({ rok: Number(r), v }))
    .sort((a, b) => a.rok - b.rok);
  return { prvni: body[0] ?? null, posledni: body[body.length - 1] ?? null };
}

/** Průměr kraje (regional) pro rok, když ho soubor má. */
function krajPrumer(file: IndicatorFile | undefined, id: string, rok: number): number | null {
  const v = file?.regional?.[id]?.[rok];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Služby, které karta ukazuje (id požadavků z lib/zivot.ts). */
export const SLUZBY_KARTY = [
  'zastavka',
  'materska-skola',
  'zakladni-skola',
  'lekar',
  'detsky-lekar',
  'zubar',
  'lekarna',
  'pohotovost',
  'zachranka',
] as const;

export interface VstupKarty {
  snap: Snapshot;
  ctx: ZivotKontext;
  kod: AreaCode;
  /** obce → název ORP */
  orpNazev: string;
  /** obory pro žáky ze ZŠ */
  obory: Obor[];
  /** dosah pro školy v km */
  kmSkoly?: number;
}

export function kartaObce({ snap, ctx, kod, orpNazev, obory, kmSkoly = 25 }: VstupKarty): Karta {
  const nazev = ctx.names[kod] ?? kod;
  const stred = ctx.obce[kod] ?? null;
  const file = snap.indicators.obec;
  const shrnuti: string[] = [];
  const sekce: SekceKarty[] = [];

  // --- obyvatelé ---
  const lide: RadekKarty[] = [];
  const oby = radaUkazatele(file, 'obyvatele', kod);
  if (oby.posledni) {
    let veta = '';
    if (oby.prvni && oby.prvni.rok < oby.posledni.rok && oby.prvni.v > 0) {
      const zmena = ((oby.posledni.v - oby.prvni.v) / oby.prvni.v) * 100;
      const smer = Math.abs(zmena) < 0.5 ? 'zůstal skoro stejný' : zmena > 0 ? `vzrostl o ${fmt(zmena, 1)} %` : `klesl o ${fmt(-zmena, 1)} %`;
      veta = `Od roku ${oby.prvni.rok} počet obyvatel ${smer}.`;
      shrnuti.push(`V obci žije ${fmt(oby.posledni.v)} obyvatel (${oby.posledni.rok}); od roku ${oby.prvni.rok} počet ${smer}.`);
    }
    lide.push({ co: `Obyvatelé (${oby.posledni.rok})`, hodnota: fmt(oby.posledni.v), veta });
  }
  for (const [id, co] of [
    ['podil_0_14', 'Děti 0–14 let'],
    ['podil_65', 'Senioři 65+'],
    ['nezamestnanost', 'Podíl nezaměstnaných'],
  ] as const) {
    const r = radaUkazatele(file, id, kod).posledni;
    if (!r) continue;
    const kraj = krajPrumer(file, id, r.rok);
    lide.push({
      co: `${co} (${r.rok})`,
      hodnota: `${fmt(r.v, 1)} %`,
      veta: kraj !== null ? `Průměr kraje je ${fmt(kraj, 1)} %.` : '',
    });
  }
  if (lide.length) sekce.push({ id: 'lide', nadpis: 'Lidé', radky: lide });

  // --- služby ---
  const sluzby: RadekKarty[] = [];
  for (const id of SLUZBY_KARTY) {
    const p = POZADAVKY_BY_ID[id];
    const v = metrika(ctx, id).values[kod];
    if (!p || v === null || v === undefined) continue;
    const s = srovnani(ctx, id, kod);
    const hodnota = kratkaHodnota(id, v);
    sluzby.push({ co: p.label, hodnota, veta: `${vetaPozadavku(ctx, id, kod, v)}${s ? ` To je ${textSrovnani(s)}.` : ''}` });
  }
  if (sluzby.length) sekce.push({ id: 'sluzby', nadpis: 'Služby v dosahu', radky: sluzby });

  // pořadí v „Kde by se mi dobře žilo“ (doporučený výběr)
  const por = poradi(spocitejSkore(ctx, { ...DOPORUCENY_VYBER }), ctx.names);
  const moje = por.find((r) => r.code === kod);
  if (moje) {
    shrnuti.push(
      `Ve srovnání „Kde by se mi dobře žilo“ (zastávka, lékař, základní škola, nezaměstnanost) je obec ${moje.rank}. z ${por.length} obcí kraje.`,
    );
  }

  // --- střední školy ---
  if (stred) {
    const skoly: RadekKarty[] = [];
    const v = filtrujObory(obory, { domov: stred, typ: 'vse', skupina: '', maxKm: kmSkoly });
    const pocetSkol = new Set(v.map((r) => r.obor.izo)).size;
    skoly.push({
      co: `Obory do ${kmSkoly} km`,
      hodnota: fmt(v.length),
      veta: `${fmt(v.length)} ${pl(v.length, ['obor', 'obory', 'oborů'])} na ${pocetSkol} ${pl(pocetSkol, ['škole', 'školách', 'školách'])} pro školní rok 2026/27.`,
    });
    for (const [typ, co] of [
      ['maturita', 'Nejbližší maturitní obor'],
      ['vyucni', 'Nejbližší obor s výučním listem'],
    ] as const) {
      const n = obory
        .filter((o) => o.typ === typ && (o.zamer[2026] ?? 0) > 0)
        .map((o) => ({ o, km: vzdalenostKm(stred.lat, stred.lon, o.lat, o.lon) }))
        .sort((a, b) => a.km - b.km)[0];
      if (n) skoly.push({ co, hodnota: kmTxt(n.km), veta: `${n.o.skola.replace(/,?\s*příspěvková organizace$/i, '')}, ${n.o.obec}.` });
    }
    sekce.push({ id: 'skoly', nadpis: 'Střední školy', radky: skoly });
  }

  // --- peníze a podnikání ---
  const penize: RadekKarty[] = [];
  const vch = vouchery(snap.points['vouchery']?.features ?? []).filter((x) => x.obec === kod);
  const usp = vch.filter((x) => x.uspesna);
  if (vch.length) {
    const suma = usp.reduce((a, x) => a + x.prideleno, 0);
    penize.push({
      co: 'Vouchery kraje pro firmy z obce',
      hodnota: kc(suma),
      veta: `Uspělo ${usp.length} z ${vch.length} ${pl(vch.length, ['žádosti', 'žádostí', 'žádostí'])}.`,
    });
    if (usp.length)
      shrnuti.push(`Firmy z obce získaly od kraje vouchery za ${kc(suma)} (${usp.length} ${pl(usp.length, ['žádost', 'žádosti', 'žádostí'])}).`);
  } else {
    penize.push({ co: 'Vouchery kraje pro firmy z obce', hodnota: '0', veta: 'Žádná firma z obce o voucher zatím nežádala.' });
  }
  const pod = snap.podnikani;
  if (pod) {
    const kre = pod.kreativci.filter((k) => k.obec === nazev).length;
    const inf = pod.infra.filter((i) => i.obec === nazev);
    const zon = pod.zony.filter((z) => z.obec === nazev);
    if (kre) penize.push({ co: 'Kreativci v obci', hodnota: fmt(kre), veta: 'Grafici, fotografové, řemeslníci z Galerie kreativců.' });
    if (inf.length) penize.push({ co: 'Místa pro podnikání', hodnota: fmt(inf.length), veta: inf.map((i) => i.nazev).slice(0, 3).join(', ') + '.' });
    if (zon.length)
      penize.push({
        co: 'Průmyslové zóny',
        hodnota: fmt(zon.length),
        veta: `${zon.filter((z) => z.stav === 'stavajici').length} stávající, ${zon.filter((z) => z.stav === 'zamer').length} v záměru.`,
      });
  }
  sekce.push({ id: 'penize', nadpis: 'Peníze a podnikání', radky: penize });

  // --- úřady ---
  const u = snap.urady?.obce.find((o) => o.kod === kod);
  if (u) {
    const urady: RadekKarty[] = [{ co: 'Obecní úřad', hodnota: '', veta: [u.obecniUrad.nazev, u.obecniUrad.adresa].filter(Boolean).join(', ') }];
    if (u.stavebni.length) urady.push({ co: 'Stavební úřad', hodnota: '', veta: u.stavebni.map((s) => s.nazev).join(', ') });
    if (u.zivnostensky) urady.push({ co: 'Živnostenský úřad', hodnota: '', veta: u.zivnostensky.nazev });
    urady.push({ co: 'Obec s rozšířenou působností', hodnota: '', veta: u.orp });
    sekce.push({ id: 'urady', nadpis: 'Úřady', radky: urady });
  }

  return { kod, nazev, orp: orpNazev, shrnuti, sekce };
}

/** Karta jako řádky CSV (sekce, co, hodnota, věta). */
export function kartaDoRadku(k: Karta): Radek[] {
  return k.sekce.flatMap((s) => s.radky.map((r) => ({ obec: k.nazev, sekce: s.nadpis, ukazatel: r.co, hodnota: r.hodnota, popis: r.veta })));
}
