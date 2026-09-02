import { inflateRawSync } from "node:zlib";

/**
 * One entry out of a .docx, for tests.
 *
 * A .docx is a zip, so asserting on what the renderer produced means reading its
 * parts. The CENTRAL DIRECTORY is walked rather than the local headers: a writer
 * is allowed to leave the sizes in a local header as zero and put them in a
 * trailing data descriptor, and the central directory always carries them.
 *
 * Test-only, and deliberately not exported from the package.
 */
export function readZipEntry(zip: Uint8Array, name: string): string {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const u32 = (at: number): number => view.getUint32(at, true);
  const u16 = (at: number): number => view.getUint16(at, true);

  // End of central directory: scan back for its signature.
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a zip: no end-of-central-directory record");

  const count = u16(eocd + 10);
  let at = u32(eocd + 16);
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (u32(at) !== 0x02014b50) throw new Error(`bad central directory entry at ${at}`);
    const method = u16(at + 10);
    const compressedSize = u32(at + 20);
    const nameLength = u16(at + 28);
    const extraLength = u16(at + 30);
    const commentLength = u16(at + 32);
    const localAt = u32(at + 42);
    const entryName = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));

    if (entryName === name) {
      const localNameLength = u16(localAt + 26);
      const localExtraLength = u16(localAt + 28);
      const dataAt = localAt + 30 + localNameLength + localExtraLength;
      const data = zip.subarray(dataAt, dataAt + compressedSize);
      if (method === 0) return decoder.decode(data);
      if (method === 8) return decoder.decode(inflateRawSync(data));
      throw new Error(`unsupported compression method ${method} for "${name}"`);
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`"${name}" is not in the archive`);
}
