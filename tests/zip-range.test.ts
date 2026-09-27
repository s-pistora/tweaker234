import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { listEntries, extractEntries } from '../scripts/zip-range.ts';

// --- minimal, hand-rolled ZIP writer for offline fixtures --------------------------------

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

interface FileSpec {
  name: string;
  data: Buffer;
  method: 0 | 8;
}

function buildParts(files: FileSpec[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const compressed = f.method === 8 ? deflateRawSync(f.data) : f.data;
    const crc = crc32(f.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(f.method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(f.method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }
  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  return { localBuf, centralBuf, count: files.length };
}

function buildZip(files: FileSpec[]): Buffer {
  const { localBuf, centralBuf, count } = buildParts(files);
  const cdOffset = localBuf.length;
  const cdSize = centralBuf.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

/** Same content, but forces the Zip64 End Of Central Directory path via sentinel values. */
function buildZip64(files: FileSpec[]): Buffer {
  const { localBuf, centralBuf, count } = buildParts(files);
  const cdOffset = localBuf.length;
  const cdSize = centralBuf.length;
  const zip64EocdOffset = localBuf.length + centralBuf.length;

  const zip64Eocd = Buffer.alloc(56);
  zip64Eocd.writeUInt32LE(0x06064b50, 0);
  zip64Eocd.writeBigUInt64LE(44n, 4);
  zip64Eocd.writeUInt16LE(45, 12);
  zip64Eocd.writeUInt16LE(45, 14);
  zip64Eocd.writeUInt32LE(0, 16);
  zip64Eocd.writeUInt32LE(0, 20);
  zip64Eocd.writeBigUInt64LE(BigInt(count), 24);
  zip64Eocd.writeBigUInt64LE(BigInt(count), 32);
  zip64Eocd.writeBigUInt64LE(BigInt(cdSize), 40);
  zip64Eocd.writeBigUInt64LE(BigInt(cdOffset), 48);

  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(BigInt(zip64EocdOffset), 8);
  locator.writeUInt32LE(1, 16);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0xffff, 4);
  eocd.writeUInt16LE(0xffff, 6);
  eocd.writeUInt16LE(0xffff, 8);
  eocd.writeUInt16LE(0xffff, 10);
  eocd.writeUInt32LE(0xffffffff, 12);
  eocd.writeUInt32LE(0xffffffff, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, zip64Eocd, locator, eocd]);
}

// --- fake fetch implementations ----------------------------------------------------------

function makeRangeFetch(buf: Buffer, onRange?: () => void): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    const range = headers?.Range;
    if (!range) return new Response(new Uint8Array(buf), { status: 200 });
    const m = /bytes=(\d+)-(\d+)/.exec(range);
    if (!m) return new Response(new Uint8Array(buf), { status: 200 });
    onRange?.();
    const start = Number(m[1]);
    const end = Math.min(Number(m[2]), buf.length - 1);
    const chunk = buf.subarray(start, end + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${buf.length}` },
    });
  }) as unknown as typeof fetch;
}

/** Simulates a server/proxy that always ignores Range and returns the full file with 200. */
function makeNoRangeFetch(buf: Buffer): typeof fetch {
  return (async () => new Response(new Uint8Array(buf), { status: 200 })) as unknown as typeof fetch;
}

// --- tests ---------------------------------------------------------------------------------

describe('zip-range: listEntries', () => {
  it('parses central directory entries via Range requests only', async () => {
    const zip = buildZip([
      { name: '1/VUSC_P.shp', data: Buffer.from('kraje-shp-body'), method: 0 },
      { name: '1/VUSC_P.dbf', data: Buffer.from('kraje-dbf-body-'.repeat(50)), method: 8 },
    ]);
    let rangeRequests = 0;
    const entries = await listEntries('https://example.test/1.zip', makeRangeFetch(zip, () => rangeRequests++));
    expect(entries.map((e) => e.name)).toEqual(['1/VUSC_P.shp', '1/VUSC_P.dbf']);
    expect(entries[0].compressionMethod).toBe(0);
    expect(entries[1].compressionMethod).toBe(8);
    expect(entries[1].uncompressedSize).toBe(15 * 50);
    expect(rangeRequests).toBeGreaterThan(0);
  });

  it('follows the Zip64 End Of Central Directory when the regular EOCD carries sentinel values', async () => {
    const zip = buildZip64([
      { name: 'a.txt', data: Buffer.from('hello zip64 world'), method: 0 },
      { name: 'b.txt', data: Buffer.from('second entry'), method: 8 },
    ]);
    const entries = await listEntries('https://example.test/1.zip', makeRangeFetch(zip));
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'b.txt']);
    expect(entries[0].uncompressedSize).toBe('hello zip64 world'.length);
  });
});

describe('zip-range: extractEntries', () => {
  it('extracts and inflates only the requested entries, via Range', async () => {
    const bodyA = Buffer.from('stored-content-A');
    const bodyB = Buffer.from('deflated content B '.repeat(20));
    const zip = buildZip([
      { name: '1/A.txt', data: bodyA, method: 0 },
      { name: '1/B.txt', data: bodyB, method: 8 },
    ]);
    let rangeRequests = 0;
    const dest = mkdtempSync(join(tmpdir(), 'zip-range-test-'));
    try {
      const out = await extractEntries(
        'https://example.test/1.zip',
        ['1/B.txt'],
        dest,
        makeRangeFetch(zip, () => rangeRequests++),
      );
      expect(readFileSync(out['1/B.txt'])).toEqual(bodyB);
      expect(existsSync(join(dest, 'A.txt'))).toBe(false);
      expect(rangeRequests).toBeGreaterThan(0);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it('falls back to a full download when the server ignores Range', async () => {
    const bodyA = Buffer.from('fallback-content-A');
    const zip = buildZip([{ name: '1/A.txt', data: bodyA, method: 0 }]);
    const dest = mkdtempSync(join(tmpdir(), 'zip-range-test-'));
    try {
      const out = await extractEntries('https://example.test/1.zip', ['1/A.txt'], dest, makeNoRangeFetch(zip));
      expect(readFileSync(out['1/A.txt'])).toEqual(bodyA);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it('throws a clear error when the requested entry does not exist', async () => {
    const zip = buildZip([{ name: 'only.txt', data: Buffer.from('x'), method: 0 }]);
    const dest = mkdtempSync(join(tmpdir(), 'zip-range-test-'));
    try {
      await expect(extractEntries('https://example.test/1.zip', ['missing.txt'], dest, makeRangeFetch(zip))).rejects.toThrow(
        /not found/,
      );
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
