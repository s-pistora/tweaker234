// manifest.json → SOURCES.md (česky): tabulka všech zdrojů + sekce Licence jen pro přítomné poskytovatele.
import type { Manifest, SourceEntry } from '../src/lib/types.ts';

const CSU_TERMS = 'https://csu.gov.cz/podminky_pro_vyuzivani_a_dalsi_zverejnovani_statistickych_udaju_csu';

function cell(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function date(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso || '–';
}

function url(u: string): string {
  return u ? `<${u}>` : '–';
}

function status(s: SourceEntry): string {
  return s.status === 'stale' ? `stale – ${cell(s.note ?? 'zdroj nedostupný, ponechán poslední snapshot')}` : 'ok';
}

const isCsu = (s: SourceEntry) => s.provider.includes('Český statistický úřad');
const isCuzk = (s: SourceEntry) => s.provider.includes('ČÚZK') || s.provider.includes('zeměměřický');
const isKv = (s: SourceEntry) => s.provider.includes('Karlovarský kraj');
const isUzis = (s: SourceEntry) => s.provider.includes('ÚZIS');

export function renderSourcesMd(manifest: Manifest): string {
  const lines: string[] = [];
  lines.push('# Zdroje dat');
  lines.push('');
  lines.push(
    `Soubor je generovaný příkazem \`npm run data:update\` z \`public/data/manifest.json\` ` +
      `(poslední běh: ${manifest.updatedAt}). Neupravujte ručně.`,
  );
  lines.push('');
  lines.push('| Poskytovatel | Datová sada | URL | Licence | Staženo | Platnost | Stav |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const s of manifest.sources) {
    lines.push(
      `| ${cell(s.provider)} | ${cell(s.title)} | ${url(s.url)} | ${cell(s.license)} | ${date(s.downloadedAt)} | ` +
        `${cell(s.validFor) || '–'} | ${status(s)} |`,
    );
  }

  const notes = manifest.sources.filter((s) => s.note && s.status === 'ok');
  if (notes.length) {
    lines.push('');
    lines.push('### Poznámky ke zdrojům');
    lines.push('');
    for (const s of notes) lines.push(`- **${cell(s.title)}** (\`${s.id}\`): ${s.note!.replace(/\r?\n/g, ' ')}`);
  }

  lines.push('');
  lines.push('## Licence');
  lines.push('');
  if (manifest.sources.some(isCsu)) {
    lines.push(
      `- Data Českého statistického úřadu (ČSÚ): CC BY 4.0, podmínky užití: <${CSU_TERMS}>. Zdroj: Český statistický úřad.`,
    );
  }
  if (manifest.sources.some(isCuzk)) {
    lines.push('- Hranice území (RÚIAN): © ČÚZK, CC BY 4.0.');
  }
  const kv = manifest.sources.filter(isKv);
  if (kv.length) {
    lines.push('- Hodnoty z Karlovarského kraje: CC0/CC BY 4.0 (podle datové sady, portál datazapad.cz):');
    for (const s of kv) lines.push(`  - ${cell(s.title)}: ${s.license}`);
  }
  for (const s of manifest.sources.filter(isUzis)) {
    lines.push(`- ${cell(s.provider)}: licence dle poskytovatele – „${s.license}“.`);
  }
  const other = manifest.sources.filter((s) => !isCsu(s) && !isCuzk(s) && !isKv(s) && !isUzis(s));
  for (const s of other) lines.push(`- ${cell(s.provider)} – ${cell(s.title)}: ${s.license}`);
  lines.push('');
  return lines.join('\n');
}
