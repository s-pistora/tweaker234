// `npm run data:urady` – stáhne úřady z DATAZÁPAD (stavební podle katastrálních území, obecní
// živnostenské, matriční, seznam obcí) a zapíše public/data/urady/urady.json pro režim „Úřady“.
// Stejně jako data:skoly jen doplní existující snapshot (manifest: files.urady + zdroje).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isManifest, type SourceEntry } from '../src/lib/types.ts';
import {
  matriky,
  obecniUrady,
  slozUrady,
  stavebniPodleObci,
  zivnostenskeRadky,
  type UradyFile,
} from '../src/lib/urady.ts';
import { fetchDzCsv, parseCsv } from './sources/datazapad.ts';
import { writeSnapshotAtomic } from './pipeline/write.ts';

const OUT = path.resolve('public/data');
const REL = 'urady/urady.json';

const SADY = [
  { id: 'stavebni', itemId: '57a4ac11b4014df7803496c91408ec4e', layers: 0, title: 'Stavební úřady v Karlovarském kraji dle katastrálních území' },
  { id: 'zivnostenske', itemId: 'd27fb764c5a642e2bf2f8c134cbdeca2', layers: 3, title: 'Obecní živnostenské úřady Karlovarského kraje dle územní příslušnosti obcí' },
  { id: 'matriky', itemId: '0fbcd94c27344fef86d2dafde1230761', layers: 0, title: 'Matriční úřady Karlovarského kraje' },
  { id: 'obce', itemId: '17a673b7147d45ba8744904cae6afdbb', layers: 0, title: 'Seznam obcí Karlovarského kraje' },
] as const;

async function main(): Promise<void> {
  const now = new Date();
  const manifest: unknown = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  if (!isManifest(manifest)) throw new Error('public/data/manifest.json neodpovídá kontraktu');

  const rows: Record<string, Record<string, string>[]> = {};
  for (const s of SADY) {
    rows[s.id] = parseCsv(await fetchDzCsv(s.itemId, s.layers, path.resolve('data-raw/urady'), s.id));
    if (!rows[s.id].length) throw new Error(`${s.id}: žádné řádky`);
  }

  const { obce, chyby } = slozUrady(obecniUrady(rows.obce), stavebniPodleObci(rows.stavebni), zivnostenskeRadky(rows.zivnostenske));
  const sources: SourceEntry[] = SADY.map((s) => ({
    id: `dz-urady-${s.id}`,
    provider: 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)',
    title: s.title,
    url: `https://www.datazapad.cz/api/download/v1/items/${s.itemId}/csv?layers=${s.layers}`,
    license: 'CC0 1.0',
    downloadedAt: now.toISOString(),
    validFor: String(now.getFullYear()),
    status: 'ok',
  }));
  const file: UradyFile = { updatedAt: now.toISOString(), sourceIds: sources.map((s) => s.id), obce, matriky: matriky(rows.matriky), chybyDat: chyby };

  const ids = new Set(sources.map((s) => s.id));
  manifest.sources = [...manifest.sources.filter((s) => !ids.has(s.id)), ...sources];
  manifest.files.urady = REL;
  await writeSnapshotAtomic(
    OUT,
    new Map([
      [REL, JSON.stringify(file)],
      ['manifest.json', JSON.stringify(manifest, null, 1)],
    ]),
    { remove: [], tmpRoot: path.resolve('data-raw') },
  );
  const bezStav = obce.filter((o) => !o.stavebni.length).map((o) => o.nazev);
  const bezZivno = obce.filter((o) => !o.zivnostensky).map((o) => o.nazev);
  console.log(`obce: ${obce.length}, matriky: ${file.matriky.length} → public/data/${REL}`);
  console.log(`bez stavebního úřadu: ${bezStav.length ? bezStav.join(', ') : '0'}; bez živnostenského: ${bezZivno.length ? bezZivno.join(', ') : '0'}`);
  for (const c of chyby) console.log(`  chyba v datech: ${c}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
