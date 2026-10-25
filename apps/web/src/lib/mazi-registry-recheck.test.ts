import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const local=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const approval=local("../app/admin/mazi/interest/page.tsx");
const actions=local("../app/admin/mazi/interest/actions.ts");
const admin=local("./mazi-interest-admin.ts");
const invite=local("./mazi-invitation-admin.ts");
const gemi=local("./gemi-runtime.ts");
const migration=local("../../../../mazi-app/sql/024_interest_registry_live_rechecks.sql");

test("stale GEMI approval visibly offers real server-side refresh and stays disabled",()=>{
 assert.ok(approval.includes("Επανέλεγχος ΓΕΜΗ τώρα"));
 assert.ok(approval.includes("refreshMaziInterestRegistryAction"));
 assert.ok(approval.includes("disabled={!registryCurrent(a)}"));
 assert.ok(approval.includes("Απαιτείται πρώτα επανέλεγχος ΓΕΜΗ"));
 assert.ok(actions.includes("assertAdminCsrf(principal,value(form,\"csrf\"))"));
 assert.ok(actions.includes("requireMarketplaceSuperAdminRole(principal)"));
});

test("refresh must hit official provider and never elevate stale cached data",()=>{
 assert.ok(gemi.includes("options.forceFresh"));
 assert.ok(gemi.includes("!options.forceFresh && cached"));
 assert.ok(admin.includes("resolveGemiCompanyByAfm(original.tax_number,Date.now(),{forceFresh:true})"));
 assert.ok(admin.includes('checked.fromCache'));
 assert.ok(admin.includes("checked.gemiNumber!==original.gemi_number"));
 assert.ok(admin.includes("checked.taxNumber!==original.tax_number"));
 assert.ok(admin.includes("marketplaceMaziActor(principal)"));
});

test("new evidence is immutable, admin-only and used for approval plus invitation",()=>{
 assert.ok(migration.includes("ALTER TABLE public.mazi_interest_registry_rechecks ENABLE ROW LEVEL SECURITY"));
 assert.ok(migration.includes("REVOKE ALL ON TABLE public.mazi_interest_registry_rechecks FROM PUBLIC,anon,authenticated,service_role"));
 assert.ok(migration.includes("BEFORE UPDATE OR DELETE"));
 assert.ok(admin.includes("INSERT INTO public.mazi_interest_registry_rechecks"));
 assert.ok(admin.includes("LEFT JOIN LATERAL"));
 assert.ok(invite.includes("LEFT JOIN LATERAL"));
 assert.ok(!admin.includes("UPDATE public.mazi_interest_applications SET registry_checked_at"));
});
