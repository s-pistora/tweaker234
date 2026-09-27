import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSnapshotAtomic } from '../../scripts/pipeline/write.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kt-write-'));
  mkdirSync(join(dir, 'points'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), 'OLD-MANIFEST');
  writeFileSync(join(dir, 'points', 'skoly.json'), 'OLD-SKOLY');
  writeFileSync(join(dir, 'points', 'stare.json'), 'ORPHAN');
  writeFileSync(join(dir, 'points', 'keep.json'), 'KEEP');
});

describe('writeSnapshotAtomic', () => {
  it('přepíše existující soubory, vytvoří nové adresáře, manifest zapíše, osiřelé smaže, temp uklidí', async () => {
    await writeSnapshotAtomic(
      dir,
      new Map([
        ['points/skoly.json', 'NEW-SKOLY'],
        ['indicators/kraj.json', 'KRAJ'],
        ['manifest.json', 'NEW-MANIFEST'],
      ]),
      { remove: ['points/stare.json'], tmpRoot: join(dir, '..', `kt-write-tmp-${process.pid}`) },
    );
    expect(readFileSync(join(dir, 'points', 'skoly.json'), 'utf8')).toBe('NEW-SKOLY');
    expect(readFileSync(join(dir, 'indicators', 'kraj.json'), 'utf8')).toBe('KRAJ');
    expect(readFileSync(join(dir, 'manifest.json'), 'utf8')).toBe('NEW-MANIFEST');
    expect(existsSync(join(dir, 'points', 'stare.json'))).toBe(false);
    expect(readFileSync(join(dir, 'points', 'keep.json'), 'utf8')).toBe('KEEP'); // nezmíněný soubor zůstane
    expect(readdirSync(dir).filter((n) => n.startsWith('.tmp'))).toEqual([]);
  });

  it('selže-li příprava v temp adresáři, cílový adresář zůstane beze změny', async () => {
    await expect(
      writeSnapshotAtomic(
        dir,
        new Map([
          ['points/skoly.json', 'NEW-SKOLY'],
          ['bad\0name.json', 'X'],
          ['manifest.json', 'NEW-MANIFEST'],
        ]),
        { remove: ['points/stare.json'] },
      ),
    ).rejects.toThrow();
    expect(readFileSync(join(dir, 'points', 'skoly.json'), 'utf8')).toBe('OLD-SKOLY');
    expect(readFileSync(join(dir, 'manifest.json'), 'utf8')).toBe('OLD-MANIFEST');
    expect(existsSync(join(dir, 'points', 'stare.json'))).toBe(true);
    expect(readdirSync(dir).filter((n) => n.startsWith('.tmp'))).toEqual([]);
  });

  it('odmítne cestu mimo cílový adresář', async () => {
    await expect(writeSnapshotAtomic(dir, new Map([['../ven.json', 'X']]), { remove: [] })).rejects.toThrow(/mimo/);
  });
});
