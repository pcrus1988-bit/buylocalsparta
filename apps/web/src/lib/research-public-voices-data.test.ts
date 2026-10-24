import test from "node:test";
import assert from "node:assert/strict";
import { publicVoiceDataFromRelease } from "./research-public-voices-data.ts";

const approved={
 schema:"kontamou.research.q18-public-voices.v1",reviewStatus:"approved",privacyReviewed:true,
 geographySuppressed:true,approvedAt:"2026-11-01T00:00:01+02:00",
 categories:[{key:"cost",label:"Κόστος",count:42}],
 quotes:[{id:"quote_1",category:"cost",text:"Το κόστος λειτουργίας έχει αυξηθεί αισθητά.",publicApproved:true,deidentified:true}],
 geography:[{area:"Λακωνία",category:"cost",count:31,eligibleN:50,publicApproved:true}]
} as const;
test("Q18 reader accepts only preapproved anonymous release projections",()=>{
 const data=publicVoiceDataFromRelease(approved);
 assert.equal(data?.quotes.length,1);
 assert.equal(data?.geography.length,1);
 assert.equal(data?.categories[0]?.label,"Κόστος");
});
test("Q18 reader rejects unreleased or unreviewed material",()=>{
 assert.equal(publicVoiceDataFromRelease({...approved,reviewStatus:"pending"}),undefined);
 assert.equal(publicVoiceDataFromRelease({...approved,privacyReviewed:false}),undefined);
 assert.equal(publicVoiceDataFromRelease({...approved,geographySuppressed:false}),undefined);
});
test("Q18 reader suppresses small prefecture cells",()=>{
 const v=publicVoiceDataFromRelease({...approved,geography:[{...approved.geography[0],count:29}]});
 assert.equal(v?.geography.length,0);
});
test("Q18 reader drops PII, quote-level geography and unapproved quotes",()=>{
 const v=publicVoiceDataFromRelease({...approved,quotes:[
  {...approved.quotes[0],text:"Επικοινωνήστε με test@example.com για πληροφορίες."},
  {...approved.quotes[0],id:"quote_2",area:"Λακωνία"},
  {...approved.quotes[0],id:"quote_3",publicApproved:false},
  approved.quotes[0]
 ]});
 assert.equal(v?.quotes.length,1);
 assert.equal(v?.quotes[0]?.id,"quote_1");
});
