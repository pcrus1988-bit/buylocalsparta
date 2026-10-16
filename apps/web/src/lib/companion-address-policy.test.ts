import assert from "node:assert/strict";
import {test} from "node:test";
import {parseCompanionNewAddress,parseCompanionAddressUpdate,parseCompanionAddressRemoval} from "./companion-address-policy.ts";
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
  {...address,fullName:42},{...address,line1:"Road\nInjected"},null,[],{}
 ]) assert.throws(()=>parseCompanionNewAddress(payload));
});

test("address editing preserves company billing fields and only accepts one opaque ID",()=>{
 const id="addr_abc12345678";
 const edited=parseCompanionAddressUpdate({...address,id,
  companyName:"KONTA MOY ΕΠΕ",vatNumber:"123456789",isDefaultDelivery:true});
 assert.equal(edited.id,id);
 assert.equal(edited.companyName,"KONTA MOY ΕΠΕ");
 assert.equal(edited.vatNumber,"123456789");
 assert.equal(edited.isDefaultBilling,true);
 assert.equal(edited.isDefaultDelivery,true);
});
test("foreign identity attributes and update-as-create cannot bypass mobile address policy",()=>{
 for(const body of [
  {...address,id:"../admin"},{...address,id:"short"},
  {...address,id:"addr_abc12345678",userId:"foreign"},
  {...address,id:"addr_abc12345678",customerId:"another"},
  {...address,id:"addr_abc12345678",companyName:"x".repeat(201)},
  {...address}
 ]) assert.throws(()=>parseCompanionAddressUpdate(body));
});
test("delete accepts only the exact address ID, no user/body overrides",()=>{
 assert.deepEqual(parseCompanionAddressRemoval({id:"addr_abc12345678"}),{id:"addr_abc12345678"});
 for(const body of [
  {},{id:123},{id:"../other"},{id:"addr_abc12345678",userId:"other"},
  {id:"addr_abc12345678",removeAll:true},null,[],{id:"bad id"}
 ]) assert.throws(()=>parseCompanionAddressRemoval(body));
});
