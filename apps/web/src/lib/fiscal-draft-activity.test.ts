import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 formatFiscalDraftMinorEuro,summarizeFiscalDraftActivity,
 FISCAL_M45_ACTIVITY_SQL
} from "./fiscal-draft-activity.ts";
import type {FiscalDraftActivityBucket} from "./fiscal-draft-activity.ts";
const row: FiscalDraftActivityBucket={
 day:"2026-10-20",lane:"b2b",source:"console",
 draft_count:"4",known_amount_count:"3",gross_minor:"14599"
};
test("M45 sums real 30-day grouped records without rounding away unknown values",()=>{
 const summary=summarizeFiscalDraftActivity([
  row,
  {...row,day:"2026-10-19",lane:"b2c",source:"external_api",
   draft_count:"2",known_amount_count:"0",gross_minor:"0"},
  {...row,day:"2026-10-18",lane:"b2b",source:"console",
   draft_count:"5",known_amount_count:"5",gross_minor:"1"}
 ]);
 assert.equal(summary.count,11n);
 assert.equal(summary.knownAmountCount,8n);
 assert.equal(summary.missingAmountCount,3n);
 assert.equal(summary.grossMinor,14600n);
 assert.equal(summary.byLane.find(r=>r.key==="b2b")?.count,9n);
 assert.equal(summary.bySource.find(r=>r.key==="console")?.grossMinor,14600n);
 assert.deepEqual(summary.daily.map(r=>r.key),
  ["2026-10-18","2026-10-19","2026-10-20"]);
 assert.equal(formatFiscalDraftMinorEuro(summary.grossMinor),"146,00 €");
 assert.equal(formatFiscalDraftMinorEuro(99999999999999999n),"999.999.999.999.999,99 €");
});
test("M45 empty account is not misrepresented as revenue",()=>{
 const activity=summarizeFiscalDraftActivity([]);
 assert.deepEqual({count:activity.count,unknown:activity.missingAmountCount},
  {count:0n,unknown:0n});
 assert.deepEqual(activity.byLane,[]);
 assert.equal(formatFiscalDraftMinorEuro(0n),"0,00 €");
});
test("M45 strictly rejects forged, duplicate, oversized or internally conflicting groups",()=>{
 const bad:unknown[]=[
  {...row,day:"2026-02-30"},
  {...row,day:"x"},
  {...row,lane:"issued"},
  {...row,source:"unknown"},
  {...row,draft_count:"-1"},
  {...row,known_amount_count:"5"},
  {...row,gross_minor:"1e8"},
  {...row,draft_count:"0"},
  {...row,known_amount_count:"0",gross_minor:"1"}
 ];
 for(const value of bad){
  assert.throws(()=>summarizeFiscalDraftActivity([value as FiscalDraftActivityBucket]),
   /FISCAL_M45_/);
 }
 assert.throws(()=>summarizeFiscalDraftActivity([row,row]),/DUPLICATE_BUCKET/);
 assert.throws(()=>summarizeFiscalDraftActivity(Array(373).fill(row)),/INVALID_BUCKET_SCOPE/);
 assert.throws(()=>formatFiscalDraftMinorEuro(-1n),/NEGATIVE_AMOUNT/);
});
test("M45 SQL is parameterized, tenant joined, limited to 30 days and still non-fiscal",()=>{
 for(const fragment of [
  "FROM fiscal_document_intakes d",
  "JOIN fiscal_memberships m",
  "m.user_id=$2",
  "u.disabled_at IS NULL",
  "d.organization_id=$1",
  "d.status='draft'",
  "d.created_at>=now()-interval '30 days'",
  "d.lane=$3",
  "d.source=$4",
  "group",
  "COALESCE(sum(safe_gross_minor),0)",
  "AT TIME ZONE 'Europe/Athens'"
 ])assert.ok(FISCAL_M45_ACTIVITY_SQL.toLowerCase().includes(fragment.toLowerCase()),fragment);
 assert.ok(!/UPDATE\s+|INSERT\s+|DELETE\s+|\bissued\b|SET\s+ROLE/i.test(
  FISCAL_M45_ACTIVITY_SQL));
 const page=readFileSync(new URL("../app/timologio/drafts/page.tsx",import.meta.url),"utf8");
 assert.ok(page.includes("getFiscalMerchantDraftActivity(actor,account.id,filters)"));
 assert.ok(page.includes("Δεν αντιπροσωπεύουν πωλήσεις"));
 assert.ok(page.includes("missingAmountCount"));
});
