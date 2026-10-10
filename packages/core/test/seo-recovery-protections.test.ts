import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const diagnostics = readFileSync(new URL("../../../apps/web/src/lib/seo-gsc-diagnostics.ts", import.meta.url), "utf8");
const vendorPage = readFileSync(new URL("../../../apps/web/src/app/vendor/[id]/page.tsx", import.meta.url), "utf8");

test("historic category noindex evidence is rechecked from the latest Google inspection", () => {
  assert.match(diagnostics, /SELECT DISTINCT ON \(route\) route,captured_at AS last_inspected_at,indexing_state/);
  assert.match(diagnostics, /ORDER BY route,captured_at DESC/);
  assert.match(diagnostics, /CASE WHEN indexing_state='BLOCKED_BY_META_TAG' THEN 0 ELSE 1 END/);
});

test("retired product sitemap shard is not left submitted to Search Console", () => {
  assert.match(diagnostics, /new URL\("\/sitemaps\/products\/64\.xml"/);
});

test("completed Google inspections are counted separately from history-sync errors", () => {
  assert.match(diagnostics, /let inspected = 0;/);
  assert.match(diagnostics, /inspected \+= 1;/);
  assert.match(diagnostics, /historyError = errorText\(error\)/);
  assert.match(diagnostics, /\n    inspected,\n/);
  assert.doesNotMatch(diagnostics, /candidates\.length - errors\.length/);
});

test("legacy vendor ID URLs bypass expensive metadata but preserve permanent redirects", () => {
  const metadata = vendorPage.slice(vendorPage.indexOf("export async function generateMetadata"), vendorPage.indexOf("export default async function VendorPage"));
  const page = vendorPage.slice(vendorPage.indexOf("export default async function VendorPage"));
  assert.match(metadata, /if \(id !== vendor\.slug\) return \{\};/);
  assert.ok(metadata.indexOf("if (id !== vendor.slug) return {};") < metadata.indexOf("getCachedSeoGlobalSettingsSnapshot()"));
  assert.match(page, /if \(id !== vendor\.slug\) permanentRedirect\(`\/vendor\/\$\{encodeURIComponent\(vendor\.slug\)\}\`\);/);
});
