import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const gateway=read("../supabase/functions/mazi-member-api/index.ts");
const threadPage=read("../app/inbox/[id]/page.tsx");
const inboxPage=read("../app/inbox/page.tsx");
const actions=read("../app/community-actions.ts");
const community=read("../lib/community.ts");

test("a conversation is looked up by UUID AND authenticated participant before any private message query",()=>{
 assert.match(gateway,/operation==="community_inquiry_thread"/);
 assert.match(gateway,/\["community_inbox","community_inquiry_thread"/);
 const start=gateway.indexOf('if(operation==="community_inquiry_thread")');
 const end=gateway.indexOf('if(operation==="community_inbox")',start);
 assert.ok(start>0&&end>start);
 const handler=gateway.slice(start,end);
 assert.match(handler,/uuid\(inquiryId\)/);
 assert.match(handler,/Number\.isInteger\(page\)/);
 assert.match(handler,/page>99/);
 assert.match(handler,/\.eq\("id",inquiryId\)/);
 assert.match(handler,/\.or\(`sender_user_id\.eq\.\$\{user\.id\},recipient_user_id\.eq\.\$\{user\.id\}`\)/);
 assert.ok(handler.indexOf('if(!thread)return out({error:"not_available"},404)')<
   handler.indexOf('admin.from("mazi_inquiry_messages")'));
 assert.match(handler,/\.eq\("inquiry_id",inquiryId\)\.is\("hidden_at",null\)/);
 assert.match(handler,/\.range\(page\*40,page\*40\+40\)/);
 assert.match(handler,/selected\.slice\(0,40\)\.reverse\(\)/);
});

test("thread UI is server-authenticated, access-denied as not found, and never publicly indexed",()=>{
 assert.match(threadPage,/db\.auth\.getUser\(\)/);
 assert.match(threadPage,/if\(!validUuid\(id\)\)notFound\(\)/);
 assert.match(threadPage,/if\(!result\.ok\)notFound\(\)/);
 assert.match(threadPage,/maziMemberRequest<CommunityInquiryThread>\(/);
 assert.match(threadPage,/robots:\{index:false,follow:false\}/);
 assert.match(threadPage,/result\.has_older/);
 assert.match(threadPage,/page\+1/);
 assert.match(threadPage,/reportInquiryMessage/);
 assert.match(threadPage,/updateInquiryState/);
 assert.match(threadPage,/replyInquiry/);
});

test("inbox previews cannot misrepresent a capped global result as complete thread history",()=>{
 assert.match(inboxPage,/messages\.slice\(-3\)\.map/);
 assert.match(inboxPage,/href=\{"\/inbox\/"\+thread\.id\}/);
 assert.match(inboxPage,/Πλήρες ιστορικό και απάντηση/);
 assert.match(actions,/redirect\(destination\+"\?notice=saved"\)/);
 assert.match(actions,/redirect\("\/inbox\/"\+inquiry_id\+"\?notice="/);
 assert.match(community,/export type CommunityInquiryThread/);
});
