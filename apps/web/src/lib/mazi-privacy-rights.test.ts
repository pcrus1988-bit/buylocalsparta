import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const svc=read("./mazi-privacy-rights.ts");
const sql=read("../../../../mazi-app/sql/mazi_privacy_rights_register_20261028.sql");
const page=read("../app/admin/mazi/privacy-requests/page.tsx");
const hardening=read("../../../../mazi-app/sql/mazi_privacy_rights_evidence_hardening_20261028.sql");
const actions=read("../app/admin/mazi/privacy-requests/actions.ts");
const operations=read("./mazi-operations.ts");
const operationsPage=read("../app/admin/mazi/operations/page.tsx");

test("live GDPR rights register has real receipt-based deadlines and auditable extension",()=>{
 assert.match(sql,/received_on date NOT NULL/);
 assert.match(svc,/received_on \+ CASE WHEN extension_notified_on IS NULL THEN interval '1 month'/);
 assert.match(svc,/ELSE interval '3 months'/);
 assert.match(svc,/d<=record.original_due_on/);
 assert.match(svc,/d<=today\(\)/);
 assert.match(svc,/\["complexity","number_of_requests"\]/);
 assert.match(page,/ΕΚΠΡΟΘΕΣΜΑ/);
});
test("rights evidence stays server-only and no identity or message body is collected",()=>{
 for(const key of ["getAdminSession","assertAdminCsrf","requireMarketplaceSuperAdminRole"]){
  assert.ok(actions.includes(key),key);
 }
 assert.match(svc,/await marketplaceMaziActor\(principal\)/);
 assert.match(page,/isMaziSuperAdmin\(principal\)/);
 assert.match(sql,/REVOKE ALL ON TABLE public.mazi_privacy_requests/);
 assert.match(sql,/ALTER TABLE public.mazi_privacy_request_events ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/BEFORE UPDATE OR DELETE ON public.mazi_privacy_request_events/);
 assert.doesNotMatch(sql,/\b(contact_email|person_name|request_body|id_document|ip_address)\b/);
 assert.match(svc,/MAZI-DSAR-/);
 assert.match(hardening,/BEFORE UPDATE ON public.mazi_privacy_requests/);
 assert.match(hardening,/NEW.received_on/);
 assert.match(hardening,/MAZI GDPR receipt metadata is immutable/);
 assert.match(hardening,/BEFORE UPDATE ON public.mazi_privacy_requests/);
 assert.match(svc,/effective_on::text,documented_reason,response_outcome/);
 assert.match(svc,/event_kind,evidence_ref,actor_user_id,effective_on/);
 assert.match(svc,/validEvidence\(input.evidenceRef\)/);
});
test("human identity evidence, actual response and legal hold never execute deletion",()=>{
 assert.match(svc,/identity_status==="verified"/);
 assert.match(svc,/record.identity_status==="cannot_verify"/);
 assert.match(svc,/legal_hold_active=true/);
 assert.match(svc,/legal_hold_active=false/);
 assert.match(svc,/event_kind,evidence_ref,actor_user_id/);
 assert.doesNotMatch(svc,/DELETE FROM|TRUNCATE|DROP TABLE|pg_cron/i);
 assert.match(page,/ΔΕΝ ΕΚΤΕΛΕΙ ΔΙΑΓΡΑΦΗ/);
 assert.match(page,/ev.effective_on/);
});
test("MAZI legal-gate evidence textarea limits match server-side validation",()=>{
 assert.match(operations,/text.length<40\|\|text.length>700/);
 assert.match(operationsPage,/40–700 χαρακτήρες/);
 assert.match(operationsPage,/maxLength=\{700\}/);
 assert.match(operations,/if\(evidence.length>1200\)/);
 assert.match(operationsPage,/href="\/admin\/mazi\/privacy-requests"/);
});
