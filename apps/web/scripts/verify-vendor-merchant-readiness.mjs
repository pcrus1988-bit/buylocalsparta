import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const source = (path) => readFile(resolve(root, path), "utf8");
const requireText = (text, fragment, label) => {
  if (!text.includes(fragment)) throw new Error(`${label} is missing required contract: ${fragment}`);
};
const forbidText = (text, fragment, label) => {
  if (text.includes(fragment)) throw new Error(`${label} contains unsafe contract: ${fragment}`);
};

const [page, visibility, archiveState, stockFreshness] = await Promise.all([
  source("src/app/vendor/catalog/page.tsx"),
  source("src/lib/vendor-product-visibility-service.ts"),
  source("src/lib/vendor-offer-reactivation-state.ts"),
  source("src/lib/vendor-stock-freshness.ts")
]);

requireText(page, "getVendorAdminArchivedOfferIds", "Vendor catalogue reactivation UI");
requireText(page, "adminArchivedOfferIds.has(item.offerId)", "Vendor catalogue Admin archive projection");
requireText(page, "canToggleVisibility: item.canToggleVisibility && !adminArchivedOfferIds.has(item.offerId)", "Vendor catalogue visibility lock");
forbidText(page, 'item.offerStatus === "archived" && !item.merchantPauseActive', "Vendor catalogue archive classification");

requireText(archiveState, "vendor_product_submissions", "Admin archive provenance projection");
requireText(archiveState, 'String(row.submission_status ?? "") === "archived"', "Admin archive provenance projection");
requireText(archiveState, "ORDER BY (s.vendor_sku=vo.vendor_sku) DESC NULLS LAST,s.updated_at DESC,s.id DESC", "Admin archive provenance ordering");

requireText(visibility, "vendor_product_submissions", "Vendor visibility authorization");
requireText(visibility, "),'') <> 'archived'", "Vendor visibility Admin archive lock");
requireText(visibility, "Admin reactivation may be required", "Vendor visibility rejection semantics");

requireText(stockFreshness, "stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > now()", "Vendor stock freshness projection");
requireText(stockFreshness, 'event: "vendor.stock_freshness_projection_failed"', "Vendor stock freshness fail-soft logging");

console.log("Vendor Merchant readiness and Admin archive boundary contracts OK.");
