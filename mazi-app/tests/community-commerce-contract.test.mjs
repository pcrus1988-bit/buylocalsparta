import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(name)=>readFileSync(new URL(name,import.meta.url),"utf8");
const edge=read("../supabase/functions/mazi-member-api/index.ts");
const sql=read("../sql/019_community_member_permissions_and_rate_limits.sql");
const api=read("../lib/mazi-api.ts");
const actions=read("../app/community-actions.ts");
const members=read("../app/members/page.tsx");
const market=read("../app/marketplace/page.tsx");
const forum=read("../app/forum/page.tsx");
const reply=read("../app/forum/[id]/page.tsx");
const chat=read("../app/livechat/page.tsx");
const refresh=read("../app/livechat/live-chat-refresh.tsx");
const report=read("../app/community/report/page.tsx");

test("every MAZI community operation validates the Auth JWT and fresh KYB verification",()=>{
 assert.match(edge,/await admin\.auth\.getUser\(match\[1\]\)/);
 assert.match(edge,/if\(!m\|\|m\.status!=="verified"\|\|!m\.identity_verified_at\|\|!m\.gemi_number\)return null/);
 assert.match(edge,/app\?\.status==="approved"/);
 for(const operation of ["community_overview","marketplace_list","marketplace_my","marketplace_create",
  "marketplace_close","forum_list","forum_create","forum_thread","forum_reply",
  "chat_list","chat_send","community_report"]){
  assert.ok(edge.includes(`operation==="${operation}"`),operation);
 }
 assert.match(edge,/if\(!await verifiedMember\(user\.id\)\)return out\(\{error:"not_verified"\},403\)/);
 assert.match(edge,/No price, checkout, invoice, grant or money movement/);
 assert.match(edge,/if\(operation==="apply"\)return out\(\{error:"invitation_required"\},403\)/);
});

test("community author attribution shows only approved verified businesses, never email",()=>{
 assert.match(edge,/\.eq\("status","verified"\)\.not\("identity_verified_at","is",null\)/);
 assert.match(edge,/\.select\("id,applicant_user_id,business_name,status"\)/);
 assert.match(edge,/\.eq\("status","approved"\)/);
 assert.match(edge,/a\.applicant_user_id===m\.user_id/);
 assert.doesNotMatch(edge.slice(edge.indexOf("async function communityVisible"),edge.indexOf("Deno.serve")),/contact_email|tax_number|service_secret/);
});

test("community is private and inserts are database serialized per verified member",()=>{
 for(const table of ["mazi_marketplace_listings","mazi_forum_threads","mazi_forum_replies",
  "mazi_chat_messages","mazi_community_reports"]){
  assert.match(sql,new RegExp("BEFORE INSERT ON public\\."+table));
 }
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/m\.status='verified'/);
 assert.match(sql,/a\.status='approved' AND a\.applicant_user_id=actor/);
 assert.match(sql,/MAZI_CHAT_RATE_LIMIT/);
 assert.match(sql,/MAZI_FORUM_RATE_LIMIT/);
 assert.match(sql,/MAZI_LISTING_RATE_LIMIT/);
 assert.match(sql,/MAZI_FORUM_THREAD_LOCKED/);
 assert.match(sql,/REVOKE ALL ON public\.mazi_marketplace_listings/);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
});

test("all member postings go through server-authenticated MAZI Edge operations",()=>{
 assert.match(actions,/await db\.auth\.getUser\(\)/);
 assert.match(api,/authorization:`Bearer \$\{session\.access_token\}`/);
 for(const key of ["marketplace_create","marketplace_close","forum_create",
  "forum_reply","chat_send","community_report"]){
  assert.ok(actions.includes(`("${key}"`)||actions.includes(`>("${key}"`),key);
 }
 assert.match(actions,/validId\(resource_id\)/);
 assert.match(edge,/\.eq\("member_user_id",user\.id\)\.eq\("status","active"\)/);
 assert.match(edge,/\.eq\("channel","lobby"\)/);
 assert.match(edge,/\.eq\("thread_id",threadId\)/);
});

test("real marketplace, forum, livechat and report pages are implemented and private",()=>{
 for(const page of [market,forum,reply,chat,report]){
  assert.match(page,/db\.auth\.getUser\(\)/);
  assert.match(page,/redirect\("\/join"\)/);
  assert.match(page,/robots:\{index:false,follow:false\}/);
 }
 assert.match(market,/publishMaziListing/);
 assert.match(market,/closeMaziListing/);
 assert.match(forum,/publishMaziThread/);
 assert.match(reply,/replyMaziThread/);
 assert.match(chat,/sendMaziChat/);
 assert.match(report,/reportMaziCommunity/);
 assert.match(refresh,/setInterval\(poll,8000\)/);
 assert.match(refresh,/document\.visibilityState==="visible"/);
 assert.match(members,/maziMemberRequest<\{activity:/);
 assert.match(members,/communityEnabled/);
 assert.doesNotMatch(chat,/demo message|test member|fake business|mock conversation/i);
});

test("moderation reports never auto-delete and financial systems stay unchanged",()=>{
 assert.match(edge,/resource_type,resource_id,reason/);
 assert.match(edge,/report_not_saved/);
 assert.doesNotMatch(edge.slice(edge.indexOf('if(operation==="community_report")'),edge.indexOf('if(operation==="acknowledge_grant_offer")')),/\.delete\(\)|mazi_fund_ledger|finance_activated=true/);
});
