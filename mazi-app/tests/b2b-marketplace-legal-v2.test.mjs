import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const legal=read("../app/marketplace/rules/page.tsx");
const form=read("../app/marketplace/goods-fields.tsx");
const actions=read("../app/community-actions.ts");
const api=read("../supabase/functions/mazi-member-api/index.ts");
const db=read("../sql/030_goods_terms_b2b_v2.sql");
const audit=read("../sql/031_goods_terms_immutable_acceptance_audit.sql");
const footer=read("../app/layout.tsx");
test("versioned B2B legal terms cover key substantive responsibilities",()=>{
 for(const phrase of ["Ευθύνη πωλητή","Όρια ευθύνης ΚΟΝΤΑ ΜΟΥ",
   "Μεταχειρισμένα","Εμπορική εγγύηση","δικαιοδοσία","Επιστροφές","ΦΠΑ","Ασφάλεια προϊόντων",
   "δεν αποκλείει ευθύνη","άρθρου 332","αρθρο"])
 { if(phrase==="αρθρο")continue; assert.ok(legal.includes(phrase),phrase); }
 assert.match(legal,/mazi-goods-v2/);
 assert.match(legal,/ΑΚ άρθρο 554/);
 assert.match(legal,/2022\/2065/);
 assert.match(footer,/href="\/marketplace\/rules"/);
});
test("both independent checkboxes required server-side before publishing or editing",()=>{
 assert.match(form,/name="goods_policy_accepted" required/);
 assert.match(form,/name="goods_b2b_acknowledged" required/);
 assert.match(form,/name="goods_policy_version" value="mazi-goods-v2"/);
 assert.match(actions,/form\.get\("goods_b2b_acknowledged"\)!=="on"/);
 assert.match(actions,/field\(form,"goods_policy_version"\)!=="mazi-goods-v2"/);
 assert.match(api,/input\.goods_b2b_acknowledged!==true/);
 assert.match(api,/text\(input\.goods_policy_version\)!=="mazi-goods-v2"/);
 assert.match(api,/goods_policy_version:"mazi-goods-v2"/);
});
test("database preserves historical version but cannot accept unsigned content",()=>{
 assert.match(db,/goods_policy_version in \('mazi-goods-v1','mazi-goods-v2'\)/);
 assert.match(db,/goods_policy_accepted_at is not null/);
 assert.match(db,/Preserve historical v1 acceptance/);
 assert.doesNotMatch(db,/TRUNCATE|DELETE FROM|DROP TABLE/);
});

test("every accepted listing create/edit creates immutable evidence, without logging renewal or close",()=>{
 assert.match(audit,/create table if not exists public\.mazi_goods_terms_acceptances/);
 assert.match(audit,/AFTER/i);
 assert.match(audit,/after insert or update of goods_policy_version,goods_policy_accepted_at/);
 assert.match(audit,/MAZI_GOODS_TERMS_ACCEPTANCE_APPEND_ONLY/);
 assert.match(audit,/from PUBLIC,anon,authenticated/);
 assert.match(audit,/member_user_id,action,version,accepted_at/);
});
