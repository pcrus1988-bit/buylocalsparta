import { readFileSync } from "node:fs";
import {
  buildLocalDemandIntelligence,
  LOCAL_DEMAND_MIN_ACTORS,
  LOCAL_DEMAND_SOURCE_COVERAGE,
  type DemandSignalRow
} from "../apps/web/src/lib/local-demand-intelligence.ts";
import { quickAddLookupFingerprint } from "../apps/web/src/lib/quickadd-demand-signal.ts";

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
  ...[1, 2, 3, 4, 5].map((actor) => row(actor, "quickAddMiss")),
  ...[1, 2, 3, 4, 5].map((actor) => row(actor, "savedSearch", { canonicalVariantId: undefined }))
]);
const variant = qualified.find((item) => item.kind === "variant");
const category = qualified.find((item) => item.kind === "category");
if (!variant || variant.signals.distinctActors !== 5) throw new Error("Five-actor variant cluster should be visible without leaking actor identities");
if (variant.score !== 45) throw new Error(`Variant score should apply Local Watch ×4, Ask Local ×3 and resolved Quick Add miss ×2; received ${variant?.score}`);
if (!category || category.score !== 60) throw new Error(`Category score should include Local Watch ×4, Ask Local ×3, zero-result ×2, Quick Add miss ×2 and saved search ×1; received ${category?.score}`);
if (category.signals.zeroResultSearch !== 5 || category.signals.quickAddMiss !== 5) throw new Error("Privacy-qualified search and Quick Add demand must be counted");
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

if (LOCAL_DEMAND_SOURCE_COVERAGE.zeroResultSearch !== "active" || LOCAL_DEMAND_SOURCE_COVERAGE.quickAddMiss !== "active") throw new Error("All five intended demand sources must be active");

const gtinFingerprint = quickAddLookupFingerprint({ gtin: "5201234567890" });
const repeatedFingerprint = quickAddLookupFingerprint({ gtin: "5201234567890" });
const otherFingerprint = quickAddLookupFingerprint({ gtin: "5201234567891" });
if (!gtinFingerprint || gtinFingerprint.kind !== "identifier") throw new Error("Quick Add identifier lookup must produce an opaque fingerprint");
if (gtinFingerprint.fingerprint !== repeatedFingerprint?.fingerprint) throw new Error("Quick Add fingerprint must be deterministic so later resolution can join prior misses");
if (gtinFingerprint.fingerprint === otherFingerprint?.fingerprint) throw new Error("Distinct Quick Add identifiers must not collapse to one fingerprint");
if (gtinFingerprint.fingerprint.includes("5201234567890")) throw new Error("Quick Add fingerprint must never contain the raw identifier");

const service = readFileSync("apps/web/src/lib/local-demand-service.ts", "utf8");
const quickAddSignal = readFileSync("apps/web/src/lib/quickadd-demand-signal.ts", "utf8");
const dailyRoute = readFileSync("apps/web/src/app/api/daily/quickadd/route.ts", "utf8");
const adminRoute = readFileSync("apps/web/src/app/api/admin/quickadd/route.ts", "utf8");
const vendorPage = readFileSync("apps/web/src/app/daily/opportunities/page.tsx", "utf8");
const adminPage = readFileSync("apps/web/src/app/admin/demand/page.tsx", "utf8");
const menu = readFileSync("apps/web/src/components/DailySandwichMenu.tsx", "utf8");
if (!service.includes("saved_product_alert_preferences") || !service.includes("counteroffer.requested") || !service.includes("saved_searches") || !service.includes("search.performed") || !service.includes("quickadd.lookup_missed")) throw new Error("Demand service must read all five durable signal families");
if (!service.includes("quickadd.lookup_resolved") || !service.includes("lookupFingerprint") || !service.includes("quickAddMiss")) throw new Error("Quick Add misses must join to later canonical resolution by opaque fingerprint");
if (service.includes("source_metadata") || service.includes("ss.query->>'q'") || service.includes("metadata->>'query'") || service.includes("postcode")) throw new Error("Demand aggregation must not select rich Ask Local data, raw search text, or postcode");
if (!quickAddSignal.includes("lookupFingerprint") || !quickAddSignal.includes("lookupKind") || !quickAddSignal.includes("ON CONFLICT (dedupe_key)")) throw new Error("Quick Add instrumentation must persist only deduped privacy-safe lookup metadata");
if (quickAddSignal.includes("rawQuery") || quickAddSignal.includes("rawGtin:") || quickAddSignal.includes("queryText")) throw new Error("Quick Add analytics metadata must not persist raw lookup values");
if (!dailyRoute.includes("recordQuickAddDemandSignal") || !adminRoute.includes("recordQuickAddDemandSignal")) throw new Error("Both Vendor Daily and Admin Quick Add lookups must emit demand signals");
if (!service.includes("back_in_stock_enabled=true") || !service.includes("alerts_enabled=true")) throw new Error("Demand service must use active customer intent, not dormant rows");
if (!vendorPage.includes("Δεν εμφανίζουμε ποιος") || !vendorPage.includes("minimumActors") || !vendorPage.includes("Quick Add miss")) throw new Error("Vendor workspace must explain its privacy boundary and Quick Add signal");
if (!adminPage.includes("Local Demand Intelligence") || !adminPage.includes("Privacy boundary") || !adminPage.includes("Quick Add miss")) throw new Error("Admin demand workspace must expose the five-source intelligence and privacy boundary");
if (!menu.includes('href="/daily/opportunities"')) throw new Error("Daily navigation must expose Local opportunities");
for (const forbidden of ["customerEmail", "recipientName", "shipping_address", "voiceTranscript", "referenceImageDataUrl"]) {
  if (vendorPage.includes(forbidden)) throw new Error(`Vendor page must not expose private field ${forbidden}`);
}

console.log("Local-commerce demand intelligence contracts verified with all five sources active");
