import type { PressKitHighlight } from "./research-press-kit";

function xml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** Render publication-safe, resolution-independent, branded figures. */
export function pressKitFigureSvg(item: PressKitHighlight): string {
  const width = Math.round(970 * item.value);
  const value = xml(item.formatted);
  const title = xml(item.title);
  const insight = xml(item.insight);
  const base = xml("Βάση: n=" + item.n.toLocaleString("el-GR") + " · " + item.question);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="' + title + '">' +
    '<rect width="1200" height="630" fill="#f3f6f0"/>' +
    '<rect x="42" y="42" width="1116" height="546" rx="26" fill="#ffffff"/>' +
    '<text x="90" y="115" font-family="Arial,sans-serif" font-size="23" font-weight="bold" fill="#23563b">KONTA MOY RESEARCH</text>' +
    '<text x="1110" y="115" text-anchor="end" font-family="Arial,sans-serif" font-size="18" fill="#6a846f">ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ 2026</text>' +
    '<text x="90" y="210" font-family="Arial,sans-serif" font-size="35" font-weight="bold" fill="#244333">' + title + '</text>' +
    '<text x="90" y="332" font-family="Arial,sans-serif" font-size="104" font-weight="bold" fill="#1d5636">' + value + '</text>' +
    '<rect x="90" y="362" width="970" height="23" rx="11" fill="#e1e9dd"/>' +
    '<rect x="90" y="362" width="' + String(width) + '" height="23" rx="11" fill="#2c7450"/>' +
    '<text x="90" y="433" font-family="Arial,sans-serif" font-size="20" fill="#4e6856">' + insight + '</text>' +
    '<text x="90" y="487" font-family="Arial,sans-serif" font-size="19" font-weight="bold" fill="#416e50">' + base + '</text>' +
    '<path d="M90 527H1110" stroke="#dce7db"/>' +
    '<text x="90" y="556" font-family="Arial,sans-serif" font-size="15" fill="#738878">Πηγή: kontamou.site/research/greek-retail-2026/results · Εθελοντικό δείγμα, όχι απογραφή.</text>' +
    '</svg>';
}
