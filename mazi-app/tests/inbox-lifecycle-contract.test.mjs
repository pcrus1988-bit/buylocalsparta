import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isInquiryUnread} from "../lib/community.ts";
const read=(x)=>readFileSync(new URL(x,import.meta.url),"utf8");
const sql=read("../sql/024_member_inbox_lifecycle.sql");
const gateway=read("../supabase/functions/mazi-member-api/index.ts");
const inbox=read("../app/inbox/page.tsx");
const actions=read("../app/community-actions.ts");
const dashboard=read("../app/dashboard/page.tsx");
const template={
 id:"inquiry",listing_id:"listing",sender_user_id:"alice",recipient_user_id:"bob",
 status:"open",created_at:"2026-10-25T09:00:00Z",
 last_message_at:"2026-10-25T10:00:00Z",last_message_user_id:"alice",
 sender_last_read_at:null,recipient_last_read_at:null,closed_at:null
};
test("read state belongs to each authenticated participant, not to the thread globally",()=>{
 assert.equal(isInquiryUnread(template,"alice"),false);
 assert.equal(isInquiryUnread(template,"bob"),true);
 assert.equal(isInquiryUnread({...template,recipient_last_read_at:"2026-10-25T10:00:00Z"},"bob"),false);
 assert.equal(isInquiryUnread({...template,recipient_last_read_at:"2026-10-25T10:01:00Z"},"bob"),false);
 assert.equal(isInquiryUnread({...template,last_message_user_id:"bob"},"alice"),true);
 assert.equal(isInquiryUnread(template,"mallory"),false);
 assert.equal(isInquiryUnread({...template,last_message_at:null},"bob"),false);
});
test("member marking read or closing is a gated database transaction",()=>{
 assert.match(sql,/create or replace function public\.mazi_inquiry_member_action/);
 assert.match(sql,/language plpgsql security invoker/);
 assert.match(sql,/for update/);
 assert.match(sql,/p_actor_user_id not in\(entry\.sender_user_id,entry\.recipient_user_id\)/);
 assert.match(sql,/member\.status='verified'/);
 assert.match(sql,/p_action='close' and entry\.status='open'/);
 assert.match(sql,/closed_by_user_id=p_actor_user_id/);
 assert.match(sql,/revoke all on function public\.mazi_inquiry_member_action\(uuid,uuid,text\)/);
 assert.match(sql,/grant execute on function public\.mazi_inquiry_member_action\(uuid,uuid,text\) to service_role/);
 assert.match(gateway,/operation==="community_inquiry_action"/);
 assert.match(gateway,/p_actor_user_id:user\.id/);
 assert.match(actions,/export async function updateInquiryState/);
});
test("database lock prevents replies to closed or unrelated threads even under concurrent requests",()=>{
 assert.match(sql,/create trigger mazi_inquiry_message_validate before insert/);
 assert.match(sql,/where id=new\.inquiry_id for update/);
 assert.match(sql,/current_inquiry\.status<>'open'/);
 assert.match(sql,/new\.member_user_id not in\(current_inquiry\.sender_user_id,current_inquiry\.recipient_user_id\)/);
 assert.match(sql,/MAZI_INQUIRY_MEMBER_NOT_VERIFIED/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/MAZI_INQUIRY_RATE_LIMIT/);
 assert.match(gateway,/MAZI_INQUIRY_RATE_LIMIT/);
});
test("inbox and dashboard show persisted recency and per-member unread badges",()=>{
 assert.match(gateway,/sender_last_read_at,recipient_last_read_at,closed_at/);
 assert.match(sql,/create trigger mazi_inquiry_activity after insert/);
 assert.match(inbox,/aria-current=\{filter==="unread"/);
 assert.match(inbox,/isInquiryUnread\(thread,user\.id\)/);
 assert.match(inbox,/action="close"/);
 assert.match(inbox,/action="read"/);
 assert.match(dashboard,/isInquiryUnread\(q,user\.id\)/);
 assert.doesNotMatch(sql,/grant execute on function public\.mazi_inquiry_member_action\(uuid,uuid,text\) to authenticated/);
});
