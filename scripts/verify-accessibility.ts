import { adminPage, customerPage, joinPage, publicSeoPage, vendorPage } from "../dev/ui.ts";

type Page = { name: string; html: string; lang: "el" | "en" };

const pages: Page[] = [
  { name: "customer", html: customerPage(), lang: "el" },
  { name: "merchant onboarding", html: joinPage(), lang: "el" },
  { name: "vendor workspace", html: vendorPage(), lang: "el" },
  { name: "admin workspace", html: adminPage(), lang: "el" },
  {
    name: "public Greek SEO page",
    lang: "el",
    html: publicSeoPage({ lang: "el", title: "Δοκιμή", description: "Προσβάσιμη σελίδα", canonicalUrl: "https://example.test/el/test", heading: "Δοκιμή" })
  },
  {
    name: "public English SEO page",
    lang: "en",
    html: publicSeoPage({ lang: "en", title: "Test", description: "Accessible page", canonicalUrl: "https://example.test/en/test", heading: "Test" })
  }
];

const failures: string[] = [];
for (const page of pages) {
  expect(page, new RegExp(`<html\\s+lang=["']${page.lang}["']`, "i"), "correct document language");
  expect(page, /class=["']skipLink["'][^>]+href=["']#main-content["']/i, "keyboard skip link");
  expect(page, /<main[^>]+id=["']main-content["'][^>]*tabindex=["']-1["']/i, "focusable main landmark");
  expect(page, /<nav[^>]+aria-label=/i, "labelled navigation landmark");
  expect(page, /:focus-visible\{[^}]*outline:/i, "visible keyboard focus style");
  expect(page, /prefers-reduced-motion:reduce/i, "reduced-motion support");

  for (const match of page.html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attrs = match[2];
    if (!/\bid=["'][^"']+["']/i.test(attrs) && !/\baria-label(?:ledby)?=["'][^"']+["']/i.test(attrs)) {
      failures.push(`${page.name}: ${match[1]} control lacks a stable id/ARIA name`);
    }
  }

  for (const match of page.html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (!text && !/\baria-label=["'][^"']+["']/i.test(attrs)) failures.push(`${page.name}: button has no accessible name`);
  }
}

// Dynamic workspaces render forms after login/API calls. This shared enhancer is
// intentionally part of the development shell and must remain present until the
// production React forms provide native label associations directly.
for (const page of pages.slice(0, 4)) {
  if (!page.html.includes("function applyA11y")) failures.push(`${page.name}: dynamic form accessibility enhancer is missing`);
  if (!page.html.includes("MutationObserver")) failures.push(`${page.name}: dynamic accessibility updates are not observed`);
}

if (failures.length) {
  console.error("Accessibility structural checks failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Accessibility structural checks passed for ${pages.length} rendered interfaces.`);

function expect(page: Page, pattern: RegExp, label: string): void {
  if (!pattern.test(page.html)) failures.push(`${page.name}: missing ${label}`);
}
