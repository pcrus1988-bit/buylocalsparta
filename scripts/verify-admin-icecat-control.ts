import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const navigation = read("apps/web/src/lib/workspace-navigation.ts");
const presentation = read("apps/web/src/lib/admin-navigation.ts");
const privateRoutes = read("apps/web/src/lib/site-navigation.ts");
const dashboard = read("apps/web/src/app/admin/page.tsx");
const controlPage = read("apps/web/src/app/admin/icecat/page.tsx");
const controlRuntime = read("apps/web/src/lib/admin-icecat-control.ts");
const fileImport = read("apps/web/src/app/admin/catalogue-intake/import/page.tsx");
const catalogue = read("apps/web/src/app/admin/catalogue/page.tsx");
const assistantPages = read("apps/web/src/lib/admin-assistant/page-registry.ts");
const assistantInsights = read("apps/web/src/lib/admin-assistant/ingestion-intelligence.ts");

const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const navEntry = navigation.match(/\{\s*label:\s*"Icecat Control Center",\s*href:\s*"\/admin\/icecat",[^}]*\}/)?.[0] ?? "";
expect(navEntry.includes('permission: "catalog.read"'), "Icecat must be a canonical catalog.read Admin navigation destination");
expect(presentation.includes('["/admin/icecat", { order: 3, label: "Icecat Control Center" }]'), "Catalogue navigation must visibly present Icecat Control Center");
expect(privateRoutes.includes('"/admin/icecat"'), "Icecat Admin route must be explicitly non-indexable");

for (const contract of [
  'id: "icecat-control"',
  'href: "/admin/icecat"',
  'defaultVisible: true',
  "adminIcecatWorkspace(principal)",
  "adminOpenIcecatHealth(principal)"
]) expect(dashboard.includes(contract), `Admin dashboard is missing Icecat contract: ${contract}`);

for (const contract of [
  'title: "Admin · Icecat Control Center"',
  "adminIcecatWorkspace(principal)",
  "adminOpenIcecatHealth(principal)",
  "adminOpenIcecatIngestionStatus(principal)",
  "<IcecatSettingsForm",
  "Provider run history",
  "Detail enrichment pipeline"
]) expect(controlPage.includes(contract), `Dedicated Icecat page is missing contract: ${contract}`);

expect(!controlRuntime.includes("open_icecat_bulk_ingestion_runs"), "Settings/source availability must not fail when run-history storage is unavailable");
expect(!fileImport.includes("adminOpenIcecatIngestionStatus"), "File Import must not duplicate Icecat operational reads");
expect(!fileImport.includes("Detail enrichment queue"), "File Import must not duplicate the Icecat queue dashboard");
expect(fileImport.includes('href="/admin/icecat"'), "File Import must hand Icecat operations off to the dedicated workspace");
expect(catalogue.includes('href="/admin/icecat"'), "Catalogue overview must link directly to Icecat Control Center");
expect(assistantPages.includes('"/admin/icecat": { pageType: "icecat_control"'), "Admin Assistant must recognize the dedicated Icecat context");
expect(!assistantInsights.includes('href: "/admin/catalogue-intake/import"'), "Icecat assistant recommendations must target Icecat Control Center");

if (failures.length) {
  console.error(`Admin Icecat Control Center acceptance failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Admin Icecat Control Center acceptance passed.");
