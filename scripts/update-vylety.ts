// `npm run data:vylety` – stáhne místa pro volný čas (datazapad.cz) a kvalitu vody na koupacích
// místech (khskv.cz) a zapíše public/data/vylety/mista.json. Stejně jako `data:skoly` jen doplní
// existující snapshot (manifest: files.vylety + zdroje). Sada, která nejde stáhnout, ponechá
// v souboru svá poslední místa a v manifestu stav `stale`.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isManifest, isMistaFile, type Misto, type MistaFile, type SourceEntry } from '../src/lib/types.ts';
import { SADY, sloucitDuplicity, stahniSadu } from './sources/dz-vylety.ts';
import { stahniHodnoceni } from './sources/khs-koupani.ts';
import { writeFileAtomic, writeSnapshotAtomic } from './pipeline/write.ts';
import { renderSourcesMd } from './sources-md.ts';

const OUT = path.resolve('public/data');
const REL = 'vylety/mista.json';

const KHS: SourceEntry = {
  id: 'khs-koupani',
  provider: 'Krajská hygienická stanice Karlovarského kraje (khskv.cz)',
  title: 'Kontrola kvality vody ke koupání – poslední hodnocení (výtah z webových stránek koupacích míst)',
  url: 'https://www.khskv.cz/',
  license: 'neuvedeno poskytovatelem',
  downloadedAt: '',
  validFor: '',
  status: 'ok',
};

async function main(): Promise<void> {
  const now = new Date();
  const manifest: unknown = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  if (!isManifest(manifest)) throw new Error('public/data/manifest.json neodpovídá kontraktu');

  let prev: MistaFile | null = null;
  if (manifest.files.vylety) {
    try {
      const j: unknown = JSON.parse(await readFile(path.join(OUT, manifest.files.vylety), 'utf8'));
      if (isMistaFile(j)) prev = j;
    } catch {
      /* první běh */
    }
  }
  const prevSources = new Map(manifest.sources.map((s) => [s.id, s]));

  const mista: Misto[] = [];
  const sources: SourceEntry[] = [];
  for (const cfg of SADY) {
    const id = `dz-${cfg.slug}`;
    try {
      const r = await stahniSadu(cfg, now);
      mista.push(...r.mista);
      sources.push(r.source);
      console.log(`  ${r.mista.length.toString().padStart(4)}  ${cfg.title}`);
    } catch (e) {
      const old = prev?.mista.filter((m) => m.sourceId === id) ?? [];
      const oldSrc = prevSources.get(id);
      if (!old.length || !oldSrc) throw new Error(`${cfg.slug}: ${(e as Error).message} (a není předchozí verze)`);
      mista.push(...old);
      sources.push({ ...oldSrc, status: 'stale' });
      console.warn(`  STALE ${cfg.title}: ${(e as Error).message}`);
    }
  }

  // kvalita vody: výtah ze stránek KHS
  let sOk = 0;
  for (const m of mista.filter((x) => x.kat === 'koupani')) {
    if (!m.web || !/khskv\.cz/.test(m.web)) continue;
    const h = await stahniHodnoceni(m.web);
    m.voda = { ...h, zdroj: m.web };
    if (h.trida !== 'na') sOk++;
  }
  const rokVody = mista.find((m) => m.voda?.datum)?.voda?.datum?.slice(0, 4) ?? String(now.getFullYear());
  sources.push({ ...KHS, downloadedAt: now.toISOString(), validFor: `koupací sezóna ${rokVody}`, status: sOk ? 'ok' : 'stale' });
  console.log(`  kvalita vody: ${sOk} koupacích míst s hodnocením`);

  const sloucene = sloucitDuplicity(mista);
  if (sloucene.length < mista.length) console.log(`  sloučeno ${mista.length - sloucene.length} duplicit (stejné místo ve více sadách)`);
  mista.length = 0;
  mista.push(...sloucene);
  mista.sort((a, b) => a.kat.localeCompare(b.kat) || a.nazev.localeCompare(b.nazev, 'cs'));
  const file: MistaFile = { updatedAt: now.toISOString(), sourceIds: sources.map((s) => s.id), mista };
  const ids = new Set(sources.map((s) => s.id));
  manifest.sources = [...manifest.sources.filter((s) => !ids.has(s.id)), ...sources];
  manifest.files.vylety = REL;

  await writeSnapshotAtomic(
    OUT,
    new Map([
      [REL, JSON.stringify(file)],
      ['manifest.json', JSON.stringify(manifest, null, 1)],
    ]),
    { remove: [], tmpRoot: path.resolve('data-raw') },
  );
  await writeFileAtomic(path.resolve('SOURCES.md'), renderSourcesMd(manifest));
  console.log(`míst: ${mista.length} → public/data/${REL} (+ SOURCES.md)`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
