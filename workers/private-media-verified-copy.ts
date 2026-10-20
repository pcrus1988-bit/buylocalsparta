import { createHash } from "node:crypto";
import type { ServerObjectStorage } from "../packages/object-storage/src/index.ts";

/**
 * Supabase REST does not support the media worker's conditional S3 CopyObject.
 * Copy only bytes whose digest and size still match the successfully scanned
 * source. The verified object remains private until explicit Admin approval.
 */
export async function copyScannedSupabaseMedia(
  storage: Pick<ServerObjectStorage, "read" | "put" | "head">,
  sourceKey: string,
  verifiedKey: string,
  contentType: string,
  expectedSize: number,
  expectedSha256: string
) {
  if (!sourceKey.startsWith("private/vendor-media/") ||
      !verifiedKey.startsWith("private/verified-media/") ||
      !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error("Invalid private media scan copy");
  }
  const source = await storage.read(sourceKey);
  const parts: Buffer[] = [];
  const hash = createHash("sha256");
  let size = 0;
  for await (const raw of source.stream) {
    size += raw.byteLength;
    if (size > 25 * 1024 * 1024) throw new Error("Media exceeds scanner copy limit");
    const chunk = Buffer.from(raw);
    parts.push(chunk);
    hash.update(chunk);
  }
  if (size !== expectedSize || hash.digest("hex") !== expectedSha256) {
    throw new Error("Media changed since malware scan");
  }
  await storage.put({
    objectKey: verifiedKey,
    contentType,
    body: Buffer.concat(parts, size)
  });
  const verified = await storage.head(verifiedKey);
  if (!verified || verified.byteSize !== expectedSize || verified.contentType !== contentType) {
    throw new Error("Verified private object metadata does not match scanned content");
  }
  return verified;
}
