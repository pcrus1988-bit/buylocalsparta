import assert from "node:assert/strict";
import test from "node:test";
import {parseCompanionCatalogSearch,validCompanionCanonicalId} from "../src/lib/companion-catalog-policy.ts";
test("bounded Greek and English catalogue search input",()=>{
 assert.deepEqual(parseCompanionCatalogSearch("  Παπούτσια  για  τρέξιμο  "),{
  query:"Παπούτσια για τρέξιμο",limit:12});
 assert.deepEqual(parseCompanionCatalogSearch(" adidas "),{query:"adidas",limit:12});
});
test("reject runaway or non-search inputs before SQL",()=>{
 for(const text of ["","a","  ","\u0000abc","a".repeat(73),"abcd ".repeat(10)]){
  assert.throws(()=>parseCompanionCatalogSearch(text));
 }
 assert.throws(()=>parseCompanionCatalogSearch(null));
});

test("account wishlist accepts both actual public canonical ID formats",()=>{
 assert.equal(validCompanionCanonicalId("05f782e0-cad3-4266-a542-44cd6a8292c7"),true);
 assert.equal(validCompanionCanonicalId("cv_55467684072d4bd19f6d"),true);
 assert.equal(validCompanionCanonicalId("../admin"),false);
 assert.equal(validCompanionCanonicalId("cv_/../../admin"),false);
});
