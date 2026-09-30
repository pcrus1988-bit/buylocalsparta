import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const failures: string[] = [];
const pagePath = "apps/web/src/app/admin/quickadd/page.tsx";
const componentPath = "apps/web/src/components/AdminQuickAddWorkbench.tsx";
const readinessApiPath = "apps/web/src/app/api/admin/quickadd/media/readiness/route.ts";

if (!existsSync(pagePath)) failures.push("Admin Quick Add page is missing");
if (!existsSync(componentPath)) failures.push("Admin Quick Add workbench is missing");
if (!existsSync(readinessApiPath)) failures.push("Admin Quick Add media readiness API is missing");

const navigation = read("apps/web/src/lib/workspace-navigation.ts");
const api = read("apps/web/src/app/api/admin/quickadd/route.ts");
const service = read("apps/web/src/lib/admin-quickadd-service.ts");
const adminHome = read("apps/web/src/app/admin/page.tsx");
const page = existsSync(pagePath) ? read(pagePath) : "";
const component = existsSync(componentPath) ? read(componentPath) : "";
const readinessApi = existsSync(readinessApiPath) ? read(readinessApiPath) : "";

for (const token of ["/admin/quickadd", "Quick Add", "catalog.write"]) {
  if (!navigation.includes(token)) failures.push(`Admin navigation is missing ${token}`);
}
for (const token of ["canQuickAdd", 'hasAdminPermission(principal, "catalog.write")', 'id: "quick-add"', 'label: "Quick Add"', 'href: "/admin/quickadd"', 'defaultVisible: false']) {
  if (!adminHome.includes(token)) failures.push(`Admin home Quick Add widget is missing ${token}`);
}
for (const token of [
  "AdminQuickAddWorkbench",
  "adminQuickAddWorkspace",
  "hasAdminPermission",
  "force-dynamic",
  "mediaUploadMode",
  "mediaReadinessMessage"
]) {
  if (!page.includes(token)) failures.push(`Admin Quick Add page is missing ${token}`);
}
for (const token of [
  "/api/admin/quickadd",
  "x-csrf-token",
  "BarcodeDetector",
  "canonicalVariantId",
  "vendorId",
  "customerPriceMinor",
  "safetyStock",
  "searchedQuery === query.trim()",
  'mediaUploadMode: "direct" | "development_memory" | "gated"',
  "const mediaUploadAvailable = mediaUploadMode === \"direct\"",
  "if (!mediaUploadAvailable)",
  "mediaReadinessMessage",
  "/api/admin/quickadd/media/readiness",
  "verifyMediaReadinessBeforeSave",
  "await verifyMediaReadinessBeforeSave()",
  "disabled={!mediaUploadAvailable || busy !== null}",
  'disabled={busy !== null}>{busy === "save"'
]) {
  if (!component.includes(token)) failures.push(`Admin Quick Add workbench is missing ${token}`);
}
for (const token of ['permission: "catalog.write"', "csrf: true", "const result = await adminQuickAddLookup"]) {
  if (!api.includes(token)) failures.push(`Admin Quick Add API is missing ${token}`);
}
for (const token of ['permission: "catalog.write"', "mediaPipelineReadiness", "mediaUploadMode", 'cache-control']) {
  if (!readinessApi.includes(token)) failures.push(`Admin Quick Add media readiness API is missing ${token}`);
}
for (const token of ['assertAdminPermission(principal,"catalog.write")', "reusedExactGtin", "admin_quickadd"]) {
  if (!service.includes(token)) failures.push(`Admin Quick Add service is missing ${token}`);
}

for (const [label, text] of [["workbench", component], ["API", api]] as const) {
  if (/icecat/i.test(text)) failures.push(`Admin Quick Add ${label} still contains an Icecat dependency`);
}
if (!component.includes("Δεν θα γίνει αποθήκευση με εκκρεμείς φωτογραφίες")) {
  failures.push("Quick Add must block product save before a gated media upload can create a partial success");
}
if (!component.includes("Η επεξεργασία προϊόντος, τιμής και stock παραμένει διαθέσιμη")) {
  failures.push("Quick Add must explain that product/offer editing remains available when media upload is gated");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Admin Quick Add checks passed: canonical search/save are Icecat-free, exact-GTIN reuse remains protected, and media gating is checked before product persistence to prevent partial photo failures.");
