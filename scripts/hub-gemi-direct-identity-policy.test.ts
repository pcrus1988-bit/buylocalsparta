import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDirectGemiOptions, directGemiCandidatesSql, directGemiUpdateSql,
  exactGemiIdentityMatch, MAX_DIRECT_GEMI_BATCH, GEMI_PROVIDER_SPACING_MS,
  type CandidateIdentity
} from "./hub-gemi-direct-identity-policy.ts";

const candidate: CandidateIdentity = {
  gemi_number: "001234567890", legal_name: "ΠΑΡΑΔΕΙΓΜΑ Α.Ε.",
  postcode: "38221", registry_municipality_id: "123", directory_hub_slug: "volos",
  matched_activity_codes: ["47.71"]
};
const valid = {
  arGemi: 1234567890,
  coNameEl: "Παράδειγμα ΑΕ",
  zipCode: "38221",
  municipality: { id: 123, descr: "Βόλος" },
  status: { id: 1, descr: "Ενεργή" },
  autoRegistered: true,
  activities: [{ activity: { id: "47.71" } }],
  persons: [{ personName: "not used" }]
};

test("requires explicit authorization for any live calls or identity writes", () => {
  assert.deepEqual(parseDirectGemiOptions([], {}), { apply: false, limit: 3, after: "", hub: "" });
  assert.throws(() => parseDirectGemiOptions(["--apply"], {}), /approval/i);
  assert.equal(parseDirectGemiOptions(["--hub=volos", "--limit=5", "--apply"], {
    KM_GEMI_OFFICIAL_IDENTITY_VERIFY_APPROVED: "true"
  }).apply, true);
  assert.equal(MAX_DIRECT_GEMI_BATCH, 12);
  assert.ok(GEMI_PROVIDER_SPACING_MS >= 30000);
});

test("rejects invalid input, excess loads and repeated arguments", () => {
  const cases = [
    ["--limit=13"], ["--limit=0"], ["--limit=-2"], ["--limit=1.5"],
    ["--after=a123"], ["--after=12345678 OR 1=1"], ["--hub=volos;DROP"],
    ["--hub=Αθήνα"], ["--hub=-volos"], ["--hub=volos-"],
    ["--limit=2", "--limit=3"], ["--apply", "--apply"], ["--unexpected"]
  ];
  for (const args of cases) {
    assert.throws(() => parseDirectGemiOptions(args, {}), undefined, args.join(" "));
  }
});

test("accepts exact GEMI/name/municipality/postcode and active status only", () => {
  assert.equal(exactGemiIdentityMatch(candidate, valid), true);
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, coNameEl: "OTHER CO" }), false);
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, arGemi: 1234567891 }), false);
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, zipCode: "12345" }), false);
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, municipality: { id: 124 } }), false);
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, municipality: undefined }), false);
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, status: { descr: "Διαγραμμένη" } }), false);
  // autoRegistered=false means incomplete self-registration, not inactivity.
  // Exact status, legal identity, municipality and category evidence still qualify.
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, autoRegistered: false }), true);
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, activities: [] }), false);
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, activities: [{activity:{id:"47.72"}}] }), false);
  assert.equal(exactGemiIdentityMatch(candidate, { ...valid, status: undefined }), false);
  assert.equal(exactGemiIdentityMatch(candidate, {}), false);
  assert.equal(exactGemiIdentityMatch(candidate, null), false);
});

test("SQL never modifies public status, rights, SEO or location evidence", () => {
  for (const check of [
    "registry_verified_at=now()", "registry_verification_ref=$5",
    "registry_verified_by='automation:official-gemi-live-active-v2'",
    "d.registry_municipality_id=$4", "d.directory_hub_slug=$6",
    "d.display_status='unpublished'", "d.registry_verified_at IS NULL",
    "m.review_status='reviewed'", "m.candidate_hub_distance_km<=hub.radius_km",
    "NOT EXISTS (SELECT 1 FROM public.vendor_businesses",
    "NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects"
  ]) {
    assert.ok(directGemiUpdateSql.includes(check), "Missing check: " + check);
  }
  const changed = directGemiUpdateSql.match(/SET (.*?) WHERE d.gemi_number=/s)?.[1] ?? "";
  assert.ok(!changed.includes("display_status"));
  assert.ok(!changed.includes("seo_approved"));
  assert.ok(!changed.includes("privacy_review_status"));
  assert.ok(!changed.includes("latitude"));
  assert.ok(directGemiCandidatesSql.includes("LIMIT $1"));
  assert.ok(directGemiCandidatesSql.includes("WHERE d.gemi_number>$2"));
  assert.ok(directGemiCandidatesSql.includes("AND ($3='' OR d.directory_hub_slug=$3)"));
});
