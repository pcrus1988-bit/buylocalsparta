import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const sql=read("../sql/020_member_private_inquiries.sql");
const gateway=read("../supabase/functions/mazi-member-api/index.ts");
const inbox=read("../app/inbox/page.tsx");
test("private listing inquiry is atomic and unreadable by browser SQL roles",()=>{
 for(const n of ["mazi_listing_inquiries","mazi_inquiry_messages"]){
  assert.match(sql,new RegExp("create table if not exists public\\."+n));
  assert.match(sql,new RegExp("alter table public\\."+n+" enable row level security"));
 }
 assert.match(sql,/revoke all on public.mazi_listing_inquiries,public.mazi_inquiry_messages from PUBLIC,anon,authenticated/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/grant execute on function public.mazi_open_inquiry\(uuid,uuid,text\) to service_role/);
 assert.match(gateway,/admin\.rpc\("mazi_open_inquiry"/);
});
test("members cannot read someone else's inquiries or send messages as them",()=>{
 assert.match(gateway,/sender_user_id\.eq\.\$\{user\.id\},recipient_user_id\.eq\.\$\{user\.id\}/);
 assert.match(gateway,/inquiry\.sender_user_id!==user\.id&&inquiry\.recipient_user_id!==user\.id/);
 assert.match(gateway,/p_sender_user_id:user\.id/);
 assert.match(inbox,/maziMemberRequest<Inbox>\("community_inbox"\)/);
});
