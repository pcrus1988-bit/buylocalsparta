import { readFileSync } from "node:fs";
import {
  buildLocalDemandIntelligence,
  LOCAL_DEMAND_MIN_ACTORS,
  LOCAL_DEMAND_SOURCE_COVERAGE,
  type DemandSignalRow
} from "../apps/web/src/lib/local-demand-intelligence.ts";

function row(actor: number, source: DemandSignalRow["source"], overrides: Partial<DemandSignalRow> = {}): DemandSignalRow {
  return {
    actorKey: `user:${actor}`,
    source,
    canonicalVariantId: "cv_tripod",
    categoryCode: "photo-accessories",
    title: "Tripod",
    categoryName: "Photo accessories",
    availableLocal: false,
    ...overrides
  };
}

const fourActors = [1, 2, 3, 4].map((actor) => row(actor, "localWatch"));
if (buildLocalDemandIntelligence(fourActors).length !== 0) throw new Error("Demand clusters below five distinct actors must be suppressed");
if (LOCAL_DEMAND_MIN_ACTORS !== 5) throw new Error("Vendor privacy threshold must default to five actors");

const qualified = buildLocalDemandIntelligence([
  ...[1, 2, 3, 4, 5].map((actor) => row(actor, "localWatch")),
  ...[1, 2, 3, 4, 5].map((actor) => row(actor, "askLocal")),
  ...[1, 2, 3, 4, 5].map((actor) => row(actor, "zeroResultSearch", { canonicalVariantId: undefined })),
  ...[1, 2, 3, 4, 5].map((actor) => row(actor, "savedSearch", { canonicalVariantId: undefined }))
]);
const variant = qualified.find((item) => item.kind === "variant");
const category = qualified.find((item) => item.kind === "category");
if (!variant || variant.signals.distinctActors !== 5) throw new Error("Five-actor variant cluster should be visible without leaking actor identities");
if (variant.score !== 35) throw new Error(`Variant score should apply Local Watch ×4 and Ask Local ×3; received ${variant.score}`);
if (!category || category.score !== 50) throw new Error(`Category score should include Local Watch ×4, Ask Local ×3, zero-result ×2 and saved search ×1; received ${category?.score}`);
if (category.signals.zeroResultSearch !== 5) throw new Error("Privacy-qualified zero-result category demand must be counted");
if (variant.availableLocal !== false) throw new Error("Local availability gap must survive aggregation");

const vendorFiltered = buildLocalDemandIntelligence([
  ...[1, 2, 3, 4, 5].map((actor) => row(actor, "localWatch")),
  ...[6, 7, 8, 9, 10].map((actor) => row(actor, "localWatch", { canonicalVariantId: "cv_other", categoryCode: "unrelated", title: "Other", categoryName: "Other category" }))
], {
  vendorCategoryCodes: new Set(["photo-accessories"]),
  vendorCanonicalVariantIds: new Set(["cv_tripod"])
});
if (vendorFiltered.some((item) => item.kind === "variant")) throw new Error("Vendor opportunities must exclude products the vendor already offers");
if (vendorFiltered.length !== 1 || vendorFiltered[0]?.kind !== "category" || vendorFiltered[0].categoryCode !== "photo-accessories") throw new Error("Vendor opportunity filtering must retain only relevant qualified categories");

if (LOCAL_DEMAND_SOURCE_COVERAGE.zeroResultSearch !== "active") throw new Error("Persisted privacy-qualified zero-result search must be active");
if (LOCAL_DEMAND_SOURCE_COVERAGE.quickAddMiss !== "not_instrumented") throw new Error("Unpersisted Quick Add misses must not be presented as active");

const service = readFileSync("apps/web/src/lib/local-demand-service.ts", "utf8");
const vendorPage = readFileSync("apps/web/src/app/daily/opportunities/page.tsx", "utf8");
const adminPage = readFileSync("apps/web/src/app/admin/demand/page.tsx", "utf8");
const menu = readFileSync("apps/web/src/components/DailySandwichMenu.tsx", "utf8");
if (!service.includes("saved_product_alert_preferences") || !service.includes("counteroffer.requested") || !service.includes("saved_searches") || !service.includes("search.performed")) throw new Error("Demand service must read all four proven durable signal families");
if (!service.includes("resultCount") || !service.includes("zeroResultSearch")) throw new Error("Zero-result demand must come from actor-bearing analytics events");
if (service.includes("source_metadata") || service.includes("ss.query->>'q'") || service.includes("metadata->>'query'") || service.includes("postcode")) throw new Error("Demand aggregation must not select rich Ask Local data, raw search text, or postcode");
if (!service.includes("back_in_stock_enabled=true") || !service.includes("alerts_enabled=true")) throw new Error("Demand service must use active customer intent, not dormant rows");
if (!vendorPage.includes("Δεν εμφανίζουμε ποιος") || !vendorPage.includes("minimumActors") || !vendorPage.includes("Zero-result")) throw new Error("Vendor workspace must explain its privacy boundary and qualified search gap signal");
if (!adminPage.includes("Local Demand Intelligence") || !adminPage.includes("Privacy boundary")) throw new Error("Admin demand workspace must expose the aggregated intelligence and privacy boundary");
if (!menu.includes('href="/daily/opportunities"')) throw new Error("Daily navigation must expose Local opportunities");
for (const forbidden of ["customerEmail", "recipientName", "shipping_address", "voiceTranscript", "referenceImageDataUrl"]) {
  if (vendorPage.includes(forbidden)) throw new Error(`Vendor page must not expose private field ${forbidden}`);
}

console.log("Local-commerce demand intelligence contracts verified");
