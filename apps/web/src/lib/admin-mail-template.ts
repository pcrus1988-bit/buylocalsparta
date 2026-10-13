/**
 * Shared HTML renderer for the /admin/mail editor and SES outbound flow.
 * This makes preview and sent HTML use the same canonical branding.
 */
export type AdminMailFormat = "plain" | "branded" | "html";

export function renderAdminMailHtml(input: {
  format: AdminMailFormat;
  text: string;
  html?: string;
}): string | undefined {
  if (input.format === "plain") return undefined;
  const body = input.format === "html"
    ? validateCustomMailHtml(input.html ?? "")
    : plainTextToEmailHtml(input.text);
  return wrapKontaMouMailHtml(body);
}

export function validateCustomMailHtml(html: string): string {
  const value = html.trim();
  if (!value || value.length > 120_000) throw new Error("HTML content must be 1–120,000 characters.");
  // Custom HTML is a fragment inside the official KONTA MOY shell.
  // Disallow active content, embeds and nested HTML documents.
  if (/<\s*\/?\s*(?:script|iframe|object|embed|form|input|button|svg|math|base|meta|link)\b/i.test(value)
    || /\bon[a-z]+\s*=/i.test(value)
    || /(?:javascript|vbscript|data)\s*:/i.test(value)
    || /<\s*!doctype\b|<\s*\/?\s*(?:html|head|body)\b/i.test(value)) {
    throw new Error("HTML email must contain a safe body fragment; scripts, forms, embeds and full HTML documents are not supported.");
  }
  return value;
}

export function plainTextToEmailHtml(text: string): string {
  const value = text.trim();
  if (!value) return "";
  return value.split(/\n\s*\n/).map((paragraph) => {
    const escaped = escapeMailHtml(paragraph.trim());
    const linked = escaped.replace(/(?:https?:\/\/|www\.)[^\s<]+/gi, (candidate) => {
      const match = /[.,;:!?)]+$/.exec(candidate);
      const suffix = match?.[0] || "";
      const url = suffix ? candidate.slice(0, -suffix.length) : candidate;
      if (!url) return candidate;
      const href = url.startsWith("www.") ? "https://" + url : url;
      return '<a href="' + href.replace(/&amp;/g, "&").replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '" style="color:#17684e;text-decoration:underline">' + url + "</a>" + suffix;
    });
    return '<p style="margin:0 0 18px;line-height:1.75">' + linked.replace(/\n/g, "<br>") + "</p>";
  }).join("\n");
}

export function wrapKontaMouMailHtml(innerBody: string): string {
  return [
    '<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KONTA MOY</title></head>',
    '<body style="margin:0;padding:0;background:#f4f6f3;color:#19382c;font-family:Arial,Helvetica,sans-serif">',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f6f3"><tr><td align="center" style="padding:32px 14px">',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;background:#fff;border:1px solid #dce5df;border-radius:18px;overflow:hidden">',
    '<tr><td style="background:#173e2a;padding:28px 32px">',
    '<a href="https://kontamou.site" style="color:#fff;text-decoration:none;font-weight:800;letter-spacing:1px;font-size:27px">KONTA MOY</a>',
    '<div style="color:#d7eadb;font-size:12px;letter-spacing:.4px;margin-top:6px">Developed in Sparta for Greece</div></td></tr>',
    '<tr><td style="padding:34px 32px;font-size:15px;line-height:1.75;color:#223a2d;overflow-wrap:anywhere">',
    innerBody,
    '</td></tr><tr><td style="border-top:1px solid #e3e9e4;padding:24px 32px;background:#f8faf8;color:#566d5e;font-size:12px;line-height:1.6">',
    '<strong style="color:#173e2a;font-size:14px">KONTA MOY</strong><br>Τοπικές επιχειρήσεις. Περισσότερες δυνατότητες.<br>',
    '<a href="https://kontamou.site" style="color:#17684e;text-decoration:underline">www.kontamou.site</a><br>',
    '<span style="color:#768679">Developed in Sparta for Greece</span></td></tr></table></td></tr></table></body></html>'
  ].join("\n");
}

function escapeMailHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
