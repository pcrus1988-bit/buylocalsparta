import assert from "node:assert/strict";
import test from "node:test";
import {
 GREEK_HOSPITALITY_POS_PROVIDERS,
 getGreekPosProvider,mayEnablePosCapability,posProviderCatalogue,
 type PosConnectionEvidence,PosReadinessError
} from "../src/lib/drinkstock-pos-providers.ts";

const ids=GREEK_HOSPITALITY_POS_PROVIDERS.map(p=>p.id);
const full:PosConnectionEvidence={
 providerId:"oracle_simphony",readiness:"production_verified",
 vendorApproved:true,merchantApproved:true,signedWebhooksVerified:true,
 serverLocationMappingVerified:true,productMappingVerified:true,
 deduplicationVerified:true,reconciliationVerified:true,fiscalProviderApproved:true,
 approvedCapabilities:["catalog_read","sales_read","order_write","price_write",
  "payment_status","refunds_read","inventory_read","fulfilment_write"]
};
test("exactly ten unique, documented Greek hospitality POS target profiles",()=>{
 assert.equal(ids.length,10);
 assert.equal(new Set(ids).size,10);
 assert.deepEqual(ids,[
  "epsilon_pylon_restaurant","softone_fnb","wizcom_inorder","twinsoft_orexsys",
  "megasoft_prisma_win","oracle_simphony","poseidon_anima_menu",
  "semantic_garsonista","simply_rest","fastorder"
 ]);
 for(const id of ids){
  const p=getGreekPosProvider(id);
  assert.ok(p.name&&p.vendor&&p.product&&p.approach);
  assert.ok(p.evidence.length>=1);
  assert.ok(p.evidence.every(url=>url.startsWith("https://")));
 }
 assert.throws(()=>getGreekPosProvider("unsupported_provider"),PosReadinessError);
});
test("provider selection never advertises live access",()=>{
 const c=posProviderCatalogue();
 assert.equal(c.length,10);
 for(const p of c){
  assert.equal(p.status,"vendor_access_required");
  assert.equal(p.liveConnected,false);
  assert.deepEqual(p.liveCapabilities,[]);
 }
});
test("no new provider is activated by a self-service UI selection or sandbox alone",()=>{
 for(const id of ids){
  for(const readiness of ["vendor_access_required","sandbox_verified","venue_pilot_verified"] as const){
   assert.equal(mayEnablePosCapability({...full,providerId:id,readiness},"sales_read"),false);
  }
 }
});
test("no capability can be used without its explicit approval",()=>{
 assert.equal(mayEnablePosCapability({...full,approvedCapabilities:["catalog_read"]},"sales_read"),false);
 assert.equal(mayEnablePosCapability({...full,approvedCapabilities:[]},"catalog_read"),false);
});
test("real sales cannot be enabled without validated signed events and reconciliation",()=>{
 for(const field of ["vendorApproved","merchantApproved","signedWebhooksVerified",
  "serverLocationMappingVerified","productMappingVerified",
  "deduplicationVerified","reconciliationVerified"] as const){
  assert.equal(mayEnablePosCapability({...full,[field]:false},"sales_read"),false,field);
 }
 assert.equal(mayEnablePosCapability(full,"sales_read"),true);
});
test("POS writes require extra fiscal gating; a verified catalogue read is independent",()=>{
 assert.equal(mayEnablePosCapability({...full,fiscalProviderApproved:false},"order_write"),false);
 assert.equal(mayEnablePosCapability({...full,fiscalProviderApproved:false},"price_write"),false);
 assert.equal(mayEnablePosCapability({...full,fiscalProviderApproved:false},"catalog_read"),true);
});
