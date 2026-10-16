import test from "node:test";
import assert from "node:assert/strict";
import {groupShoppingPlan,savingsForPlan,planFingerprint,shoppingPlanText} from "./shopping-plan.mjs";

const item=(lineId,retailerId,retailerName,total)=>({
  lineId,retailerId,retailerName,sourceProductId:lineId,productName:"Προϊόν "+lineId,
  packages:1,lineTotalEur:total
});
const plan=(items,totalEur)=>({
  complete:true,items,totalEur,missingItems:[],storeCount:new Set(items.map(i=>i.retailerId)).size
});
const current=plan([
  item("a","b","Βήτα",1.10),item("b","a","Άλφα",2.20),
  item("c","b","Βήτα",0.30)
],3.60);
const result={
  snapshotDate:"2026-10-15",storeLimit:2,
  bestSingleStore:plan([item("a","a","Άλφα",5)],5),
  cheapestAcrossAnyStores:plan([item("a","b","Βήτα",1)],1)
};

test("groups results by supermarket, totals in cents, without changing item assignments",()=>{
  const sections=groupShoppingPlan(current);
  assert.deepEqual(sections.map(s=>s.name),["Άλφα","Βήτα"]);
  assert.equal(sections[0].subtotalEur,2.2);
  assert.equal(sections[1].subtotalEur,1.4);
  assert.deepEqual(sections[1].items.map(i=>i.lineId),["a","c"]);
  assert.equal(current.items[0].retailerId,"b");
  assert.deepEqual(groupShoppingPlan({...current,complete:false}),[]);
});

test("reports savings for the plan actually shown, not the cheaper unrestricted plan",()=>{
  assert.equal(savingsForPlan(result,current),1.4);
  assert.equal(savingsForPlan(result,result.cheapestAcrossAnyStores),4);
  assert.equal(savingsForPlan({...result,bestSingleStore:null},current),null);
  assert.equal(savingsForPlan(result,{...current,complete:false}),null);
  assert.equal(savingsForPlan(result,plan([],6)),0);
});

test("fingerprints distinguish snapshot, mode and store allocation, independent of row order",()=>{
  const reversed=plan([...current.items].reverse(),3.6);
  assert.equal(planFingerprint("2026-10-15","limited",current),planFingerprint("2026-10-15","limited",reversed));
  assert.notEqual(planFingerprint("2026-10-15","limited",current),planFingerprint("2026-10-16","limited",current));
  assert.notEqual(planFingerprint("2026-10-15","limited",current),planFingerprint("2026-10-15","all",current));
  const moved=plan(current.items.map(x=>x.lineId==="a"?{...x,retailerId:"a"}:x),3.6);
  assert.notEqual(planFingerprint("2026-10-15","limited",current),planFingerprint("2026-10-15","limited",moved));
  assert.equal(planFingerprint("2026-10-15","limited",null),"");
});

test("exports actionable lists with dated per-chain subtotals and limitations",()=>{
  const txt=shoppingPlanText(result,current,"limited");
  assert.match(txt,/Καταγραφή τιμών: 2026-10-15/);
  assert.match(txt,/Έως 2 αλυσίδες/);
  assert.match(txt,/Άλφα/);
  assert.match(txt,/Βήτα/);
  assert.match(txt,/Προϊόν a/);
  assert.match(txt,/Προϊόν c/);
  assert.match(txt,/posokanei.gov.gr/);
  assert.match(txt,/κόστος μετακίνησης/);
  assert.equal(shoppingPlanText(result,null,"limited"),"");
});
