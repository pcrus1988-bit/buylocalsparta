import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const edge=read("../supabase/functions/mazi-member-api/index.ts");
const sql020=read("../sql/020_member_private_inquiries.sql");
const sql021=read("../sql/021_community_moderation.sql");
const sql022=read("../sql/022_inquiry_hidden_listing_lock.sql");
const sql023=read("../sql/023_private_message_reporting.sql");
const moderation=read("../../apps/web/src/lib/mazi-community-moderation.ts");
const moderationAction=read("../../apps/web/src/app/admin/mazi/moderation/actions.ts");
const inbox=read("../app/inbox/page.tsx");
const marketplace=read("../app/marketplace/page.tsx");
const dash=read("../app/dashboard/page.tsx");

test("existing production marketplace/forum/chat operations remain intact",()=>{
 for(const op of ["community_overview","marketplace_list","marketplace_my","marketplace_create","marketplace_close",
 "forum_list","forum_create","forum_thread","forum_reply","chat_list","chat_send","community_report"]){
  assert.ok(edge.includes('operation==="'+op+'"'),'missing production '+op);
 }
 assert.match(edge,/communityVisible/);
 assert.match(edge,/if\(!await verifiedMember\(user\.id\)\)return out\(\{error:"not_verified"\},403\)/);
});
test("private inquiries are only readable by participants using member JWT",()=>{
 for(const op of ["community_inbox","community_start_inquiry","community_reply_inquiry"]){
  assert.ok(edge.includes('operation==="'+op+'"'),'missing private '+op);
 }
 assert.match(edge,/\["community_inbox","community_start_inquiry","community_reply_inquiry","community_inquiry_action"\]\.includes\(operation\)/);
 assert.match(edge,/sender_user_id\.eq\.\$\{user\.id\},recipient_user_id\.eq\.\$\{user\.id\}/);
 assert.match(edge,/inquiry\.sender_user_id!==user\.id&&inquiry\.recipient_user_id!==user\.id/);
 assert.match(edge,/table==="mazi_listing_inquiries"\?"sender_user_id":"member_user_id"/);
 assert.match(edge,/admin\.rpc\("mazi_open_inquiry"/);
 assert.match(inbox,/maziMemberRequest<CommunityInbox>\("community_inbox"\)/);
});
test("database creates transactionally complete inquiries without browser Data API access",()=>{
 for(const name of ["mazi_listing_inquiries","mazi_inquiry_messages"]){
  assert.ok(sql020.includes("create table if not exists public."+name));
  assert.ok(sql020.includes("alter table public."+name+" enable row level security"));
 }
 assert.match(sql020,/revoke all on public\.mazi_listing_inquiries,public\.mazi_inquiry_messages from PUBLIC,anon,authenticated/);
 assert.match(sql020,/security invoker/);
 assert.match(sql020,/grant execute on function public\.mazi_open_inquiry\(uuid,uuid,text\) to service_role/);
 assert.match(sql022,/l\.hidden_at is null/);
});
test("moderation hides content from real existing operations and records marketplace admin audit",()=>{
 assert.match(sql021,/add column if not exists hidden_at/);
 assert.match(edge,/\.is\("hidden_at",null\)/);
 assert.match(moderation,/marketplaceMaziActor\(principal\)/);
 assert.match(moderationAction,/assertAdminCsrf\(principal/);
 assert.match(moderation,/client\.query\("BEGIN"\)/);
 assert.match(moderation,/client\.query\("COMMIT"\)/);
 assert.match(moderation,/mazi_audit_events\(marketplace_actor_user_id,entity_type/);
 assert.doesNotMatch(moderation,/mazi_audit_events\(actor_user_id,entity_type/);
});
test("private message reporting validates conversation participation and supports moderator concealment",()=>{
 assert.match(sql023,/resource_type in \('listing','thread','reply','chat','inquiry'\)/);
 assert.match(edge,/resource_type==="inquiry"/);
 assert.match(edge,/msg\.member_user_id===user\.id/);
 assert.match(edge,/inquiry\.sender_user_id!==user\.id&&inquiry\.recipient_user_id!==user\.id/);
 assert.match(moderation,/inquiry:"public\.mazi_inquiry_messages"/);
 assert.match(inbox,/reportInquiryMessage/);
 assert.match(marketplace,/startInquiry/);
 assert.match(dash,/community_overview/);
});
