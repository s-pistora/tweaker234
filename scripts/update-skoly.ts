// `npm run data:skoly` – stáhne záměry přijímání SŠ (3 roky) a zapíše public/data/skoly/obory.json.
// Záměrně samostatně vedle `data:update`: nespouští pomalé zdroje ČSÚ/ČÚZK a stávající snapshot
// jen doplní (manifest: files.skoly + 3 zdroje). Zastávky bere z už existující vrstvy snapshotu.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isManifest, isPointLayer, type OboryFile } from '../src/lib/types.ts';
import { ROKY, doplnZastavky, slucRoky, stahniRoky, zdrojRoku } from './sources/dz-prijimani.ts';
import { writeSnapshotAtomic } from './pipeline/write.ts';

const OUT = path.resolve('public/data');
const REL = 'skoly/obory.json';

async function main(): Promise<void> {
  const now = new Date();
  const manifest: unknown = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  if (!isManifest(manifest)) throw new Error('public/data/manifest.json neodpovídá kontraktu');

  const zRel = manifest.files.points['zastavky'];
  const zastavky: unknown = zRel ? JSON.parse(await readFile(path.join(OUT, zRel), 'utf8')) : null;
  if (!isPointLayer(zastavky)) throw new Error('chybí vrstva zastávek – spusť nejdřív npm run data:update');

  const obory = slucRoky(await stahniRoky(path.resolve('data-raw/dz-prijimani')));
  doplnZastavky(obory, zastavky.features);
  obory.sort((a, b) => a.skola.localeCompare(b.skola, 'cs') || a.nazevOboru.localeCompare(b.nazevOboru, 'cs'));

  const sources = ROKY.map((c) => zdrojRoku(c, now));
  const file: OboryFile = { updatedAt: now.toISOString(), sourceIds: sources.map((s) => s.id), obory };
  const ids = new Set(sources.map((s) => s.id));
  manifest.sources = [...manifest.sources.filter((s) => !ids.has(s.id)), ...sources];
  manifest.files.skoly = REL;

  await writeSnapshotAtomic(
    OUT,
    new Map([
      [REL, JSON.stringify(file)],
      ['manifest.json', JSON.stringify(manifest, null, 1)],
    ]),
    { remove: [], tmpRoot: path.resolve('data-raw') },
  );

  const s = new Set(obory.map((o) => o.izo)).size;
  const sPrijatymi = obory.filter((o) => o.prijato2025 !== null).length;
  console.log(`obory: ${obory.length} (škol ${s}, s údajem o přijatých ${sPrijatymi}) → public/data/${REL}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
