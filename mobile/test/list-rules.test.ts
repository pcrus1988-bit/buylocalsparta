import assert from "node:assert/strict";
import test from "node:test";
import {planCatalogAdd,planListMoveMerge} from "../src/lib/list-rules.ts";

test("selected catalogue item starts a real shopping-list entry",()=>{
 assert.deepEqual(planCatalogAdd("shopping",null),{
  action:"added",quantity:1,completed:false
 });
});
test("repeat adds increment a shopping quantity and reopen a completed item",()=>{
 assert.deepEqual(planCatalogAdd("shopping",{quantity:2,completed:true}),{
  action:"incremented",quantity:3,completed:false
 });
});
test("wishlist adds never duplicate an existing variant",()=>{
 assert.equal(planCatalogAdd("wishlist",{quantity:1,completed:false}).action,"exists");
 assert.deepEqual(planCatalogAdd("wishlist",{quantity:1,completed:true}),{
  action:"reactivated",quantity:1,completed:false
 });
});
test("quantity overflow fails rather than losing user items",()=>{
 assert.throws(()=>planCatalogAdd("shopping",{quantity:99,completed:false}),/QUANTITY_LIMIT/);
 assert.throws(()=>planCatalogAdd("shopping",null,0),/INVALID_QUANTITY/);
 assert.throws(()=>planListMoveMerge({quantity:98,completed:false},{quantity:2,completed:true}),/QUANTITY_LIMIT/);
});
test("moving a canonical variant merges counts and preserves active intent",()=>{
 assert.deepEqual(planListMoveMerge({quantity:2,completed:true},{quantity:3,completed:false}),{
  quantity:5,completed:false
 });
 assert.deepEqual(planListMoveMerge({quantity:2,completed:true},{quantity:3,completed:true}),{
  quantity:5,completed:true
 });
});
