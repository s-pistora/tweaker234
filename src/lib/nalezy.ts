// Stránka „Co jsme našli v datech kraje“ – zpětná vazba pro DATAZÁPAD.
// Statické nálezy (zjištěné při zpracování, aplikace je řeší v kódu) + automatické kontroly,
// které datové skripty ukládají do `chybyDat` (úřady, peníze, podnikání).

export type Zavaznost = 'chyba' | 'nesoulad' | 'chybi';

export interface Nalez {
  sada: string;
  co: string;
  /** jak s tím aplikace naložila */
  reseni: string;
  zavaznost: Zavaznost;
}

export const ZAVAZNOST: Record<Zavaznost, { nazev: string; popis: string }> = {
  chyba: { nazev: 'Chyba v datech', popis: 'údaj je špatně a vede k chybným výsledkům' },
  nesoulad: { nazev: 'Nejednotný formát', popis: 'stejná věc zapsaná různě – data jde použít jen s úpravou' },
  chybi: { nazev: 'Chybí v datech', popis: 'údaj, který by aplikace potřebovala, se nezveřejňuje' },
};

export const STATICKE_NALEZY: Nalez[] = [
  {
    sada: 'Záměr počtu přijímaných uchazečů SŠ (2024/25–2026/27)',
    co: 'Každý ročník má jiné názvy sloupců (např. „IZO ředitelství“ × „Identifikační znak organizace“), v ročníku 2025/26 je překlep „Froma vzdělávání“ a záhlaví souřadnic má koncovou mezeru.',
    reseni: 'Mapování sloupců zvlášť pro každý ročník.',
    zavaznost: 'nesoulad',
  },
  {
    sada: 'Záměr počtu přijímaných uchazečů SŠ',
    co: 'Kód oboru „23-68/H/01“ je zapsaný s lomítkem místo pomlčky, takže se ročníky nedají spojit.',
    reseni: 'Kód opravujeme na „23-68-H/01“.',
    zavaznost: 'chyba',
  },
  {
    sada: 'Záměr počtu přijímaných uchazečů SŠ',
    co: 'Sada „středních škol“ obsahuje i vyšší odborné školy, nástavby a dálkové studium – pro deváťáky nerelevantní a zkreslují součty.',
    reseni: 'Pro žáky ze ZŠ je vyřazujeme z výběru i ze součtů.',
    zavaznost: 'nesoulad',
  },
  {
    sada: 'Záměr počtu přijímaných uchazečů SŠ',
    co: 'Názvy oborů obsahují zdvojené uvozovky (Gymnázium (""Vzdělání je kompasem života"")).',
    reseni: 'Uvozovky čistíme na české „…“.',
    zavaznost: 'nesoulad',
  },
  {
    sada: 'Datové sady s bodovou geometrií (CSV)',
    co: 'Ve sloupci „Zápis vektorové geometrie“ (WKT) jsou prohozené zeměpisná šířka a délka.',
    reseni: 'Souřadnice bereme jen ze samostatných sloupců WGS84.',
    zavaznost: 'chyba',
  },
  {
    sada: 'Výjezdové základny zdravotnické záchranné služby',
    co: 'Sada nemá kódy obcí ani ORP a kraj je uveden textem, ne kódem.',
    reseni: 'Základny přiřazujeme obcím podle polohy.',
    zavaznost: 'nesoulad',
  },
  {
    sada: 'Památky (UNESCO, NKP, náboženské…)',
    co: 'Stejné místo je ve více sadách (např. klášter Teplá je NKP i církevní památka) bez společného identifikátoru.',
    reseni: 'Slučujeme podle názvu a obce do jednoho místa se všemi štítky.',
    zavaznost: 'nesoulad',
  },
  {
    sada: 'Dobroty Karlovarského kraje',
    co: 'Řádek = oceněný výrobek, výrobce se opakuje (156 řádků, 39 výrobců) bez identifikátoru výrobce.',
    reseni: 'Slučujeme podle výrobce a obce.',
    zavaznost: 'nesoulad',
  },
  {
    sada: 'Matriční úřady',
    co: 'Chybí matriční obvody (pod kterou matriku obec patří) a názvy úřadů jsou jen „Městský Úřad“ bez obce.',
    reseni: 'Ukazujeme matriku v obci nebo nejbližší s upozorněním, názvy doplňujeme o obec.',
    zavaznost: 'chybi',
  },
  {
    sada: 'Doprava',
    co: 'Kraj zveřejňuje polohu autobusových zastávek, ale ne jízdní řády.',
    reseni: 'Vzdálenosti počítáme vzdušnou čarou, u škol ukazujeme zastávky do 500 m.',
    zavaznost: 'chybi',
  },
  {
    sada: 'Volný čas',
    co: 'V katalogu nejsou kulturní akce (kalendář) ani turistické a cyklistické trasy.',
    reseni: 'Kategorie „Akce“ a „Turistické stezky“ jsme proto nahradili místy (divadla, kina, kulturní domy).',
    zavaznost: 'chybi',
  },
];

export interface NalezySouhrn {
  celkem: number;
  podle: Record<Zavaznost, number>;
}

export function souhrnNalezu(n: Nalez[]): NalezySouhrn {
  const podle: Record<Zavaznost, number> = { chyba: 0, nesoulad: 0, chybi: 0 };
  for (const x of n) podle[x.zavaznost]++;
  return { celkem: n.length, podle };
}

/** Automatické kontroly ze skriptů → nálezy (sada podle prefixu „Sada: …“). */
export function zAutomatickychKontrol(chyby: string[], vychoziSada: string): Nalez[] {
  return chyby.map((c) => {
    const m = /^([^:]{3,60}):\s*(.*)$/.exec(c);
    const raw = m ? m[2] : c;
    const co = raw.charAt(0).toUpperCase() + raw.slice(1);
    return {
      sada: m ? m[1] : vychoziSada,
      co,
      reseni: 'Aplikace údaj opravuje nebo zobrazuje s upozorněním.',
      zavaznost: /chybí|nemá/i.test(co) ? 'chybi' : /neexistující|duplicit|stále mezi aktuálními|2×/i.test(co) ? 'chyba' : 'nesoulad',
    };
  });
}

/** Report pro správce katalogu (DATAZÁPAD) v Markdownu – nálezy seskupené podle datové sady. */
export function nalezyDoMarkdown(n: Nalez[], datum: string): string {
  const podleSady = new Map<string, Nalez[]>();
  for (const x of n) podleSady.set(x.sada, [...(podleSady.get(x.sada) ?? []), x]);
  const s = souhrnNalezu(n);
  const out = [
    '# Nálezy v otevřených datech Karlovarského kraje',
    '',
    `Stav ke dni ${datum}. Celkem ${s.celkem} nálezů: ${s.podle.chyba}× ${ZAVAZNOST.chyba.nazev.toLowerCase()}, ${s.podle.nesoulad}× ${ZAVAZNOST.nesoulad.nazev.toLowerCase()}, ${s.podle.chybi}× ${ZAVAZNOST.chybi.nazev.toLowerCase()}.`,
  ];
  for (const [sada, xs] of podleSady) {
    out.push('', `## ${sada}`, '');
    for (const x of xs) out.push(`- **${ZAVAZNOST[x.zavaznost].nazev}:** ${x.co}`, `  - *Jak jsme to vyřešili:* ${x.reseni}`);
  }
  return out.join('\n') + '\n';
}
