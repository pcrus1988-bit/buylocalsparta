import { existsSync, readFileSync } from "node:fs";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const failures: string[] = [];
const requiredRoutes = ["about", "delivery-pickup", "fairness", "help", "how-it-works", "payments-security", "privacy-controls", "returns-refunds", "join/requirements"] as const;
const publicPages = [
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/shop/page.tsx",
  "apps/web/src/app/shops/page.tsx",
  "apps/web/src/app/advice/page.tsx",
  "apps/web/src/app/ask-local/page.tsx",
  "apps/web/src/app/join/page.tsx",
  ...requiredRoutes.map((route) => `apps/web/src/app/${route}/page.tsx`)
];

if (!existsSync(`${root}/apps/web/src/app/not-found.tsx`)) failures.push("Missing useful public 404 recovery page");

for (const route of requiredRoutes) {
  const path = `apps/web/src/app/${route}/page.tsx`;
  if (!existsSync(`${root}/${path}`)) {
    failures.push(`Missing public route /${route}`);
    continue;
  }
  const source = read(path);
  if (!source.includes(`canonical: "/${route}"`)) failures.push(`/${route} is missing canonical metadata`);
  const destinations = [...source.matchAll(/"(\/[a-z][^"]*)"/g)].map((match) => match[1]).filter((destination) => destination !== `/${route}`);
  if (new Set(destinations).size < 3) failures.push(`/${route} needs at least three substantive onward destinations`);
  if (!source.includes("<SiteFooter />")) failures.push(`/${route} is missing the shared public footer`);
}

const home = read("apps/web/src/app/page.tsx");
if (home.includes('href="#shop"') || home.includes('href="/#shop"')) failures.push("Homepage still uses #shop as a primary navigation destination");
if (!home.includes('href="/shop">Ανακάλυψε προϊόντα')) failures.push("Homepage product CTA must lead to the full catalog route");

const header = read("apps/web/src/components/SiteHeader.tsx");
for (const destination of ["/shop", "/shops", "/how-it-works", "/advice", "/ask-local"]) {
  if (!header.includes(`href="${destination}"`)) failures.push(`Primary navigation is missing ${destination}`);
}

const footer = read("apps/web/src/components/SiteFooter.tsx");
for (const destination of ["/how-it-works", "/fairness", "/delivery-pickup", "/payments-security", "/returns-refunds", "/privacy-controls", "/about", "/help", "/join"]) {
  if (!footer.includes(`"${destination}"`)) failures.push(`Public footer is missing ${destination}`);
}

const sitemap = read("apps/web/src/app/sitemap.ts");
for (const route of requiredRoutes) if (!sitemap.includes(`\`${"${origin}"}/${route}\``)) failures.push(`Sitemap is missing /${route}`);

const product = read("apps/web/src/app/product/[id]/page.tsx");
if (product.includes('href="/advice">Πώς λειτουργεί')) failures.push("Product page still misroutes the how-it-works CTA to advice");
if (!product.includes('href="/how-it-works">Πώς λειτουργεί')) failures.push("Product page is missing the real how-it-works destination");

const join = read("apps/web/src/app/join/page.tsx");
if (join.includes('href="#eligibility"')) failures.push("Partner onboarding still uses the explanatory eligibility anchor as its primary CTA");
if (!join.includes('href="/join/requirements"')) failures.push("Partner onboarding is missing the operational readiness route");

for (const path of publicPages) {
  if (!existsSync(`${root}/${path}`)) continue;
  const source = read(path);
  for (const match of source.matchAll(/href="(\/[^"]*)"/g)) {
    const href = match[1];
    if (href.startsWith("/api/") || href.includes("${")) continue;
    const pathname = href.split(/[?#]/, 1)[0];
    if (pathname === "/") continue;
    const target = `apps/web/src/app${pathname}/page.tsx`;
    if (!existsSync(`${root}/${target}`)) failures.push(`${path} links to missing static route ${pathname}`);
  }
}

if (failures.length) {
  console.error("Public navigation checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Public navigation checks passed: ${requiredRoutes.length} content routes, shared navigation, sitemap coverage and non-looping CTAs verified.`);
