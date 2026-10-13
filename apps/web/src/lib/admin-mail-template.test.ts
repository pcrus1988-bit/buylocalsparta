import assert from "node:assert/strict";
import test from "node:test";
import { renderAdminMailHtml, plainTextToEmailHtml, validateCustomMailHtml } from "./admin-mail-template.ts";
import { buildAdminMailRawMime, parseAdminMailMime } from "./admin-mail-mime.ts";

test("plain text can be wrapped with official branding without including unescaped markup", () => {
  const source = "Καλημέρα!\n\nPlease visit https://kontamou.site/hubs/join?plan=pro&from=mail\n\n<unsafe>";
  const html = renderAdminMailHtml({ format: "branded", text: source });
  assert.ok(html);
  assert.match(html, /KONTA MOY/);
  assert.match(html, /Developed in Sparta for Greece/);
  assert.match(html, /background:#173e2a/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(html, /href="https:\/\/kontamou.site\/hubs\/join\?plan=pro&amp;from=mail"/);
});

test("HTML fragments preserve custom content inside branded header/footer", () => {
  const html = renderAdminMailHtml({
    format: "html",
    text: "Hello",
    html: '<h2>Hello</h2><a href="https://kontamou.site/hubs/join">Apply</a>'
  });
  assert.match(html ?? "", /<h2>Hello<\/h2>/);
  assert.match(html ?? "", /Apply<\/a>/);
  assert.match(html ?? "", /www.kontamou.site/);
  assert.equal(renderAdminMailHtml({ format: "plain", text: "Hello" }), undefined);
});

test("rejects unsafe active email HTML and empty fragments", () => {
  for (const raw of ['<script>alert(1)</script>', '<a href="javascript:alert(1)">click</a>', '<img src=x onerror=alert(1)>', '<iframe src="https://example.com">', '<html><body>hello</body></html>', "  "]) {
    assert.throws(() => validateCustomMailHtml(raw));
  }
  assert.match(plainTextToEmailHtml("First line\nSecond line"), /First line<br>Second line/);
});

test("branded HTML and text fallback round-trip in SES MIME with attachments", () => {
  const text = "Καλώς ήρθατε!";
  const html = renderAdminMailHtml({ format: "branded", text }) || "";
  const built = buildAdminMailRawMime({
    from: { name: "KONTA MOY", address: "partners@kontamou.site" },
    to: [{ address: "person@example.com" }],
    subject: "KONTA MOY – Συνεργασία",
    text,
    html,
    internetMessageIdDomain: "kontamou.site",
    attachments: [{ filename: "quote.txt", contentType: "text/plain", bytes: new TextEncoder().encode("quote") }]
  });
  const parsed = parseAdminMailMime(built.raw);
  assert.equal(parsed.text, text);
  assert.match(parsed.html || "", /KONTA MOY/);
  assert.equal(parsed.attachments.length, 1);
});


test("long Greek email is not truncated in the branded MIME preview or text fallback", () => {
  const paragraph = "Αγαπητέ συνεργάτη, η συνεργασία και η υποστήριξη συνεχίζονται. ";
  const text = (paragraph.repeat(400) + "\n\nΤΕΛΟΣ ΜΗΝΥΜΑΤΟΣ").trim();
  assert.ok(text.length > 20_000);
  const html = renderAdminMailHtml({ format: "branded", text }) || "";
  assert.ok(html.includes("ΤΕΛΟΣ ΜΗΝΥΜΑΤΟΣ"), "Long-message preview must show the ending");
  const built = buildAdminMailRawMime({
    from: { name: "KONTA MOY", address: "partners@kontamou.site" },
    to: [{ address: "person@example.com" }],
    subject: "Long email test",
    text,
    html,
    internetMessageIdDomain: "kontamou.site"
  });
  const parsed = parseAdminMailMime(built.raw);
  assert.equal(parsed.text, text, "Plain text fallback must contain entire source");
  assert.ok(parsed.html?.includes("ΤΕΛΟΣ ΜΗΝΥΜΑΤΟΣ"), "HTML MIME must contain entire source");
});
