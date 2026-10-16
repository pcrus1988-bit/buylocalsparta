import assert from "node:assert/strict";
import {test} from "node:test";
import {parseCompanionNewAddress} from "./companion-address-policy.ts";
const address={label:"Σπίτι",fullName:"Μαρία Παπαδοπούλου",line1:"Λυκούργου 12",
 locality:"Σπάρτη",postcode:"23100",countryCode:"GR",
 isDefaultBilling:true,isDefaultDelivery:false};
test("new mobile address uses reviewed marketplace address fields only",()=>{
 assert.deepEqual(parseCompanionNewAddress(address),address);
 assert.equal(parseCompanionNewAddress({...address,phone:"+306912345678"}).phone,"+306912345678");
 assert.equal(parseCompanionNewAddress({...address,line2:"  Οροφος   1  "}).line2,"Οροφος 1");
});
test("mobile cannot update or delete another address via create route",()=>{
 for(const payload of [{...address,id:"addr_other_customer"},
  {...address,userId:"another"}, {...address,customerId:"another"},
  {...address,createdAt:0},{...address,isDefaultBilling:"true"}]){
   assert.throws(()=>parseCompanionNewAddress(payload),/INVALID_ADDRESS/);
 }
});
test("reject malformed addresses and non-Greek delivery inputs",()=>{
 for(const payload of [
  {...address,fullName:"Μαρία"},{...address,line1:"  "},
  {...address,locality:""},{...address,postcode:"2310"},
  {...address,postcode:"ABCDE"},{...address,phone:"123"},
  {...address,countryCode:"US"},{...address,label:"x".repeat(81)},
  {...address,fullName:42},null,[],{}
 ]) assert.throws(()=>parseCompanionNewAddress(payload));
});
