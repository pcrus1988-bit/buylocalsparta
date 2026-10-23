import test from 'node:test';import assert from 'node:assert/strict';
import {compileLidlReview} from './compile-lidl-reviewed-offers.mjs';
import {productIdentityHash,verifiedLidlBadges} from './lidl-weekly-overlay.mjs';
const product={source_product_id:'A01',name:'Μελιτζάνες',brand:null,category:'Λαχανικά',unit:'kg',unit_quantity:1};
const verifiedAt='2026-10-23T10:00:00Z';
const inputs=()=>({products:[product],batch:{contract_version:1,retailer:'lidl_gr',candidates:[{
 source:'lidl_plus_public_offers',retailer:'lidl_gr',validity_status:'current',retailer_product_ids:['0082180'],
 retailer_offer_id:'lidl-1',retailer_store_key:'GR0854',offer_type:'StoreMonetaryOnProductDiscount',
 redemption_channel:'Store',price_cents:159,reference_price_cents:205,currency:'EUR',
 valid_from:'2026-10-23',valid_to:'2026-10-25',observed_at:verifiedAt
}]},mappings:{version:1,entries:[{retailer_product_id:'0082180',source_product_id:'A01',source_product_hash:productIdentityHash(product),
 reviewed_by:'catalogue',reviewed_at:verifiedAt,identity_verified:true,packaging_verified:true,
 promotional_terms_verified:true,membership_requirement:'requires_lidl_plus',membership_terms_verified:true}]},permission:'LIDL_GR_PERMIT_OCT23',generatedAt:verifiedAt});
test('reviewed mapping compiles into a bounded display-only badge',()=>{const inp=inputs();const result=compileLidlReview(inp);assert.equal(result.offers.length,1);assert.equal(verifiedLidlBadges({products:inp.products},result,{now:new Date(verifiedAt)}).get('A01')[0].basketEligible,false)});
test('no mapping means no fabricated matches',()=>{const inp=inputs();inp.mappings.entries=[];assert.deepEqual(compileLidlReview(inp).offers,[])});
test('wrong product fingerprint aborts whole batch',()=>{const inp=inputs();inp.mappings.entries[0].source_product_hash='x';assert.throws(()=>compileLidlReview(inp),/fingerprint/)});
test('unverified loyalty benefit cannot be compiled',()=>{const inp=inputs();inp.mappings.entries[0].membership_terms_verified=false;assert.throws(()=>compileLidlReview(inp),/unreviewed/)});
test('non-store promotion excluded',()=>{const inp=inputs();inp.batch.candidates[0].redemption_channel='Online';assert.deepEqual(compileLidlReview(inp).offers,[])});
