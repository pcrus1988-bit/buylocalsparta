import { readFileSync } from "node:fs";
import { researchVendorIndexEligibility, vendorIndexEligible } from "../apps/web/src/lib/seo-visibility-policy.ts";

const failures: string[] = [];
const base = {
  name: "Βιβλιοπωλείο Σπάρτης",
  directoryStatus: "research",
  location: {
    name: "Βιβλιοπωλείο Σπάρτης",
    addressLine1: "Κωνσταντίνου Παλαιολόγου 1",
    locality: "Σπάρτη",
    postcode: "23100",
    phone: "+302731000000",
    verified: false
  },
  categoryCodes: [],
  researchCategory: "Βιβλιοπωλεία",
  taxonomies: [{ majorSlug: "books", majorLabel: "Βιβλία", subSlug: "bookstores", subLabel: "Βιβλιοπωλεία" }],
  canonicalCount: 0
} as const;

const multiSource = {
  ...base,
  id: "research-multi-source",
  research: {
    sourceKind: "merchant_census",
    sourceCount: 2,
    sourceTypes: ["merchant_census", "active_online_shop"],
    checkedAt: "2026-08-23",
    storefrontStatus: "active"
  }
} as const;
const multi = researchVendorIndexEligibility(multiSource as never, { enabled: true, minimumScore: 7 });
if (!multi.eligible) failures.push(`Two independently sourced research signals must pass automatic indexing: ${multi.reasons.join(", ")} / ${multi.blockingReasons.join(", ")}`);
if (!multi.reasons.some((reason) => reason.includes("multiple independent source types"))) failures.push("Multi-source eligibility must explain its corroboration signal");

const singleSource = {
  ...base,
  id: "research-single-source",
  research: {
    sourceKind: "merchant_census",
    sourceCount: 1,
    sourceTypes: ["merchant_census"],
    checkedAt: "2026-08-23",
    storefrontStatus: "active"
  }
} as const;
const single = researchVendorIndexEligibility(singleSource as never, { enabled: true, minimumScore: 7 });
if (!single.eligible) failures.push(`A strong single-source local-business dossier must remain indexable when it passes the substantive quality gate: ${single.reasons.join(", ")} / ${single.blockingReasons.join(", ")}`);
if (single.blockingReasons.length !== 0) failures.push("Single-source evidence must remain a confidence signal rather than an entity blocker");
if (!single.reasons.some((reason) => reason.includes("additional independent corroboration recommended"))) failures.push("Single-source eligibility must retain an actionable corroboration recommendation");

const duplicateTypes = researchVendorIndexEligibility({
  ...singleSource,
  id: "research-duplicate-source-types",
  research: { ...singleSource.research, sourceCount: 3, sourceTypes: ["merchant_census", "merchant_census", "merchant_census"] }
} as never, { enabled: true, minimumScore: 7 });
if (!duplicateTypes.eligible) failures.push("Repeated records from one source type must not deindex an otherwise strong local-business dossier");
if (duplicateTypes.reasons.some((reason) => reason.includes("multiple independent source types"))) failures.push("Repeated records from one source type must not masquerade as independent corroboration");

const incomplete = researchVendorIndexEligibility({
  ...singleSource,
  id: "research-incomplete",
  location: {
    ...singleSource.location,
    addressLine1: "",
    postcode: ""
  }
} as never, { enabled: true, minimumScore: 5 });
if (incomplete.eligible) failures.push("Incomplete local-business dossiers must remain noindex even when they have a source record");
if (!incomplete.blockingReasons.some((reason) => reason.includes("incomplete local address"))) failures.push("Incomplete dossiers must explain their hard local-address blocker");

const partner = { ...multiSource, id: "partner-active", directoryStatus: "partner" } as const;
if (!vendorIndexEligible(partner as never, { enabled: false, minimumScore: 7 })) failures.push("Active partner indexing must remain independent of the research-only quality switch");

const legacySynthetic = {
  ...base,
  id: "legacy-synthetic-fixture",
  research: { checkedAt: "2026-08-23", storefrontStatus: "active" }
} as const;
if (!researchVendorIndexEligibility(legacySynthetic as never, { enabled: true, minimumScore: 7 }).eligible) {
  failures.push("Legacy synthetic SEO fixtures without DB evidence metadata must remain compatible");
}

const projection = readFileSync(new URL("../apps/web/src/lib/public-vendor-directory.ts", import.meta.url), "utf8");
for (const required of [
  "vendor_research_source_links",
  "vendor_research_source_records",
  "research_source_count",
  "research_source_types",
  "sourceCount: asCount(row.research_source_count)",
  "sourceTypes: textArray(row.research_source_types)"
]) {
  if (!projection.includes(required)) failures.push(`Public research-vendor projection is missing evidence contract: ${required}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Research-vendor SEO evidence policy OK: strong local-business dossiers remain indexable with single-source evidence while incomplete/closed records stay blocked and multi-source corroboration remains visible as a confidence signal.");
