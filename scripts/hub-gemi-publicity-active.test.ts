import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { officialGemiPublicityUrl } from "../apps/web/src/lib/hub-gemi-publicity.ts";
import { reviewedPublicationWriteSql } from "./hub-gemi-reviewed-publication-policy.ts";
import { directGemiUpdateSql, exactGemiIdentityMatch } from "./hub-gemi-direct-identity-policy.ts";

function source(path: string) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

test("GEMI external source URL is stable and never derived from research contacts", () => {
  assert.equal(officialGemiPublicityUrl("143321901000"),
    "https://publicity.businessportal.gr/company/143321901000");
  for (const bad of ["", "123", "12345678@x", "143321901000?a=b", "143321901000/../../admin",
    "https://evil.com", "12345\n12345678"]) {
    assert.equal(officialGemiPublicityUrl(bad), undefined);
  }
});

test("GEMI-only directory public projection must not select contacts or private evidence", () => {
  const lib = source("apps/web/src/lib/hub-gemi-directory.ts");
  const page = source("apps/web/src/app/hubs/[hubSlug]/business/[id]/page.tsx");
  assert.match(lib, /registry_verification_ref ~ '\^gemi-opendata-active:sha256/);
  const match = lib.match(/const DIRECTORY_COLUMNS = \[([\s\S]*?)\]\.join/);
  assert.ok(match);
  for (const forbidden of ["email","phone","afm","source_record_ref","research_contact"]) {
    assert.ok(!match[1].includes(forbidden), forbidden);
  }
  assert.ok(page.includes("officialGemiPublicityUrl(business.gemiNumber)"));
  assert.ok(page.includes("<strong>Email:</strong>"));
  assert.ok(page.includes("<strong>Τηλέφωνο:</strong>"));
  assert.ok(page.includes("Δες την επίσημη μερίδα ΓΕΜΗ"));
  assert.ok(!page.includes("business.email"));
  assert.ok(!page.includes("business.phone"));
});

test("only actively verified, independently reviewed, classified records may publish", () => {
  assert.ok(reviewedPublicationWriteSql.includes(
    "d.registry_verification_ref ~ '^gemi-opendata-active:sha256:[a-f0-9]{64}$'"
  ));
  assert.ok(reviewedPublicationWriteSql.includes("d.sector_code IN"));
  assert.ok(reviewedPublicationWriteSql.includes("d.privacy_review_status='approved'"));
  assert.ok(reviewedPublicationWriteSql.includes("d.seo_approved=true"));
  assert.ok(directGemiUpdateSql.includes("official-gemi-live-active-v2"));
  const valid = {
    gemi_number:"143321901000", legal_name:"ΔΟΚΙΜΗ ΑΕ",
    postcode:"38221",registry_municipality_id:"123",directory_hub_slug:"volos",
    matched_activity_codes:["47.71"]
  };
  const base = {
    arGemi:143321901000,coNameEl:"ΔΟΚΙΜΗ Α.Ε.",zipCode:"38221",
    municipality:{id:123},status:{descr:"Ενεργή"},autoRegistered:true,
    activities:[{activity:{id:"47.71"}}]
  };
  assert.equal(exactGemiIdentityMatch(valid,base),true);
  assert.equal(exactGemiIdentityMatch(valid,{...base,status:{descr:"Διαγραμμένη"}}),false);
  assert.equal(exactGemiIdentityMatch(valid,{...base,autoRegistered:false}),true);
  assert.equal(exactGemiIdentityMatch(valid,{...base,activities:[]}),false);
});
