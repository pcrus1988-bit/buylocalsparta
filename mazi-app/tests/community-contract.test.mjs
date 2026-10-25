import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const sql=read("../sql/019_member_community.sql");
const api=read("../supabase/functions/mazi-member-api/index.ts");
const server=read("../app/api/community/route.ts");
const dashboard=read("../app/dashboard/page.tsx");
test("community has a real persistent schema and all five tables require privileged gateway access",()=>{
 for(const table of ["mazi_marketplace_listings","mazi_forum_threads","mazi_forum_replies","mazi_chat_messages","mazi_community_reports"]){
  assert.match(sql,new RegExp("create table if not exists public\\."+table));
  assert.match(sql,new RegExp("alter table public\\."+table+" enable row level security"));
 }
 assert.match(sql,/from PUBLIC,anon,authenticated/);
 assert.match(sql,/grant select,insert,update on public.mazi_marketplace_listings to service_role/);
});
test("only officially verified approved members can access community actions",()=>{
 assert.match(api,/if\(operation\.startsWith\("community_"\)\)/);
 assert.match(api,/const member=await verifiedMember\(user\.id\)/);
 assert.match(api,/if\(!member\)return out\(\{error:"not_verified"\},403\)/);
 assert.match(api,/identity_verified_at/);
 assert.match(api,/app\?\.status==="approved"/);
 assert.match(api,/admin\.auth\.getUser\(match\[1\]\)/);
});
test("chat requires same-origin, server verified session and bounded payload",()=>{
 assert.match(server,/origin!==request\.nextUrl\.origin/);
 assert.match(server,/db\.auth\.getUser\(\)/);
 assert.match(server,/body\.length>1000/);
 assert.match(api,/rateLimited\("mazi_chat_messages",3\)/);
});
test("community cannot activate finance or bypass invitation onboarding",()=>{
 assert.doesNotMatch(sql,/mazi_fund_ledger|update\s+public\.mazi_members\b/i);
 assert.match(dashboard,/Δεν υπάρχουν ενεργές συνδρομές/);
 assert.match(api,/if\(operation==="apply"\)return out\(\{error:"invitation_required"\},403\)/);
});
