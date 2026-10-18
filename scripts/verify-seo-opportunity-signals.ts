import assert from "node:assert/strict";
import { isOwnBrandQuery, rankSeoKeywordOpportunities, researchCensusSearchExposure } from "../apps/web/src/lib/seo-opportunity-signals.ts";

const sample = [
  { key: "αθλητικά παπούτσια σπάρτη", clicks: 1, impressions: 120, ctr: 1 / 120, position: 7 },
  { key: "παιδικά παπούτσια σπάρτη", clicks: 2, impressions: 85, ctr: 2 / 85, position: 14 },
  { key: "κοντά μου", clicks: 0, impressions: 200, ctr: 0, position: 5 },
  { key: "kontamou", clicks: 0, impressions: 250, ctr: 0, position: 8 },
  { key: "μια αδύναμη ερώτηση", clicks: 0, impressions: 4, ctr: 0, position: 6 },
  { key: "πολύ χαμηλή θέση", clicks: 0, impressions: 150, ctr: 0, position: 65 },
  { key: "επιστροφές προϊόντων", clicks: 15, impressions: 150, ctr: 0.10, position: 2 }
] as const;

const ranked = rankSeoKeywordOpportunities(sample);
assert.equal(ranked.length, 2, "Only nonbrand queries with enough evidence and plausible opportunity qualify");
assert.equal(ranked[0]?.kind, "snippet_review");
assert.equal(ranked[1]?.kind, "striking_distance");
assert.ok(isOwnBrandQuery("KONTA MOU"));
assert.ok(isOwnBrandQuery("ΚΟΝΤΑ ΜΟΥ"));
assert.equal(rankSeoKeywordOpportunities(sample, 0).length, 0);
assert.equal(rankSeoKeywordOpportunities([{ key: "χαλασμένα δεδομένα", clicks: 1, impressions: 50, ctr: Number.NaN, position: 8 }]).length, 0);

assert.deepEqual(researchCensusSearchExposure([
  { key: "/vendor/vendor_research_census_0193", clicks: 3, impressions: 170, ctr: 3 / 170, position: 4.5 },
  { key: "/vendor/vendor_research_census_0064", clicks: 2, impressions: 113, ctr: 2 / 113, position: 4.4 },
  { key: "/category/shoes", clicks: 10, impressions: 500, ctr: 0.02, position: 12 }
]), { pages: 2, impressions: 283, clicks: 5 });

console.log("SEO read-only keyword opportunity scoring and census exposure checks passed.");
