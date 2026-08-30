import { readFile } from "node:fs/promises";

const files = {
  runtime: "apps/web/src/lib/admin-catalogue-overview-runtime.ts",
  page: "apps/web/src/app/admin/catalogue/page.tsx",
  navigation: "apps/web/src/lib/workspace-navigation.ts"
} as const;

const entries = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]))
) as Record<keyof typeof files, string>;
const failures: string[] = [];
const requireText = (key: keyof typeof files, needle: string, message: string) => {
  if (!entries[key].includes(needle)) failures.push(message);
};
const forbidText = (key: keyof typeof files, needle: string, message: string) => {
  if (entries[key].includes(needle)) failures.push(message);
};

requireText("navigation", 'href: "/admin/catalogue"', "Admin navigation must expose the catalogue overview");
requireText("runtime", "CatalogueOverviewHealth", "Catalogue overview must expose a typed catalogue-health projection");
requireText("runtime", "unlinkedSourceProducts", "Catalogue health must expose source products without approved canonical links");
requireText("runtime", "unmappedAttributeObservations", "Catalogue health must expose unmapped source attributes");
requireText("runtime", "reviewRequiredAttributeObservations", "Catalogue health must expose review-required source attributes");
requireText("runtime", "icecatGreekReadySourceProducts", "Catalogue health must expose Greek-ready Open Icecat evidence");
requireText("runtime", "open_icecat_detail_enrichment_jobs", "Catalogue health must report durable Open Icecat enrichment state");
requireText("runtime", "link.link_status='approved'", "Canonical health must only count approved source-product links");
requireText("runtime", "loc.publish_eligible=TRUE", "Greek-ready Icecat health must reuse the governed publication-quality gate");
requireText("runtime", "subtreeUnmappedAttributeObservations", "Attribute health must roll up through taxonomy subtrees");
requireText("runtime", "subtreeIcecatGreekReadyProducts", "Icecat health must roll up through taxonomy subtrees");
requireText("runtime", "{ readOnly: true }", "Catalogue overview database projection must remain read-only");

forbidText("runtime", "INSERT INTO public.vendor_offers", "Catalogue health must never create vendor offers");
forbidText("runtime", "INSERT INTO public.inventory_balances", "Catalogue health must never create inventory balances");
forbidText("runtime", "UPDATE public.canonical_variants", "Catalogue health must never mutate canonical products");
forbidText("runtime", "DELETE FROM public.catalog", "Catalogue health must never delete source evidence");

requireText("page", "Supplier PIM, Icecat & attribute health", "Admin overview must visibly expose the catalogue-health section");
requireText("page", 'href: "/admin/catalogue-intake"', "Catalogue health must drill into Supplier PIM Intake");
requireText("page", 'href: "/admin/catalogue-intake/attributes"', "Catalogue health must drill into Attribute Mapping");
requireText("page", 'href: "/admin/catalogue-intake/values"', "Catalogue health must drill into Controlled Values");
requireText("page", "Icecat queue", "Admin overview must surface the Open Icecat enrichment queue");
requireText("page", "Unmapped attributes", "Admin overview must surface unmapped attributes as an operational metric");
requireText("page", "Source-health projection unavailable in this runtime", "Database-less previews must explain unavailable source-health data instead of displaying misleading zeroes");
requireText("page", "category.subtreeIcecatGreekReadyProducts", "Category rows must expose subtree Icecat health");
requireText("page", "category.subtreeUnmappedAttributeObservations", "Category rows must expose subtree attribute health");

if (failures.length) {
  throw new Error(`Admin catalogue health verification failed:\n- ${failures.join("\n- ")}`);
}

console.log("Admin catalogue health verification passed: taxonomy, canonical coverage, Supplier PIM, Open Icecat and attribute health remain one read-only operator projection.");
