// `npm run data:zmeny` – hlídač změn: porovná public/data v pracovní kopii s verzí v gitu (HEAD),
// změny popíše lidskou řečí a připíše je do public/data/zmeny.json („Co je nového v datech“).
// Pouští se po `data:update` a ostatních `data:*` (GitHub Action .github/workflows/hlidac.yml).
//
// Výstup: počet změn na stdout; v GitHub Actions i `zmeny=<počet>` do $GITHUB_OUTPUT –
// workflow commituje jen při skutečných změnách obsahu (ne jen časových razítek).
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isZmenyFile, porovnej, pripisBeh, type Soubory, type ZmenyFile } from '../src/lib/zmeny.ts';
import { writeFileAtomic } from './pipeline/write.ts';

const DATA = 'public/data';
const ZMENY = 'zmeny.json';
/** geodata a testovací fixtures se nehlídají */
const VYNECHAT = /^(_fixtures|geo)\//;

async function soubory(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await soubory(dir, r)));
    else if (e.name.endsWith('.json') && r !== ZMENY && r !== 'manifest.json' && !VYNECHAT.test(r)) out.push(r);
  }
  return out;
}

function zGitu(rel: string): unknown {
  try {
    return JSON.parse(execFileSync('git', ['show', `HEAD:${DATA}/${rel}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return undefined;
  }
}

export async function main(now = new Date()): Promise<number> {
  const pred: Soubory = {};
  const po: Soubory = {};
  for (const rel of await soubory(DATA)) {
    po[rel] = JSON.parse(await readFile(path.join(DATA, rel), 'utf8'));
    pred[rel] = zGitu(rel);
  }
  const zmeny = porovnej(pred, po);

  let stary: ZmenyFile | null = null;
  try {
    const x: unknown = JSON.parse(await readFile(path.join(DATA, ZMENY), 'utf8'));
    if (isZmenyFile(x)) stary = x;
  } catch {
    /* první běh */
  }
  if (zmeny.length) {
    const novy = pripisBeh(stary, { datum: now.toISOString(), zmeny });
    await writeFileAtomic(path.join(DATA, ZMENY), JSON.stringify(novy, null, 1) + '\n');
  }

  process.stdout.write(zmeny.length ? `Změny v datech (${zmeny.length}):\n` : 'Žádné změny v obsahu dat.\n');
  for (const z of zmeny) process.stdout.write(`  [${z.oblast}] ${z.veta}\n`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `zmeny=${zmeny.length}\n`);
  return zmeny.length;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
