import assert from "node:assert/strict";
import test from "node:test";
import { adminMailThreadKey, buildAdminMailRawMime, parseAdminMailMime } from "./admin-mail-mime.ts";

test("admin mail MIME round-trips UTF-8 body, reply headers and attachments", () => {
  const built = buildAdminMailRawMime({
    from: { name: "ΚΟΝΤΑ ΜΟΥ", address: "partners@kontamou.site" },
    to: [{ name: "Partner", address: "partner@example.com" }],
    cc: [{ address: "ops@example.com" }],
    subject: "Δοκιμή συνεργάτη",
    text: "Καλημέρα,\n\nαυτό είναι ένα λειτουργικό SES MIME μήνυμα.",
    html: "<p>Καλημέρα,</p><p>αυτό είναι ένα λειτουργικό SES MIME μήνυμα.</p>",
    internetMessageIdDomain: "kontamou.site",
    inReplyTo: "<parent@example.com>",
    references: ["<root@example.com>", "<parent@example.com>"],
    attachments: [{
      filename: "στοιχεία.txt",
      contentType: "text/plain",
      bytes: Buffer.from("attachment payload", "utf8")
    }]
  });

  const parsed = parseAdminMailMime(built.raw);
  assert.equal(parsed.from.address, "partners@kontamou.site");
  assert.equal(parsed.from.name, "ΚΟΝΤΑ ΜΟΥ");
  assert.equal(parsed.to[0]?.address, "partner@example.com");
  assert.equal(parsed.cc[0]?.address, "ops@example.com");
  assert.equal(parsed.subject, "Δοκιμή συνεργάτη");
  assert.match(parsed.text ?? "", /λειτουργικό SES MIME/);
  assert.equal(parsed.inReplyTo, "<parent@example.com>");
  assert.deepEqual(parsed.references, ["<root@example.com>", "<parent@example.com>"]);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0]?.filename, "στοιχεία.txt");
  assert.equal(Buffer.from(parsed.attachments[0]?.bytes ?? []).toString("utf8"), "attachment payload");
  assert.match(built.internetMessageId, /@kontamou\.site>$/);
});

test("thread key keeps root and external reply chains together", () => {
  const subjectOnly = adminMailThreadKey({ subject: "Vendor application" });
  assert.equal(adminMailThreadKey({ subject: "Re: Vendor application" }), subjectOnly);
  assert.equal(adminMailThreadKey({ subject: "Fwd: Re: Vendor application" }), subjectOnly);

  const root = adminMailThreadKey({
    subject: "Vendor application",
    internetMessageId: "<root@kontamou.site>"
  });
  const oneHopReply = adminMailThreadKey({
    subject: "Re: Vendor application",
    internetMessageId: "<reply-1@example.com>",
    inReplyTo: "<root@kontamou.site>"
  });
  const deepReply = adminMailThreadKey({
    subject: "Changed subject",
    internetMessageId: "<reply-2@example.com>",
    inReplyTo: "<reply-1@example.com>",
    references: ["<root@kontamou.site>", "<reply-1@example.com>"]
  });
  assert.equal(oneHopReply, root);
  assert.equal(deepReply, root);
});

test("parser accepts a minimal SES-style RFC822 message", () => {
  const raw = [
    "From: Prospect <pcrus1988@gmail.com>",
    "To: partners@kontamou.site",
    "Subject: Partnership request",
    "Message-ID: <abc123@gmail.com>",
    "Date: Thu, 01 Oct 2026 05:24:35 +0000",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Hello KONTA MOY"
  ].join("\r\n");
  const parsed = parseAdminMailMime(raw);
  assert.equal(parsed.from.address, "pcrus1988@gmail.com");
  assert.equal(parsed.to[0]?.address, "partners@kontamou.site");
  assert.equal(parsed.subject, "Partnership request");
  assert.equal(parsed.text, "Hello KONTA MOY");
  assert.equal(parsed.internetMessageId, "<abc123@gmail.com>");
});
