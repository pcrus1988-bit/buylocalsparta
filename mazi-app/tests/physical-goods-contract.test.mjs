import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const base=read("../sql/028_physical_goods_marketplace.sql");
const inquiry=read("../sql/029_goods_inquiry_expiry_guard.sql");
const gateway=read("../supabase/functions/mazi-member-api/index.ts");
const marketplace=read("../app/marketplace/page.tsx");
const fields=read("../app/marketplace/goods-fields.tsx");
const actions=read("../app/community-actions.ts");
const dashboard=read("../app/dashboard/page.tsx");

test("physical listings have strict database validation, expiry and private access",()=>{
 for(const field of ["item_category","item_condition","quantity","quantity_unit",
   "location_city","fulfillment","price_type","price_cents","expires_at",
   "goods_policy_version","goods_policy_accepted_at"])
  assert.match(base,new RegExp("add column if not exists "+field+"\\b"));
 assert.match(base,/check\(category='goods'\)/);
 assert.match(base,/quantity>0/);
 assert.match(base,/mazi_goods_policy_attestation/);
 assert.match(base,/mazi_goods_price_valid/);
 assert.doesNotMatch(base,/grant.*authenticated/i);
 assert.match(inquiry,/l\.category='goods' and l\.expires_at>now\(\)/);
 assert.match(inquiry,/l\.hidden_at is null/);
 assert.match(inquiry,/security invoker/);
});
test("Edge gateway enforces active KYB and blocks non-goods listing operations",()=>{
 const start=gateway.indexOf('if(operation==="marketplace_list"||operation==="marketplace_my")');
 const end=gateway.indexOf('if(operation==="forum_list")',start);
 assert.ok(start>=0&&end>start);
 const listing=gateway.slice(start,end);
 for(const operation of ["marketplace_create","marketplace_edit","marketplace_renew","marketplace_close"])
  assert.match(listing,new RegExp('if\\(operation==="'+operation+'"\\)'));
 assert.match(listing,/await verifiedMember\(user\.id\)/);
 assert.match(listing,/\.eq\("category","goods"\)/);
 assert.match(listing,/\.gt\("expires_at",new Date\(\)\.toISOString\(\)\)/);
 assert.match(listing,/\.eq\("member_user_id",user\.id\)/);
 assert.match(listing,/input\.goods_policy_accepted!==true/);
 assert.match(listing,/goods_policy_version:"mazi-goods-v1"/);
 assert.match(listing,/No price, checkout, invoice, grant or money movement/);
});
test("member forms support offers, requests, filters and privacy-first inquiries",()=>{
 assert.match(fields,/name="kind"/);
 assert.match(fields,/name="item_condition"/);
 assert.match(fields,/name="location_city"/);
 assert.match(fields,/name="quantity"/);
 assert.match(fields,/name="price_eur"/);
 assert.match(fields,/name="goods_policy_accepted"/);
 for(const action of ["publishMaziListing","editMaziListing","renewMaziListing","closeMaziListing"])
  assert.ok(marketplace.includes(action));
 assert.match(marketplace,/startInquiry/);
 assert.match(marketplace,/name="item_category"/);
 assert.match(marketplace,/robots:\{index:false,follow:false\}/);
 assert.match(actions,/price_cents=Number\(whole\)\*100/);
 assert.match(actions,/goods_policy_accepted:true/);
 assert.match(dashboard,/Αγορά φυσικών ειδών/);
 assert.doesNotMatch(marketplace,/name="category".*services/);
});
