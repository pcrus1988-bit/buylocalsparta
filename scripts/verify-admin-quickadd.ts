import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const failures: string[] = [];
const pagePath = "apps/web/src/app/admin/quickadd/page.tsx";
const componentPath = "apps/web/src/components/AdminQuickAddWorkbench.tsx";
const icecatServicePath = "apps/web/src/lib/admin-quickadd-icecat-service.ts";

if (!existsSync(pagePath)) failures.push("Admin Quick Add page is missing");
if (!existsSync(componentPath)) failures.push("Admin Quick Add workbench is missing");
if (!existsSync(icecatServicePath)) failures.push("Admin Quick Add Icecat service is missing");

const navigation = read("apps/web/src/lib/workspace-navigation.ts");
const api = read("apps/web/src/app/api/admin/quickadd/route.ts");
const service = read("apps/web/src/lib/admin-quickadd-service.ts");
const icecatService = existsSync(icecatServicePath) ? read(icecatServicePath) : "";
const adminHome = read("apps/web/src/app/admin/page.tsx");
const page = existsSync(pagePath) ? read(pagePath) : "";
const component = existsSync(componentPath) ? read(componentPath) : "";

for (const token of ["/admin/quickadd", "Quick Add", "catalog.write"]) if (!navigation.includes(token)) failures.push(`Admin navigation is missing ${token}`);
for (const token of ["canQuickAdd", 'hasAdminPermission(principal, "catalog.write")', 'id: "quick-add"', 'label: "Quick Add"', 'href: "/admin/quickadd"', 'defaultVisible: false']) if (!adminHome.includes(token)) failures.push(`Admin home Quick Add widget is missing ${token}`);
for (const token of ["AdminQuickAddWorkbench", "adminQuickAddWorkspace", "hasAdminPermission", "force-dynamic"]) if (!page.includes(token)) failures.push(`Admin Quick Add page is missing ${token}`);
for (const token of ["/api/admin/quickadd", "x-csrf-token", "BarcodeDetector", "canonicalVariantId", "vendorId", "customerPriceMinor", "safetyStock", "searchedQuery === query.trim()", "Apply Icecat data", "draftWithIcecat", "icecatGtin", "Lookup in Icecat"]) if (!component.includes(token)) failures.push(`Admin Quick Add workbench is missing ${token}`);
for (const token of ["vendorSku: current.vendorSku", "price: current.price", "onHand: current.onHand", "safetyStock: current.safetyStock", "visible: current.visible"]) if (!component.includes(token)) failures.push(`Icecat apply must preserve vendor/commercial field: ${token}`);
for (const token of ['permission: "catalog.write"', "csrf: true", "adminQuickAddIcecatLookup", "icecatGtin", "Promise.all"]) if (!api.includes(token)) failures.push(`Admin Quick Add API is missing ${token}`);
for (const token of ['assertAdminPermission(principal,"catalog.write")', "reusedExactGtin", "admin_quickadd"]) if (!service.includes(token)) failures.push(`Admin Quick Add service is missing ${token}`);
for (const token of ['assertAdminPermission(principal, "catalog.write")', "open_icecat", "open_icecat_index_products", "open_icecat_detail_enrichment_jobs", "catalog_source_product_localizations", "readOnly: true", "catalog_gtin_is_valid"]) if (!icecatService.includes(token)) failures.push(`Admin Quick Add Icecat service is missing ${token}`);
if (icecatService.includes("ICECAT_USERNAME") || icecatService.includes("ICECAT_API_TOKEN") || icecatService.includes("OpenIcecatClient")) failures.push("Quick Add must not call Icecat provider credentials/client directly; it must read governed source evidence");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Admin Quick Add checks passed: protected canonical lookup/reuse, barcode scan, governed Icecat preview/apply, vendor/commercial field preservation, vendor assignment, publishing and stock controls verified.");
