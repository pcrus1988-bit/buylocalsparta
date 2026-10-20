import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {parseVatReviewCommand,DrinkStockVatReviewError} from "../src/lib/drinkstock-vat-review-policy.ts";

const productId="11111111-1111-4111-8111-111111111111";
const requestKey="22222222-2222-4222-8222-222222222222";
const valid={productId,requestKey,vatClass:"alcoholic",reviewed:true,
 reviewBasis:"Merchant and venue tax advisor have confirmed beverage classification."};
const source=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");

test("owner signs off drink classification with a durable reason and request UUID",()=>{
 const command=parseVatReviewCommand(valid);
 assert.deepEqual(command,valid);
 assert.deepEqual(parseVatReviewCommand({...valid,vatClass:"review_required",reviewed:false}).reviewed,false);
 for(const vatClass of ["water","non_alcoholic"])
  assert.equal(parseVatReviewCommand({...valid,vatClass}).vatClass,vatClass);
});
test("VAT review payload rejects forged authority, improper consent, bad class, excess fields",()=>{
 for(const p of [
  {...valid,reviewed:false},{...valid,vatClass:"review_required"},
  {...valid,vatClass:"24%"},{...valid,vatClass:"spirits"},
  {...valid,requestKey:"guess"},{...valid,productId:"foreign"},
  {...valid,merchantAuthorized:true},{...valid,reviewBasis:"short"},
  {...valid,reviewBasis:"x".repeat(501)},{...valid,reviewed:"true"},
  null,[],{},{"__proto__":"bad"}
 ])assert.throws(()=>parseVatReviewCommand(p),DrinkStockVatReviewError);
});
test("VAT review endpoint enforces owner identity, same-origin and CSRF",()=>{
 const route=source("../src/app/api/hospitality/partners/[partnerId]/venues/[venueId]/vat-review/route.ts");
 const service=source("../src/lib/drinkstock-vat-review-service.ts");
 assert.match(route,/hospitalityIdentity\(\)/);
 assert.match(route,/assertCustomerCsrf\(/);
 assert.match(route,/get\("origin"\)/);
 assert.match(service,/scope\.rows\[0\]\.role!=="owner"/);
 assert.match(service,/FOR UPDATE OF v/);
 assert.match(service,/FOR UPDATE/);
 assert.match(service,/SESSION_ACTIVE/);
 assert.match(service,/request_key=\$3::uuid/);
 assert.match(service,/INSERT INTO public\.drinkstock_vat_review_events/);
 assert.match(service,/ROLLBACK/);
 assert.doesNotMatch(route,/checkoutLive:true|payment_verified/);
});
test("audit schema is private, unique per venue idempotency key, and records old and new state",()=>{
 const ddl=source("../../../db/operations/20261020_drinkstock_vat_review_events.sql");
 assert.match(ddl,/UNIQUE \(venue_id,request_key\)/);
 assert.match(ddl,/FOREIGN KEY \(product_id,venue_id,partner_id\)/);
 assert.match(ddl,/previous_vat_class/);
 assert.match(ddl,/previous_reviewed/);
 assert.match(ddl,/ENABLE ROW LEVEL SECURITY/);
 assert.match(ddl,/REVOKE ALL ON public\.drinkstock_vat_review_events FROM anon,authenticated/);
});
