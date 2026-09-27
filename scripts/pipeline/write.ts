// Atomický(-ish) zápis snapshotu: vše se nejdřív zapíše do temp adresáře uvnitř cíle (stejný disk →
// rename je levný a atomický po souborech). Až když je vše připravené, přesunou se soubory jeden po
// druhém na místo (rename přes existující soubor funguje i na Windows – MoveFileEx REPLACE_EXISTING;
// přejmenovat celý adresář přes existující na Windows nejde) a manifest.json jako POSLEDNÍ – frontend
// tak nikdy neuvidí nový manifest odkazující na nepřipravené soubory. Selže-li příprava, cíl se nemění.
import { copyFile, mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MANIFEST = 'manifest.json';

function resolveInside(root: string, rel: string): string {
  const abs = path.resolve(root, rel);
  const relBack = path.relative(root, abs);
  if (!relBack || relBack.startsWith('..') || path.isAbsolute(relBack)) {
    throw new Error(`Cesta ${rel} leží mimo cílový adresář ${root}.`);
  }
  return abs;
}

async function moveReplace(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch {
    // Např. soubor na Windows dočasně zamčený (antivir, OneDrive) → kopie přes a úklid.
    await copyFile(from, to);
    await unlink(from).catch(() => {});
  }
}

/**
 * Zapíše `files` (relativní cesta → obsah) do `outDir`; `remove` = relativní cesty ke smazání
 * (osiřelé soubory předchozího snapshotu). `manifest.json` (je-li v `files`) se přesune poslední.
 */
export async function writeSnapshotAtomic(
  outDir: string,
  files: Map<string, string>,
  opts: { remove: string[] },
): Promise<void> {
  const root = path.resolve(outDir);
  await mkdir(root, { recursive: true });
  const tmp = path.join(root, `.tmp-${process.pid}-${Date.now()}`);
  const staged: Array<[string, string]> = [];
  try {
    for (const [rel, content] of files) {
      const target = resolveInside(root, rel);
      const tmpFile = resolveInside(tmp, rel);
      await mkdir(path.dirname(tmpFile), { recursive: true });
      await writeFile(tmpFile, content, 'utf8');
      staged.push([tmpFile, target]);
    }
    const removeAbs = opts.remove.map((rel) => resolveInside(root, rel));

    // --- commit ---
    const manifestTarget = path.join(root, MANIFEST);
    for (const [from, to] of staged) if (to !== manifestTarget) await moveReplace(from, to);
    for (const [from, to] of staged) if (to === manifestTarget) await moveReplace(from, to);
    for (const abs of removeAbs) await rm(abs, { force: true });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Zapíše jeden soubor přes temp + rename (např. SOURCES.md). */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, content, 'utf8');
  await moveReplace(tmp, file);
}
