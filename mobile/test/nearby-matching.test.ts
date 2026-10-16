import assert from "node:assert/strict";
import test from "node:test";
import {matchLocalItems,validNearbyPosition,type ProductCandidate} from "../src/lib/nearby-matching.ts";

const product:ProductCandidate={
 vendorId:"verified-shop",vendorName:"Κατάστημα",vendorLocationId:"loc1",vendorLocality:"Σπάρτη",
 productTitle:"Παπούτσια για Τρέξιμο",variantId:"variant1",distanceM:170,
 productUrl:"https://kontamou.site/shop?q=test"
};
test("Greek case and accent matching are normalized, completed items excluded",()=>{
 const matches=matchLocalItems([
  {id:"wanted",title:"ΠΑΠΟΥΤΣΙΑ ΤΡΕΞΙΜΟ",variantId:null,completed:false,kind:"shopping"},
  {id:"done",title:"Παπούτσια Τρέξιμο",variantId:null,completed:true,kind:"shopping"},
 ],[product]);
 assert.equal(matches.length,1);
 assert.equal(matches[0].itemId,"wanted");
});
test("whole tokens avoid tea matching steak",()=>{
 const matches=matchLocalItems([{id:"tea",title:"tea",variantId:null,completed:false,kind:"shopping"}],
 [{...product,productTitle:"steak with potatoes"}]);
 assert.equal(matches.length,0);
});
test("exact canonical variant can match a one-word wishlist item",()=>{
 const matches=matchLocalItems([{id:"v",title:"XL",variantId:"variant1",completed:false,kind:"wishlist"}],[product]);
 assert.equal(matches.length,1);
});
test("wrong canonical variant never matches by ID, unmatched terms are rejected",()=>{
 const matches=matchLocalItems([{id:"v",title:"Άγνωστο προϊόν",variantId:"variant2",completed:false,kind:"wishlist"}],[product]);
 assert.equal(matches.length,0);
});
test("invalid GPS, stale precision and out of world positions fail closed",()=>{
 assert.equal(validNearbyPosition(37.07,22.43,50),true);
 assert.equal(validNearbyPosition(37.07,22.43,250),false);
 assert.equal(validNearbyPosition(NaN,22.43,50),false);
 assert.equal(validNearbyPosition(99,22.43,50),false);
});
