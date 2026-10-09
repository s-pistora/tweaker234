// Drill-down stav (čisté funkce).
//
// Schéma: AppState.level = úroveň, kterou mapa ZOBRAZUJE; AppState.area = vybrané území
// NA TÉTO úrovni (nebo null). Na úrovni 'obec' mapa ukazuje obce jednoho ORP – to ORP
// je `parent` vybrané obce (z geodat), a když obec vybraná není, drží se v lokálním
// stavu komponenty (`orp`). URL tak zůstává ve formátu state.ts (#/obec/<kód obce>).
// Hash `#/obec` bez obce a bez lokálního ORP (např. reload) spadne na mapu ORP.
import type { AreaCode, Level } from '../types.ts';

export const KV: AreaCode = 'CZ041';

export interface View {
  level: Level;
  area: AreaCode | null;
  /** ORP, jehož obce se zobrazují (jen pro level 'obec') */
  orp: AreaCode | null;
}

export function selectArea(view: View, code: AreaCode): View {
  if (view.level === 'kraj') {
    return code === KV ? { level: 'orp', area: null, orp: null } : { level: 'kraj', area: code, orp: null };
  }
  if (view.level === 'orp') return { level: 'obec', area: null, orp: code };
  return { level: 'obec', area: code, orp: view.orp };
}

/**
 * Esc / [↑ ÚROVEŇ VÝŠ]. null = už není kam. Aplikace ukazuje jen Karlovarský kraj:
 * nejvyšší úrovní je mapa jeho 7 ORP (mapa krajů ČR se v UI nenabízí).
 */
export function levelUp(view: View): View | null {
  if (view.level === 'obec') return { level: 'orp', area: view.orp, orp: null };
  if (view.level === 'orp') return view.area !== null ? { level: 'orp', area: null, orp: null } : null;
  return { level: 'orp', area: null, orp: null };
}

export function resolveView(
  level: Level,
  area: AreaCode | null,
  localOrp: AreaCode | null,
  parentOf: (obec: AreaCode) => AreaCode | null,
): View {
  if (level !== 'obec') return { level, area, orp: null };
  const orp = (area ? parentOf(area) : null) ?? localOrp;
  if (!orp) return { level: 'orp', area: null, orp: null };
  return { level: 'obec', area, orp };
}

/** Co ukázat v Detailu: vybrané území, jinak kontext (ORP u obcí, KV u ORP). */
export function detailTarget(view: View): { level: Level; code: AreaCode } | null {
  if (view.area) return { level: view.level, code: view.area };
  if (view.level === 'obec' && view.orp) return { level: 'orp', code: view.orp };
  if (view.level === 'orp') return { level: 'kraj', code: KV };
  return null;
}
