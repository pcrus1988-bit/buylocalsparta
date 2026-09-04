import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const productionLayout = readFileSync(join(process.cwd(), "apps/web/src/app/layout.tsx"), "utf8");
const productionA11yCss = readFileSync(join(process.cwd(), "apps/web/src/app/accessibility-controls.css"), "utf8");
const productionLauncher = readFileSync(join(process.cwd(), "apps/web/src/components/SiteUtilityLauncher.tsx"), "utf8");
const productionPreferences = readFileSync(join(process.cwd(), "apps/web/src/components/AccessibilityPreferences.tsx"), "utf8");

if (!productionLayout.includes('href="#main-content"')) failures.push("production root: missing keyboard skip link");
if (!productionLayout.includes('id="main-content"')) failures.push("production root: missing skip-link target");
if (!productionLayout.includes("tabIndex={-1}")) failures.push("production root: skip-link target is not programmatically focusable");
if (!productionA11yCss.includes(".skip-link")) failures.push("production root: skip link has no visible-focus styling");
if (!productionA11yCss.includes("--a11y-focus-ring")) failures.push("production root: robust focus ring token is missing");
if (!productionA11yCss.includes("forced-colors: active")) failures.push("production root: forced-colors support is missing");
if (productionLauncher.includes('role="menu"') || productionLauncher.includes('role="menuitem"')) failures.push("site utility launcher: menu semantics require unsupported arrow-key behavior");
if (!productionLauncher.includes('role="group"')) failures.push("site utility launcher: accessible controls group is missing");
if (!productionLauncher.includes("firstActionRef")) failures.push("site utility launcher: opening focus management is missing");
if (!productionPreferences.includes("closeButtonRef")) failures.push("accessibility preferences: opening focus management is missing");
if (!productionPreferences.includes("returnFocusRef")) failures.push("accessibility preferences: focus restoration is missing");
if (!productionPreferences.includes('event.key !== "Escape"')) failures.push("accessibility preferences: Escape handling is missing");

if (failures.length) {
  console.error("Accessibility structural checks failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Accessibility structural checks passed for ${pages.length} rendered interfaces and the production shell.`);

function expect(page: Page, pattern: RegExp, label: string): void {
  if (!pattern.test(page.html)) failures.push(`${page.name}: missing ${label}`);
}
