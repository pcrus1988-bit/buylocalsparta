import assert from "node:assert/strict";
import {test} from "node:test";
import {prepareNewAddress,EMPTY_ADDRESS} from "../src/lib/address-rules.ts";
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
 {postcode:"123"},{postcode:"ABCDE"},{phone:"123"},{line1:"Road\\nInjected"}])
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
