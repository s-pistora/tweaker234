// „Bílá místa“: kde mají lidé ke službě (lékař, škola, lékárna…) nejdál a kam by nová služba
// pomohla nejvíc lidem. Čisté funkce nad kontextem „Kde by se mi dobře žilo“ (lib/zivot.ts).
//
// Vzdálenost = vzdušnou čarou od středu obce k nejbližšímu bodu služby. Obyvatelé obce se
// počítají celí do středu obce – jde o hrubý odhad pro plánování, ne o přesnou dostupnost.

import type { AreaCode } from './types.ts';
import { vzdalenostKm } from './skoly.ts';
import { POZADAVKY, metrika, type ZivotKontext } from './zivot.ts';
import { radaUkazatele } from './karta.ts';

export interface Sluzba {
  id: string;
  label: string;
  /** „ordinace praktického lékaře“ – do vět */
  co: string;
}

/** Služby s měřením „nejbližší bod“ – ty dávají smysl pro hledání bílých míst. */
export const SLUZBY: Sluzba[] = POZADAVKY.flatMap((p) =>
  p.metrika.druh === 'nejblizsi' ? [{ id: p.id, label: p.label, co: p.metrika.co }] : [],
);

export interface ObecPokryti {
  kod: AreaCode;
  nazev: string;
  /** km k nejbližší službě (null = bez údaje) */
  km: number | null;
  obyvatel: number;
}

export interface Pokryti {
  obce: ObecPokryti[];
  /** obyvatel v obcích dál než hranice */
  mimo: number;
  mimoObci: number;
  /** obyvatel kraje s údajem */
  celkem: number;
}

/** Počet obyvatel obce v posledním roce s daty (0, když chybí). */
export function obyvateleObci(ctx: ZivotKontext): Record<AreaCode, number> {
  const out: Record<AreaCode, number> = {};
  for (const kod of Object.keys(ctx.obce)) out[kod] = radaUkazatele(ctx.snap.indicators.obec, 'obyvatele', kod).posledni?.v ?? 0;
  return out;
}

/** Jak daleko to mají lidé ke službě; obce seřazené od nejvzdálenější. */
export function pokryti(ctx: ZivotKontext, sluzba: string, km: number): Pokryti {
  const vals = metrika(ctx, sluzba).values;
  const oby = obyvateleObci(ctx);
  const obce: ObecPokryti[] = Object.keys(ctx.obce)
    .filter((kod) => !ctx.neobydlene.has(kod))
    .map((kod) => ({ kod, nazev: ctx.names[kod] ?? kod, km: vals[kod] ?? null, obyvatel: oby[kod] ?? 0 }))
    .sort((a, b) => (b.km ?? -1) - (a.km ?? -1) || b.obyvatel - a.obyvatel);
  let mimo = 0;
  let mimoObci = 0;
  let celkem = 0;
  for (const o of obce) {
    if (o.km === null) continue;
    celkem += o.obyvatel;
    if (o.km > km) {
      mimo += o.obyvatel;
      mimoObci++;
    }
  }
  return { obce, mimo, mimoObci, celkem };
}

export interface Navrh {
  /** obec, kde by nová služba byla */
  kod: AreaCode;
  nazev: string;
  /** kolik lidí by se dostalo pod hranici km */
  pomuze: number;
  /** obce, kterým by pomohla (názvy) */
  obce: string[];
}

/**
 * Hladový výběr `n` obcí pro novou službu: v každém kroku obec, jejíž střed by přiblížil
 * pod hranici `km` nejvíc dosud „nepokrytých“ obyvatel. Další krok už počítá s předchozí
 * novou službou. Kandidáti = středy obydlených obcí.
 */
export function nejlepsiMista(ctx: ZivotKontext, sluzba: string, km: number, n = 3): Navrh[] {
  const p = pokryti(ctx, sluzba, km);
  const d = new Map(p.obce.filter((o) => o.km !== null).map((o) => [o.kod, o.km as number]));
  const oby = new Map(p.obce.map((o) => [o.kod, o.obyvatel]));
  const kandidati = [...d.keys()];
  const out: Navrh[] = [];
  for (let krok = 0; krok < n; krok++) {
    let best: Navrh | null = null;
    for (const c of kandidati) {
      const cc = ctx.obce[c];
      if (!cc) continue;
      let pomuze = 0;
      const obce: string[] = [];
      for (const [o, dist] of d) {
        if (dist <= km) continue;
        const oc = ctx.obce[o];
        if (oc && vzdalenostKm(cc.lat, cc.lon, oc.lat, oc.lon) <= km) {
          pomuze += oby.get(o) ?? 0;
          obce.push(ctx.names[o] ?? o);
        }
      }
      if (pomuze > 0 && (!best || pomuze > best.pomuze)) best = { kod: c, nazev: ctx.names[c] ?? c, pomuze, obce };
    }
    if (!best) break;
    out.push(best);
    const bc = ctx.obce[best.kod];
    for (const [o, dist] of d) {
      const oc = ctx.obce[o];
      if (oc) d.set(o, Math.min(dist, vzdalenostKm(bc.lat, bc.lon, oc.lat, oc.lon)));
    }
  }
  return out;
}
