import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

test("production SEO authority is locked to kontamou.site", () => {
  const publicOrigin = read("apps/web/src/lib/public-origin.ts");
  const nextConfig = read("apps/web/next.config.ts");

  assert.match(publicOrigin, /PRODUCTION_PUBLIC_ORIGIN = "https:\/\/kontamou\.site"/);
  assert.match(publicOrigin, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(nextConfig, /value: "kontamou\.info"/);
  assert.match(nextConfig, /destination: "https:\/\/kontamou\.site\/:path\*"/);
  assert.match(nextConfig, /permanent: true/);
});

test("homepage preserves clean semantic and structured SEO signals", () => {
  const homepage = read("apps/web/src/app/page.tsx");
  const layout = read("apps/web/src/app/layout.tsx");

  assert.doesNotMatch(homepage, /\/shops\?status=partner/);
  assert.match(homepage, /<h1 className=\{styles\.heroTitle\}>Μια ολόκληρη πόλη\.<br \/><em>Κοντά σου\.<\/em><\/h1>/);
  assert.match(homepage, /Η τοπική αγορά της Σπάρτης — online, αλλά ανθρώπινα\./);
  assert.match(homepage, /Σπάρτη <span>· Αλλαγή περιοχής<\/span>/);
  assert.match(homepage, /"@type": "FAQPage"/);
  assert.match(homepage, /"@type": "WebPage"/);
  assert.match(homepage, /inLanguage: "el-GR"/);
  assert.match(homepage, /isPartOf: \{ "@id": "https:\/\/kontamou\.site\/#website" \}/);
  assert.match(homepage, /unstable_cache/);
  assert.match(homepage, /visibleCategories\.map\(\(category\) =>/);
  assert.match(homepage, /href=\{`\/category\/\$\{category\.slug\}`\}/);
  assert.match(homepage, /<a href="\/shop">Όλα τα προϊόντα/);
  assert.match(homepage, /<a href="\/shops">Τα καταστήματα/);
  assert.match(homepage, /<a href="\/ask-local">Ask Local/);
  assert.match(layout, /apple: \[\{ url: "\/brand\/kontamou-sparta-logo\.webp" \}\]/);
});

test("footer links are rendered once rather than duplicated for breakpoints", () => {
  const footer = read("apps/web/src/components/SiteFooter.tsx");
  const css = read("apps/web/src/app/footer-polish.css");

  assert.match(footer, /className="site-footer-nav"/);
  assert.doesNotMatch(footer, /site-footer-nav-desktop/);
  assert.doesNotMatch(footer, /site-footer-nav-mobile/);
  assert.doesNotMatch(css, /site-footer-nav-desktop/);
  assert.doesNotMatch(css, /site-footer-nav-mobile/);
});