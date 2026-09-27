// Reads a remote ZIP file's central directory and individual entries using HTTP Range
// requests, so we never have to download the whole archive (the ČÚZK RÚIAN export is
// ~251 MB but we only need a handful of shapefile layers out of it).
//
// Falls back to a single full download when the server ignores the Range header.

import { createWriteStream, closeSync, mkdirSync, openSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  crc32: number;
}

type FetchFn = typeof fetch;

interface ByteSource {
  size: number;
  usedRange: boolean;
  read(start: number, end: number): Promise<Buffer>;
  cleanup(): void;
}

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const LOCAL_HEADER_SIG = 0x04034b50;
const SENTINEL16 = 0xffff;
const SENTINEL32 = 0xffffffff;

/**
 * Opens a byte-range-addressable view of a remote (or, in the fallback case, locally
 * spooled) file. A `Range: bytes=0-0` probe tells us whether the server honours ranges
 * (206 + Content-Range) or ignores them (200 + full body, which we then just keep).
 */
async function createByteSource(url: string, fetchImpl: FetchFn): Promise<ByteSource> {
  const probe = await fetchImpl(url, { headers: { Range: 'bytes=0-0' } });

  if (probe.status === 206) {
    const contentRange = probe.headers.get('content-range');
    const total = contentRange ? Number(contentRange.slice(contentRange.indexOf('/') + 1)) : NaN;
    await probe.arrayBuffer().catch(() => undefined);
    if (!Number.isFinite(total)) {
      throw new Error('zip-range: server returned 206 without a usable Content-Range header');
    }
    return {
      size: total,
      usedRange: true,
      async read(start, end) {
        const res = await fetchImpl(url, { headers: { Range: `bytes=${start}-${end}` } });
        if (res.status !== 206) {
          throw new Error(`zip-range: expected 206 for ranged read, got ${res.status}`);
        }
        return Buffer.from(await res.arrayBuffer());
      },
      cleanup() {},
    };
  }

  // Server ignored our Range header: `probe` already carries the whole body (status 200).
  // Spool it to a temp file so subsequent "reads" are just local seeks, not repeat downloads.
  if (!probe.body) throw new Error('zip-range: empty response body while falling back to full download');
  const fallbackPath = join(tmpdir(), `zip-range-fallback-${randomUUID()}.zip`);
  await pipeline(Readable.fromWeb(probe.body as unknown as import('node:stream/web').ReadableStream), createWriteStream(fallbackPath));
  const size = statSync(fallbackPath).size;
  return {
    size,
    usedRange: false,
    async read(start, end) {
      const fd = openSync(fallbackPath, 'r');
      try {
        const len = end - start + 1;
        const buf = Buffer.alloc(len);
        readSync(fd, buf, 0, len, start);
        return buf;
      } finally {
        closeSync(fd);
      }
    },
    cleanup() {
      rmSync(fallbackPath, { force: true });
    },
  };
}

function findEocdOffset(buf: Buffer): number {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      const commentLen = buf.readUInt16LE(i + 20);
      if (i + 22 + commentLen <= buf.length) return i;
    }
  }
  return -1;
}

interface CentralDirLocation {
  totalEntries: number;
  cdSize: number;
  cdOffset: number;
}

async function locateCentralDirectory(source: ByteSource): Promise<CentralDirLocation> {
  const windowSize = Math.min(source.size, 22 + 65535);
  const windowStart = source.size - windowSize;
  const tail = await source.read(windowStart, source.size - 1);
  const idx = findEocdOffset(tail);
  if (idx < 0) throw new Error('zip-range: End Of Central Directory record not found (not a valid zip?)');
  const eocdAbsOffset = windowStart + idx;

  let totalEntries = tail.readUInt16LE(idx + 10);
  let cdSize = tail.readUInt32LE(idx + 12);
  let cdOffset = tail.readUInt32LE(idx + 16);

  const needsZip64 = totalEntries === SENTINEL16 || cdSize === SENTINEL32 || cdOffset === SENTINEL32;
  if (needsZip64) {
    const locatorOffset = eocdAbsOffset - 20;
    const locatorInTail = locatorOffset >= windowStart;
    const locatorBuf = locatorInTail
      ? tail.subarray(locatorOffset - windowStart, locatorOffset - windowStart + 20)
      : await source.read(locatorOffset, locatorOffset + 19);
    if (locatorBuf.readUInt32LE(0) !== EOCD64_LOCATOR_SIG) {
      throw new Error('zip-range: expected Zip64 End Of Central Directory Locator');
    }
    const zip64EocdOffset = Number(locatorBuf.readBigUInt64LE(8));
    const zip64Buf = await source.read(zip64EocdOffset, zip64EocdOffset + 55);
    if (zip64Buf.readUInt32LE(0) !== EOCD64_SIG) {
      throw new Error('zip-range: expected Zip64 End Of Central Directory record');
    }
    totalEntries = Number(zip64Buf.readBigUInt64LE(32));
    cdSize = Number(zip64Buf.readBigUInt64LE(40));
    cdOffset = Number(zip64Buf.readBigUInt64LE(48));
  }

  return { totalEntries, cdSize, cdOffset };
}

function parseZip64Extra(
  extra: Buffer,
  compressedSize: number,
  uncompressedSize: number,
  localHeaderOffset: number,
): { compressedSize: number; uncompressedSize: number; localHeaderOffset: number } {
  let p = 0;
  while (p + 4 <= extra.length) {
    const headerId = extra.readUInt16LE(p);
    const dataSize = extra.readUInt16LE(p + 2);
    if (headerId === 0x0001) {
      let vp = p + 4;
      if (uncompressedSize === SENTINEL32) {
        uncompressedSize = Number(extra.readBigUInt64LE(vp));
        vp += 8;
      }
      if (compressedSize === SENTINEL32) {
        compressedSize = Number(extra.readBigUInt64LE(vp));
        vp += 8;
      }
      if (localHeaderOffset === SENTINEL32) {
        localHeaderOffset = Number(extra.readBigUInt64LE(vp));
        vp += 8;
      }
      break;
    }
    p += 4 + dataSize;
  }
  return { compressedSize, uncompressedSize, localHeaderOffset };
}

async function readEntries(source: ByteSource): Promise<ZipEntry[]> {
  const { totalEntries, cdSize, cdOffset } = await locateCentralDirectory(source);
  const cdBuf = cdSize > 0 ? await source.read(cdOffset, cdOffset + cdSize - 1) : Buffer.alloc(0);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < totalEntries; n++) {
    if (cdBuf.readUInt32LE(p) !== CENTRAL_DIR_SIG) {
      throw new Error(`zip-range: bad central directory record at entry ${n} (offset ${p})`);
    }
    const compressionMethod = cdBuf.readUInt16LE(p + 10);
    const crc32 = cdBuf.readUInt32LE(p + 16);
    let compressedSize = cdBuf.readUInt32LE(p + 20);
    let uncompressedSize = cdBuf.readUInt32LE(p + 24);
    const nameLen = cdBuf.readUInt16LE(p + 28);
    const extraLen = cdBuf.readUInt16LE(p + 30);
    const commentLen = cdBuf.readUInt16LE(p + 32);
    let localHeaderOffset = cdBuf.readUInt32LE(p + 42);
    const name = cdBuf.toString('utf8', p + 46, p + 46 + nameLen);

    if (compressedSize === SENTINEL32 || uncompressedSize === SENTINEL32 || localHeaderOffset === SENTINEL32) {
      const extra = cdBuf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
      ({ compressedSize, uncompressedSize, localHeaderOffset } = parseZip64Extra(
        extra,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      ));
    }

    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset, crc32 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Lists all entries in the remote zip's central directory, without downloading entry data. */
export async function listEntries(url: string, fetchImpl: FetchFn = fetch): Promise<ZipEntry[]> {
  const source = await createByteSource(url, fetchImpl);
  try {
    return await readEntries(source);
  } finally {
    source.cleanup();
  }
}

/**
 * Downloads and inflates only the named entries from the remote zip, writing each to
 * `destDir` (flattened to its basename). Returns a map of the requested entry name to
 * the local file path it was written to.
 */
export async function extractEntries(
  url: string,
  names: string[],
  destDir: string,
  fetchImpl: FetchFn = fetch,
): Promise<Record<string, string>> {
  const source = await createByteSource(url, fetchImpl);
  try {
    const entries = await readEntries(source);
    const byName = new Map(entries.map((e) => [e.name, e]));
    mkdirSync(destDir, { recursive: true });
    const out: Record<string, string> = {};
    for (const name of names) {
      const entry = byName.get(name);
      if (!entry) throw new Error(`zip-range: entry not found in zip: ${name}`);
      const localHeader = await source.read(entry.localHeaderOffset, entry.localHeaderOffset + 29);
      if (localHeader.readUInt32LE(0) !== LOCAL_HEADER_SIG) {
        throw new Error(`zip-range: bad local file header for ${name}`);
      }
      const nameLen = localHeader.readUInt16LE(26);
      const extraLen = localHeader.readUInt16LE(28);
      const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen;
      const raw =
        entry.compressedSize > 0
          ? await source.read(dataStart, dataStart + entry.compressedSize - 1)
          : Buffer.alloc(0);
      let data: Buffer;
      if (entry.compressionMethod === 0) {
        data = raw;
      } else if (entry.compressionMethod === 8) {
        data = inflateRawSync(raw);
      } else {
        throw new Error(`zip-range: unsupported compression method ${entry.compressionMethod} for ${name}`);
      }
      const actualCrc = crc32(data) >>> 0;
      if (actualCrc !== entry.crc32) {
        throw new Error(
          `zip-range: CRC32 mismatch for ${name}: expected 0x${entry.crc32.toString(16)}, got 0x${actualCrc.toString(16)}`,
        );
      }
      const destPath = join(destDir, basename(name));
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, data);
      out[name] = destPath;
    }
    return out;
  } finally {
    source.cleanup();
  }
}
