// Převodník kódů RÚIAN ↔ ČSÚ pro kraj (NUTS3), ORP a obec z číselníků ČSÚ (apl2.czso.cz/iSMS).
// Zdroje (ověřeno 2026-09-27, viz docs/superpowers/specs/2026-09-27-kraj-term-design.md):
//   cis65  – CISORP (ORP): sloupce chodnota=ČSÚ kód ORP, kod_ruian=RÚIAN kód ORP
//   cis100 – KRAJ_NUTS (kraj): sloupce cznuts=NUTS3, kod_ruian=RÚIAN kód kraje
//   vazba43_65 – vazba obec→ORP (kodcis1=43 CISOB, kodcis2=65 CISORP): chodnota1=kód obce, chodnota2=ČSÚ kód ORP
import Papa from 'papaparse';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CIS65_URL =
  'https://apl2.czso.cz/iSMS/do_cis_export?kodcis=65&typdat=0&cisjaz=203&format=2&separator=%2C';
const CIS100_URL =
  'https://apl2.czso.cz/iSMS/do_cis_export?kodcis=100&typdat=0&cisjaz=203&format=2&separator=%2C';
const VAZBA_URL =
  'https://apl2.czso.cz/iSMS/do_cis_export?kodcis=43&typdat=1&cisvaz=65_1182&cisjaz=203&format=2&separator=%2C';

/** ČSÚ kódy 7 ORP Karlovarského kraje (Aš, Cheb, Karlovy Vary, Kraslice, Mariánské Lázně, Ostrov, Sokolov). */
export const KV_ORP = ['4101', '4102', '4103', '4104', '4105', '4106', '4107'];

export interface Codes {
  /** RÚIAN kód kraje (např. '51') → NUTS3 (např. 'CZ041'). Vyhodí chybu pro neznámý kód. */
  krajRuianToNuts(k: string): string;
  /** RÚIAN kód ORP (např. '531') → ČSÚ kód ORP (např. '4103'). Vyhodí chybu pro neznámý kód. */
  orpRuianToCsu(k: string): string;
  /** ČSÚ kód obce → ČSÚ kód ORP, nebo undefined pokud obec není v číselníku. */
  orpOfObec(obec: string): string | undefined;
  /** ČSÚ kódy obcí patřících pod dané ORP. */
  obceOfOrp(orp: string): string[];
  /** ČSÚ kódy 7 ORP Karlovarského kraje. */
  kvOrp: string[];
}

async function fetchCached(url: string, rawDir: string, filename: string): Promise<string> {
  const filePath = path.join(rawDir, filename);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const text = await res.text();
    await mkdir(rawDir, { recursive: true });
    await writeFile(filePath, text, 'utf8');
    return text;
  } catch (err) {
    try {
      return await readFile(filePath, 'utf8');
    } catch {
      throw err;
    }
  }
}

interface CsvRow {
  [key: string]: string;
}

function parseCsv(text: string): CsvRow[] {
  // ČSÚ servery vrací CRLF nekonzistentně kombinované s LF, což mate Papaparse
  // autodetekci konce řádku uvnitř quotovaných polí (viz InvalidQuotes). Normalizace na LF.
  const normalized = text.replace(/\r\n?/g, '\n');
  const parsed = Papa.parse<CsvRow>(normalized, { header: true, skipEmptyLines: true });
  return parsed.data;
}

/** Sestaví Codes z již stažených textů číselníků (pro testy nad fixture úryvky i pro loadCodes). */
export function buildCodes(cis65Text: string, cis100Text: string, vazbaText: string): Codes {
  const orpRuianToCsuMap = new Map<string, string>();
  for (const row of parseCsv(cis65Text)) {
    if (row.kod_ruian && row.chodnota) orpRuianToCsuMap.set(row.kod_ruian, row.chodnota);
  }

  const krajRuianToNutsMap = new Map<string, string>();
  for (const row of parseCsv(cis100Text)) {
    if (row.kod_ruian && row.cznuts) krajRuianToNutsMap.set(row.kod_ruian, row.cznuts);
  }

  const obecToOrp = new Map<string, string>();
  const orpToObce = new Map<string, string[]>();
  for (const row of parseCsv(vazbaText)) {
    if (row.akrcis2 !== 'CISORP' || !row.chodnota1 || !row.chodnota2) continue;
    obecToOrp.set(row.chodnota1, row.chodnota2);
    const arr = orpToObce.get(row.chodnota2);
    if (arr) arr.push(row.chodnota1);
    else orpToObce.set(row.chodnota2, [row.chodnota1]);
  }

  return {
    krajRuianToNuts(k: string): string {
      const v = krajRuianToNutsMap.get(k);
      if (!v) throw new Error(`Neznámý RÚIAN kód kraje: ${k}`);
      return v;
    },
    orpRuianToCsu(k: string): string {
      const v = orpRuianToCsuMap.get(k);
      if (!v) throw new Error(`Neznámý RÚIAN kód ORP: ${k}`);
      return v;
    },
    orpOfObec(obec: string): string | undefined {
      return obecToOrp.get(obec);
    },
    obceOfOrp(orp: string): string[] {
      return orpToObce.get(orp) ?? [];
    },
    kvOrp: KV_ORP,
  };
}

/**
 * Stáhne (s cache v rawDir) číselníky ČSÚ a sestaví převodník kódů.
 *
 * POZOR: `apl2.czso.cz/iSMS/do_cis_export` je zjevně starší CGI skript, který při
 * souběžných požadavcích (Promise.all) vrací všem třem voláním stejnou (chybnou,
 * zkrácenou) odpověď – ověřeno opakovaně 2026-09-27. Proto se stahuje SEKVENČNĚ.
 */
export async function loadCodes(rawDir: string): Promise<Codes> {
  const cis65Text = await fetchCached(CIS65_URL, rawDir, 'cis65.csv');
  const cis100Text = await fetchCached(CIS100_URL, rawDir, 'cis100.csv');
  const vazbaText = await fetchCached(VAZBA_URL, rawDir, 'vazba43_65.csv');
  return buildCodes(cis65Text, cis100Text, vazbaText);
}
