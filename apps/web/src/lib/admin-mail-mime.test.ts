import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminMailRawMime, parseAdminMailMime } from "./admin-mail-mime.ts";

test("parses SES inbound headers and a plain text message", () => {
  const raw = [
    "Return-Path: <sender@example.com>",
    "X-SES-Spam-Verdict: PASS",
    "X-SES-Virus-Verdict: PASS",
    "Message-ID: <incoming-1@example.com>",
    "From: Example Sender <sender@example.com>",
    "To: partners@kontamou.site",
    "Subject: Hello KONTA MOU",
    "Date: Thu, 01 Oct 2026 05:24:35 +0000",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "Hello from the inbound mailbox."
  ].join("\r\n");

  const parsed = parseAdminMailMime(raw);
  assert.equal(parsed.internetMessageId, "<incoming-1@example.com>");
  assert.equal(parsed.subject, "Hello KONTA MOU");
  assert.equal(parsed.from.address, "sender@example.com");
  assert.deepEqual(parsed.to.map((entry) => entry.address), ["partners@kontamou.site"]);
  assert.equal(parsed.text, "Hello from the inbound mailbox.");
  assert.equal(parsed.headers["x-ses-spam-verdict"], "PASS");
  assert.equal(parsed.headers["x-ses-virus-verdict"], "PASS");
});

test("builds a unicode reply with attachment that can be parsed again", () => {
  const attachment = new TextEncoder().encode("attachment body");
  const built = buildAdminMailRawMime({
    from: { name: "ΚΟΝΤΑ ΜΟΥ", address: "partners@kontamou.site" },
    to: [{ address: "customer@example.com" }],
    cc: [{ address: "copy@example.com" }],
    subject: "Απάντηση για τη συνεργασία",
    text: "Καλημέρα!\n\nΕυχαριστούμε για το μήνυμα.",
    inReplyTo: "<incoming-1@example.com>",
    references: ["<older@example.com>", "<incoming-1@example.com>"],
    internetMessageIdDomain: "kontamou.site",
    attachments: [{ filename: "details.txt", contentType: "text/plain", bytes: attachment }]
  });

  const parsed = parseAdminMailMime(built.raw);
  assert.equal(parsed.subject, "Απάντηση για τη συνεργασία");
  assert.equal(parsed.inReplyTo, "<incoming-1@example.com>");
  assert.deepEqual(parsed.references, ["<older@example.com>", "<incoming-1@example.com>"]);
  assert.match(parsed.text, /Ευχαριστούμε/);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0]?.filename, "details.txt");
  assert.equal(Buffer.from(parsed.attachments[0]?.bytes || []).toString("utf8"), "attachment body");
});
