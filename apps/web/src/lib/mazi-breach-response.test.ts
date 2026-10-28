import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {parseBreachInstant,breachDeadline,needsBreachLateReason} from "./mazi-breach-time.ts";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const service=read("./mazi-breach-response.ts");
const sql=read("../../../../mazi-app/sql/mazi_breach_response_register_20261028.sql");
const page=read("../app/admin/mazi/breaches/page.tsx");
const actions=read("../app/admin/mazi/breaches/actions.ts");
const retention=read("./mazi-retention-reviews.ts");

test("legal 72-hour countdown uses actual awareness instant, not the calendar or intake timestamp",()=>{
 const start=parseBreachInstant("2026-10-24T13:00:00+03:00");
 assert.ok(start);
 assert.equal(start.toISOString(),"2026-10-24T10:00:00.000Z");
 assert.equal(breachDeadline(start).toISOString(),"2026-10-27T10:00:00.000Z");
 const before=parseBreachInstant("2026-10-27T11:59:59+02:00");
 const after=parseBreachInstant("2026-10-27T12:00:01+02:00");
 assert.ok(before&&after);
 assert.equal(needsBreachLateReason(start,before),false);
 assert.equal(needsBreachLateReason(start,after),true);
 assert.equal(parseBreachInstant("2026-10-28T11:00:00"),null);
 assert.equal(parseBreachInstant("not-a-timestamp"),null);
});
test("incident entries are server-only, immutable, auditable, and public clients denied",()=>{
 for(const value of ["getAdminSession","requireMarketplaceSuperAdminRole","assertAdminCsrf"]){
  assert.ok(actions.includes(value),value);
 }
 assert.match(page,/isMaziSuperAdmin\(principal\)/);
 assert.match(service,/marketplaceMaziActor\(principal\)/);
 assert.match(sql,/ALTER TABLE public\.mazi_breach_cases ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.mazi_breach_cases/);
 assert.match(sql,/BEFORE UPDATE OR DELETE\s+ON public\.mazi_breach_case_events/);
 assert.match(sql,/Original awareness and breach intake evidence are immutable/);
 assert.match(sql,/GRANT SELECT,INSERT ON public\.mazi_breach_case_events/);
 assert.doesNotMatch(sql,/GRANT DELETE|FOR DELETE TO|TO anon,authenticated/i);
 assert.doesNotMatch(service,/DELETE FROM|TRUNCATE|DROP TABLE|fetch\(|resend\.emails/i);
});
test("risk classification and external notification evidence are human-driven",()=>{
 for(const v of ["not_personal_data","unlikely_risk","risk","high_risk",
 "authority_notified","subjects_notified","subjects_exception","late_reason_ref"]){
  assert.ok(sql.includes(v),v);
 }
 assert.match(service,/needsBreachLateReason\(new Date\(row\.aware_at\),effective!\)/);
 assert.match(service,/fail\(Boolean\(lateReason\)&&evidence\(lateReason!\)\)/);
 assert.match(service,/row\.risk_assessment!=="pending"/);
 assert.match(page,/ΔΕΝ ΑΠΟΣΤΕΛΛΕΤΑΙ ΑΥΤΟΜΑΤΗ ΓΝΩΣΤΟΠΟΙΗΣΗ/);
 assert.match(page,/ΑΠΔΠΧ/);
});
test("breach metadata is part of legal retention map, not unreviewed extra data",()=>{
 assert.match(retention,/"mazi_breach_cases","mazi_breach_case_events"/);
 assert.match(retention,/unmappedSources\.length===0/);
});
