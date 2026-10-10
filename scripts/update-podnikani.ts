// `npm run data:podnikani` – stáhne Galerii kreativců, inovační infrastrukturu a průmyslové zóny
// z DATAZÁPAD a zapíše public/data/podnikani/podnikani.json pro režim „Podnikání“.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isManifest, type SourceEntry } from '../src/lib/types.ts';
import { infra, kontrola, kreativci, zony, type PodnikaniFile } from '../src/lib/podnikani.ts';
import { fetchDzCsv, parseCsv } from './sources/datazapad.ts';
import { writeSnapshotAtomic } from './pipeline/write.ts';

const OUT = path.resolve('public/data');
const REL = 'podnikani/podnikani.json';

const SADY = [
  { id: 'kreativci', itemId: '5ad57de2f5ea4f4483fd123f48beee47', layers: 0, title: 'Galerie kreativců Karlovarského kraje', license: 'CC BY 4.0' },
  { id: 'infra', itemId: 'f98f8248cdf140ad84649976f2d6f499', layers: 3, title: 'Inovační infrastruktury Karlovarského kraje', license: 'CC BY 4.0' },
  { id: 'zony', itemId: '6fb15a0f28fe41d083ac150dc7405171', layers: 0, title: 'Průmyslové zóny a parky v Karlovarském kraji', license: 'CC0 1.0' },
] as const;

async function main(): Promise<void> {
  const now = new Date();
  const manifest: unknown = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  if (!isManifest(manifest)) throw new Error('public/data/manifest.json neodpovídá kontraktu');

  const rows: Record<string, Record<string, string>[]> = {};
  for (const s of SADY) {
    rows[s.id] = parseCsv(await fetchDzCsv(s.itemId, s.layers, path.resolve('data-raw/podnikani'), s.id));
    if (!rows[s.id].length) throw new Error(`${s.id}: žádné řádky`);
  }
  const k = kreativci(rows['kreativci']);
  const { infra: inf, duplicit } = infra(rows['infra']);
  const z = zony(rows['zony']);
  const sources: SourceEntry[] = SADY.map((s) => ({
    id: `dz-podnikani-${s.id}`,
    provider: 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)',
    title: s.title,
    url: `https://www.datazapad.cz/api/download/v1/items/${s.itemId}/csv?layers=${s.layers}`,
    license: s.license,
    downloadedAt: now.toISOString(),
    validFor: String(now.getFullYear()),
    status: 'ok',
  }));
  const file: PodnikaniFile = {
    updatedAt: now.toISOString(),
    sourceIds: sources.map((s) => s.id),
    kreativci: k,
    infra: inf,
    zony: z,
    chybyDat: kontrola(k, duplicit, z),
  };
  const ids = new Set(sources.map((s) => s.id));
  manifest.sources = [...manifest.sources.filter((s) => !ids.has(s.id)), ...sources];
  manifest.files.podnikani = REL;
  await writeSnapshotAtomic(
    OUT,
    new Map([
      [REL, JSON.stringify(file)],
      ['manifest.json', JSON.stringify(manifest, null, 1)],
    ]),
    { remove: [], tmpRoot: path.resolve('data-raw') },
  );
  console.log(`kreativci: ${k.length}, infrastruktura: ${inf.length}, zóny: ${z.length} → public/data/${REL}`);
  for (const c of file.chybyDat) console.log(`  chyba v datech: ${c}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
