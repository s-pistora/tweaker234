// Export seznamů do CSV (UTF-8 s BOM kvůli Excelu, středník jako oddělovač – český Excel).

export type Radek = Record<string, string | number | boolean | null | undefined>;

function bunka(v: Radek[string]): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Řádky → text CSV; sloupce v pořadí prvního výskytu. */
export function doCsv(radky: Radek[]): string {
  const sloupce: string[] = [];
  for (const r of radky) for (const k of Object.keys(r)) if (!sloupce.includes(k)) sloupce.push(k);
  const out = [sloupce.map((c) => bunka(c)).join(';')];
  for (const r of radky) out.push(sloupce.map((c) => bunka(r[c])).join(';'));
  return '﻿' + out.join('\r\n') + '\r\n';
}

/** „Úřady – Karlovy Vary“ → „urady-karlovy-vary“ */
export function nazevSouboru(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'data'
  );
}

/** Nabídne prohlížeči soubor ke stažení; vrací false, když to prostředí neumí. */
export function stahni(nazev: string, radky: Radek[]): boolean {
  try {
    if (typeof URL.createObjectURL !== 'function') return false;
    const blob = new Blob([doCsv(radky)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nazevSouboru(nazev)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
