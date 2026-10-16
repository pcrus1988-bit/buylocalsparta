import assert from "node:assert/strict";
import {test} from "node:test";
import {prepareNewAddress,EMPTY_ADDRESS,draftFromSavedAddress} from "../src/lib/address-rules.ts";
const valid={...EMPTY_ADDRESS,label:"Σπίτι",fullName:"Μαρία Παπαδοπούλου",
 line1:"Λυκούργου 12",locality:"Σπάρτη",postcode:"23100"};
test("native form creates only supported Greek customer-address fields",()=>{
 const result=prepareNewAddress(valid);
 assert.equal(result.countryCode,"GR");
 assert.equal(result.isDefaultBilling,false);
 assert.equal(result.fullName,"Μαρία Παπαδοπούλου");
 assert.equal(result.line2,undefined);
});
test("native address form requires full name street city and postcode",()=>{
 for(const patch of [{fullName:"Maria"},{line1:""},{locality:" "},
 {postcode:"123"},{postcode:"ABCDE"},{phone:"123"},{line1:"Road\nInjected"}])
  assert.throws(()=>prepareNewAddress({...valid,...patch}));
});
test("native preparation trims optional address fields without inventing defaults",()=>{
 const result=prepareNewAddress({...valid,fullName:"  Μαρία   Παπαδοπούλου ",
  region:"Λακωνία",line2:"  2ος   όροφος  ",phone:"+306912345678",
  isDefaultDelivery:true});
 assert.equal(result.fullName,"Μαρία Παπαδοπούλου");
 assert.equal(result.line2,"2ος όροφος");
 assert.equal(result.region,"Λακωνία");
 assert.equal(result.isDefaultDelivery,true);
});

test("editing saved address roundtrips company VAT phone and billing defaults",()=>{
 const saved={id:"addr_abc12345678",label:"Εργασία",fullName:"Μαρία Παπαδοπούλου",
  companyName:"KONTA MOY ΕΠΕ",vatNumber:"123456789",line1:"Λυκούργου 12",
  line2:"3ος",locality:"Σπάρτη",region:"Λακωνία",postcode:"23100",
  countryCode:"GR",phone:"+306912345678",isDefaultBilling:true,isDefaultDelivery:false};
 const draft=draftFromSavedAddress(saved);
 assert.equal(draft.companyName,saved.companyName);
 assert.equal(draft.vatNumber,saved.vatNumber);
 assert.equal(draft.isDefaultBilling,true);
 assert.equal(draft.isDefaultDelivery,false);
 const next=prepareNewAddress(draft);
 assert.equal(next.companyName,saved.companyName);
 assert.equal(next.vatNumber,saved.vatNumber);
 assert.equal(next.line2,saved.line2);
 assert.equal(next.phone,saved.phone);
});
test("editing normal address never inserts fictitious invoicing information",()=>{
 const d=draftFromSavedAddress({...valid,isDefaultBilling:false,isDefaultDelivery:false});
 const out=prepareNewAddress(d);
 assert.equal(out.companyName,undefined);
 assert.equal(out.vatNumber,undefined);
 assert.equal(out.isDefaultDelivery,false);
});
