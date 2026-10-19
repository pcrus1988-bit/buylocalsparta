import assert from "node:assert/strict";
import test from "node:test";
import {EMPTY_POS_DRAFT,validatePosDraft,validateDraftProductMembership,selfCheckDraft,PosDraftError} from "../src/lib/drinkstock-pos-draft.ts";
const one={providerId:"oracle_simphony",otherName:"",path:"cloud",
 menu:[{externalItemId:"B1",name:"Μπύρα"}],mappings:[{externalItemId:"B1",productId:"11111111-1111-4111-8111-111111111111"}]};
const drinks=[{id:"11111111-1111-4111-8111-111111111111",name:"Μπύρα"}];
test("Only supported providers or explicitly identified other are accepted",()=>{
 assert.equal(validatePosDraft(one).providerId,"oracle_simphony");
 assert.throws(()=>validatePosDraft({...one,providerId:"evil"}),PosDraftError);
 assert.throws(()=>validatePosDraft({...one,providerId:"other",otherName:""}),PosDraftError);
 assert.equal(validatePosDraft({...one,providerId:"other",otherName:" My POS "}).otherName,"My POS");
});
test("Passwords, API keys, endpoints and client-supplied connection statuses are discarded",()=>{
 const result=validatePosDraft({...one,apiKey:"do-not-save",connected:true,merchantToken:"bad",baseUrl:"https://secret/"});
 assert.deepEqual(Object.keys(result).sort(),["providerId","otherName","path","menu","mappings"].sort());
 assert.ok(!JSON.stringify(result).includes("do-not-save"));
});
test("POS codes must be unique; mappings must refer to known codes and UUIDs",()=>{
 assert.throws(()=>validatePosDraft({...one,menu:[one.menu[0],one.menu[0]]}),PosDraftError);
 assert.throws(()=>validatePosDraft({...one,mappings:[{externalItemId:"WRONG",productId:""}]}),PosDraftError);
 assert.throws(()=>validatePosDraft({...one,mappings:[{externalItemId:"B1",productId:"bad"}]}),PosDraftError);
 assert.throws(()=>validatePosDraft({...one,mappings:[one.mappings[0],one.mappings[0]]}),PosDraftError);
});
test("A malicious mapping cannot reference another venue product",()=>{
 validateDraftProductMembership(validatePosDraft(one),drinks);
 assert.throws(()=>validateDraftProductMembership(validatePosDraft(one),[]),
  (e:unknown)=>e instanceof PosDraftError&&e.code==="UNKNOWN_VENUE_PRODUCT");
});
test("Readiness is a checklist, NEVER an online status",()=>{
 assert.equal(selfCheckDraft(one,drinks).readyForVendorTest,true);
 assert.equal(selfCheckDraft(one,drinks).liveConnected,false);
 assert.equal(selfCheckDraft(EMPTY_POS_DRAFT,drinks).readyForVendorTest,false);
 const withDuplicates={...one,menu:[{externalItemId:"B1",name:"Beer"},{externalItemId:"B2",name:"Pint"}],
 mappings:[{externalItemId:"B1",productId:drinks[0].id},{externalItemId:"B2",productId:drinks[0].id}]};
 assert.equal(selfCheckDraft(withDuplicates,drinks).duplicateTargets,1);
 assert.equal(selfCheckDraft(withDuplicates,drinks).readyForVendorTest,false);
});
test("Cannot smuggle massive files or malformed strings into a venue draft",()=>{
 assert.throws(()=>validatePosDraft({...one,menu:Array.from({length:501},(_,i)=>({externalItemId:String(i),name:"Item"}))}),PosDraftError);
 assert.throws(()=>validatePosDraft({...one,menu:[{externalItemId:"A",name:"\nBAD"}]}),PosDraftError);
});
