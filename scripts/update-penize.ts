// `npm run data:penize` – stáhne projekty kraje (aktuální i ukončené) a strategické dokumenty
// z DATAZÁPAD a zapíše public/data/penize/penize.json pro režim „Peníze kraje“.
// Vouchery se berou z existující bodové vrstvy snapshotu (points/vouchery.json).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isManifest, type SourceEntry } from '../src/lib/types.ts';
import { kontrolaProjektu, projektyAktualni, projektyUkoncene, strategie, type PenizeFile } from '../src/lib/penize.ts';
import { fetchDzCsv, parseCsv } from './sources/datazapad.ts';
import { writeSnapshotAtomic } from './pipeline/write.ts';

const OUT = path.resolve('public/data');
const REL = 'penize/penize.json';

const SADY = [
  { id: 'projekty', itemId: '3f9c9a95272e40d1a24e2711515e3d4d', layers: 3, title: 'Aktuální projekty Karlovarského kraje v oblasti rozvoje regionu a územního plánování' },
  { id: 'projekty-ukoncene', itemId: '59e913758bea4217b37caaf525459eeb', layers: 3, title: 'Ukončené projekty Karlovarského kraje v oblasti rozvoje regionu a územního plánování' },
  { id: 'strategie', itemId: '01fcf68eb2054fb3ab99af6aa34af6e4', layers: 0, title: 'Seznam strategických dokumentů Karlovarského kraje' },
] as const;

async function main(): Promise<void> {
  const now = new Date();
  const manifest: unknown = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  if (!isManifest(manifest)) throw new Error('public/data/manifest.json neodpovídá kontraktu');

  const rows: Record<string, Record<string, string>[]> = {};
  for (const s of SADY) {
    rows[s.id] = parseCsv(await fetchDzCsv(s.itemId, s.layers, path.resolve('data-raw/penize'), s.id));
    if (!rows[s.id].length) throw new Error(`${s.id}: žádné řádky`);
  }
  const aktualni = projektyAktualni(rows['projekty']);
  const { projekty: ukoncene, duplicit } = projektyUkoncene(rows['projekty-ukoncene']);
  const chyby = kontrolaProjektu(aktualni, now.toISOString().slice(0, 10));
  if (duplicit) chyby.push(`Ukončené projekty: ${duplicit} řádky jsou duplicitní (stejný projekt uveden dvakrát).`);

  const sources: SourceEntry[] = SADY.map((s) => ({
    id: `dz-penize-${s.id}`,
    provider: 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)',
    title: s.title,
    url: `https://www.datazapad.cz/api/download/v1/items/${s.itemId}/csv?layers=${s.layers}`,
    license: 'CC BY 4.0',
    downloadedAt: now.toISOString(),
    validFor: String(now.getFullYear()),
    status: 'ok',
  }));
  const file: PenizeFile = {
    updatedAt: now.toISOString(),
    sourceIds: sources.map((s) => s.id),
    projekty: [...aktualni, ...ukoncene],
    strategie: strategie(rows['strategie']),
    chybyDat: chyby,
  };
  const ids = new Set(sources.map((s) => s.id));
  manifest.sources = [...manifest.sources.filter((s) => !ids.has(s.id)), ...sources];
  manifest.files.penize = REL;
  await writeSnapshotAtomic(
    OUT,
    new Map([
      [REL, JSON.stringify(file)],
      ['manifest.json', JSON.stringify(manifest, null, 1)],
    ]),
    { remove: [], tmpRoot: path.resolve('data-raw') },
  );
  console.log(`projekty: ${aktualni.length} aktuálních + ${ukoncene.length} ukončených, strategie: ${file.strategie.length} → public/data/${REL}`);
  for (const c of chyby) console.log(`  chyba v datech: ${c}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
