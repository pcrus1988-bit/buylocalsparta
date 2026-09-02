import { readFileSync } from "node:fs";
import { fitSeoTitleToTemplate } from "../apps/web/src/lib/seo-title.ts";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const failures: string[] = [];
const requireText = (source: string, contract: string, message: string) => {
  if (!source.includes(contract)) failures.push(message);
};
const requirePattern = (source: string, contract: RegExp, message: string) => {
  if (!contract.test(source)) failures.push(message);
};

const homepage = read("apps/web/src/app/page.tsx");
const layout = read("apps/web/src/app/layout.tsx");
const metadata = read("apps/web/src/lib/seo-metadata.ts");

for (const label of ["visitor-key", "featured-products", "hero-slides", "promo-ctas", "visible-categories"]) {
  requirePattern(homepage, new RegExp(`homepageSectionOrFallback\\(\\s*\\"${label}\\"`), `Homepage must fail soft for ${label}`);
}
requireText(homepage, "console.error(`[homepage] ${label} unavailable; rendering fallback`, error)", "Homepage fail-soft paths must remain observable in runtime logs");
requireText(homepage, "getCrawlerHomepageCatalogCards", "Crawler homepage projection must remain intact after resilience hardening");
requireText(homepage, "getHomepageCatalogCards", "Customer homepage projection must remain intact after resilience hardening");

const template = "%s | ΚΟΝΤΑ ΜΟΥ Σπάρτη";
const shortTitle = "Βιβλιοπωλείο Σπάρτης";
if (fitSeoTitleToTemplate(shortTitle, template) !== shortTitle) failures.push("Short generated SEO titles must remain unchanged");
const vendorTitle = "AD CAR DESIGN (Δαμιανός Αλέξανδρος Ν.) · Τοπική επιχείρηση";
const fittedVendorTitle = fitSeoTitleToTemplate(vendorTitle, template);
if (fittedVendorTitle !== "AD CAR DESIGN (Δαμιανός Αλέξανδρος Ν.)") failures.push("Generated vendor titles must remove the redundant local-business suffix before fitting the title template");
const longTitle = "Εξαιρετικά Μεγάλη Επωνυμία Τοπικής Επιχείρησης Με Πολλά Πρόσθετα Περιγραφικά Στοιχεία Και Νομική Μορφή";
const fitted = fitSeoTitleToTemplate(longTitle, template);
const rendered = template.replace("%s", fitted);
if (rendered.length > 68) failures.push(`Generated title governor exceeded 68 characters (${rendered.length})`);
if (!longTitle.startsWith(fitted)) failures.push("Generated title governor must only shorten the real entity name, never invent replacement text");
requirePattern(
  metadata,
  /fitSeoTitleToTemplate\(\s*[A-Za-z_$][\w$]*\s*,\s*input\.settings\.titleTemplate\s*\)/,
  "Governed generated metadata must apply the title-length governor"
);
requireText(metadata, "!input.override?.title", "Explicit administrator title overrides must not be silently shortened");

for (const contract of [
  '"@type": "WebSite"',
  '"@type": "OnlineStore"',
  "publisher: { \"@id\": organizationId }",
  "KONTA_MOY_EMAIL_COMPANY.legalName",
  "KONTA_MOY_EMAIL_COMPANY.taxNumber",
  "KONTA_MOY_EMAIL_COMPANY.gemiNumber",
  "kontamou-sparta-logo.webp",
  '"@type": "ContactPoint"',
  '"@type": "City", name: "Σπάρτη"',
  'replaceAll("<", "\\\\u003c")'
]) requireText(layout, contract, `Root entity graph is missing ${contract}`);

if (failures.length) {
  console.error("SEO homepage/entity resilience verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("SEO homepage/entity resilience verification passed.");