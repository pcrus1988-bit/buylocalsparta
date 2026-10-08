import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminMailAttachmentHeaders } from "./admin-mail-attachment-headers.ts";

function decodedExtendedFilename(disposition: string): string {
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  assert.ok(match, "Expected an RFC 5987 UTF-8 filename");
  return decodeURIComponent(match[1]);
}

test("Greek attachment filenames produce valid HTTP headers and preserve their names", () => {
  const filename = "Έγγραφο διαμαρτυρίας.pdf";
  const headers = buildAdminMailAttachmentHeaders(filename, "application/pdf");
  const disposition = headers.get("content-disposition") || "";
  assert.match(disposition, /^attachment; filename="[^"]+"; filename\*=UTF-8''/);
  assert.equal(decodedExtendedFilename(disposition), filename);
  assert.ok([...disposition].every((char) => char.charCodeAt(0) <= 127));
  assert.equal(headers.get("content-type"), "application/pdf");
  assert.equal(headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
});

test("emoji, apostrophes and combining characters never create invalid header characters", () => {
  const filename = "Résumé 'α' (1) 📎.pdf";
  const disposition = buildAdminMailAttachmentHeaders(filename, "application/pdf").get("content-disposition") || "";
  assert.equal(decodedExtendedFilename(disposition), filename);
  assert.ok([...disposition].every((char) => char.charCodeAt(0) <= 127));
});

test("malformed filenames and MIME types cannot inject headers", () => {
  const headers = buildAdminMailAttachmentHeaders('bad\\path/"report"\r\nSet-Cookie: injected.pdf', "text/html\r\nx-injected: true");
  const disposition = headers.get("content-disposition") || "";
  assert.ok(!disposition.includes("\r") && !disposition.includes("\n"));
  assert.ok(!disposition.includes('filename="bad\\'));
  assert.equal(headers.get("content-type"), "application/octet-stream");
  assert.equal(headers.get("set-cookie"), null);
});

test("empty filenames use a safe default", () => {
  const disposition = buildAdminMailAttachmentHeaders("\r\n", "").get("content-disposition") || "";
  assert.equal(decodedExtendedFilename(disposition), "attachment");
});
