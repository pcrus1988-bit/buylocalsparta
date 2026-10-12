import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PUBLICATION_BATCH,
  parsePublicationOptions,
  reviewedPublicationPreviewSql,
  reviewedPublicationWriteSql
} from "./hub-gemi-reviewed-publication-policy.ts";

test("publication is dry-run by default and accepts bounded scoped cohorts", () => {
  assert.deepEqual(parsePublicationOptions([], {}), {
    limit: 100, after: "", hub: "", apply: false
  });
  assert.deepEqual(
    parsePublicationOptions(["--limit=25", "--hub=volos", "--after=12345678"], {}),
    { limit: 25, after: "12345678", hub: "volos", apply: false }
  );
  assert.equal(MAX_PUBLICATION_BATCH, 500);
});

test("a publication write needs explicit execution authorization", () => {
  assert.throws(() => parsePublicationOptions(["--apply"], {}), /approval/i);
  assert.deepEqual(parsePublicationOptions(["--apply", "--limit=10"], {
    KM_GEMI_REVIEWED_PUBLICATION_APPROVED: "true"
  }).apply, true);
});

test("reject malformed, duplicated and unbounded CLI arguments", () => {
  for (const args of [
    ["--limit=501"], ["--limit=-1"], ["--limit=1.5"], ["--limit=NaN"],
    ["--limit=0"], ["--hub=volos;DROP"], ["--hub=Αθήνα"],
    ["--after=abcdef12"], ["--after=12345678 OR true"],
    ["--limit=10", "--limit=20"], ["--apply", "--apply"],
    ["--anything"]
  ]) {
    assert.throws(() => parsePublicationOptions(args, {}), undefined, args.join(" "));
  }
});

test("SQL allows only current, independently approved municipality listings", () => {
  for (const snippet of [
    "d.publication_basis='municipality'",
    "d.display_status='unpublished'",
    "d.seo_approved=false",
    "d.registry_verified_at>=now()-interval '30 days'",
    "d.source_checked_at>=now()-interval '90 days'",
    "d.registry_verification_ref ~ '^gemi-opendata-active:sha256:[a-f0-9]{64}
    "d.privacy_review_status='approved'",
    "d.privacy_reviewed_at IS NOT NULL",
    "d.privacy_reviewer_id",
    "d.editorial_reviewed_at IS NOT NULL",
    "d.editorial_reviewer_id",
    "d.publication_evidence_note",
    "m.review_status='reviewed'",
    "m.candidate_hub_distance_km<=hm.radius_km",
    "NOT EXISTS (SELECT 1 FROM public.vendor_businesses",
    "NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects",
    "h.status='converted'",
    "d.directory_hub_slug=$3",
    "d.gemi_number>$2",
    "LIMIT $1"
  ]) {
    assert.ok(reviewedPublicationWriteSql.includes(snippet), "Missing SQL gate: " + snippet);
  }
  assert.ok(reviewedPublicationWriteSql.includes("FOR UPDATE OF d SKIP LOCKED"));
  assert.ok(!reviewedPublicationPreviewSql.includes("UPDATE "));
});

test("the write changes only publication status and updated timestamp", () => {
  const setters = reviewedPublicationWriteSql.match(/SET (.*?) FROM candidates c/s)?.[1] ?? "";
  assert.equal(setters, "display_status='published',seo_approved=true,updated_at=now()");
  assert.ok(!reviewedPublicationWriteSql.includes("DELETE FROM"));
  assert.ok(!reviewedPublicationWriteSql.includes("INSERT INTO"));
  assert.ok(reviewedPublicationWriteSql.includes("seo_approved=true,updated_at=now()"));
  assert.ok(!reviewedPublicationWriteSql.includes("SET privacy_review_status="));
});
",
    "d.privacy_review_status='approved'",
    "d.privacy_reviewed_at IS NOT NULL",
    "d.privacy_reviewer_id",
    "d.editorial_reviewed_at IS NOT NULL",
    "d.editorial_reviewer_id",
    "d.publication_evidence_note",
    "m.review_status='reviewed'",
    "m.candidate_hub_distance_km<=hm.radius_km",
    "NOT EXISTS (SELECT 1 FROM public.vendor_businesses",
    "NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects",
    "h.status='converted'",
    "d.directory_hub_slug=$3",
    "d.gemi_number>$2",
    "LIMIT $1"
  ]) {
    assert.ok(reviewedPublicationWriteSql.includes(snippet), "Missing SQL gate: " + snippet);
  }
  assert.ok(reviewedPublicationWriteSql.includes("FOR UPDATE OF d SKIP LOCKED"));
  assert.ok(!reviewedPublicationPreviewSql.includes("UPDATE "));
});

test("the write changes only publication status and updated timestamp", () => {
  const setters = reviewedPublicationWriteSql.match(/SET (.*?) FROM candidates c/s)?.[1] ?? "";
  assert.equal(setters, "display_status='published',updated_at=now()");
  assert.ok(!reviewedPublicationWriteSql.includes("DELETE FROM"));
  assert.ok(!reviewedPublicationWriteSql.includes("INSERT INTO"));
  assert.ok(!reviewedPublicationWriteSql.includes("SET seo_approved="));
  assert.ok(!reviewedPublicationWriteSql.includes("SET privacy_review_status="));
});
