import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

/**
 * Decodes Open Icecat index snapshots with Node's native Gunzip stream.
 *
 * Open Icecat snapshots may contain concatenated gzip members. Node 24.19+
 * intentionally made the WHATWG DecompressionStream reject any input after
 * the first gzip member, so the browser-compatible API is too strict for this
 * server-side ingestion format. Native Gunzip supports concatenated members
 * while still validating the gzip stream itself.
 */
export async function* gunzipOpenIcecatChunks(
  chunks: AsyncIterable<Uint8Array>
): AsyncGenerator<Uint8Array> {
  const source = Readable.from(chunks, { objectMode: false });
  const gunzip = createGunzip();
  const decompressed = source.pipe(gunzip);

  try {
    for await (const chunk of decompressed) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error("Open Icecat gzip decoder produced a non-binary chunk");
      }
      if (chunk.byteLength) yield chunk;
    }
  } finally {
    source.destroy();
    gunzip.destroy();
  }
}
