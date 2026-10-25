import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const moderation=read("../../apps/web/src/lib/mazi-community-moderation.ts");
const form=read("../../apps/web/src/app/admin/mazi/moderation/actions.ts");
const queue=read("../../apps/web/src/app/admin/mazi/moderation/page.tsx");
const api=read("../supabase/functions/mazi-member-api/index.ts");
const sql=read("../sql/022_inquiry_hidden_listing_lock.sql");
test("Super Admin moderation uses persisted role, CSRF and auditable transactions",()=>{
 assert.match(moderation,/marketplaceMaziActor\(principal\)/);
 assert.match(form,/assertAdminCsrf\(principal/);
 assert.match(moderation,/client\.query\("BEGIN"\)/);
 assert.match(moderation,/client\.query\("COMMIT"\)/);
 assert.match(moderation,/insert into public\.mazi_audit_events/);
 assert.match(moderation,/mazi_audit_events\(marketplace_actor_user_id,entity_type/);
 assert.doesNotMatch(moderation,/mazi_audit_events\(actor_user_id,entity_type/);
 assert.match(queue,/isMaziSuperAdmin\(principal\)/);
});
test("member-facing content excludes hidden records and private inquiry RPC enforces it",()=>{
 assert.match(api,/is\("hidden_at",null\)/);
 assert.match(sql,/l\.hidden_at is null/);
 assert.match(sql,/p_sender_user_id/);
 assert.match(sql,/grant execute on function public\.mazi_open_inquiry\(uuid,uuid,text\) to service_role/);
});
