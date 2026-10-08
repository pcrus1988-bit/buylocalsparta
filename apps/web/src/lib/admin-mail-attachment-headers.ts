/**
 * A response header must contain only ByteString-compatible characters.
 * Keep the original Unicode filename via RFC 5987 filename*, and provide an
 * ASCII-only filename fallback for older browsers.
 */
export function buildAdminMailAttachmentHeaders(rawFilename: string, rawContentType: string): Headers {
  const filename = Array.from(
    rawFilename
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/["\\/]/g, "_")
      .trim()
  ).slice(0, 180).join("") || "attachment";
  const fallback = filename
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[;%=]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+(?=\.)/, "attachment")
    .replace(/^_+$/, "attachment");
  const encodedFilename = encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const contentType = /^[a-z0-9][a-z0-9.+_-]*\/[a-z0-9][a-z0-9.+_-]*$/i.test(rawContentType)
    ? rawContentType
    : "application/octet-stream";

  return new Headers({
    "content-type": contentType,
    "content-disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodedFilename}`,
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff"
  });
}
