import assert from "node:assert/strict";
import test from "node:test";
import {validCanonicalPublicId} from "../src/lib/canonical-id.ts";
test("legacy UUID and newer cv_ variant keys are both valid",()=>{
 assert.equal(validCanonicalPublicId("05f782e0-cad3-4266-a542-44cd6a8292c7"),true);
 assert.equal(validCanonicalPublicId("cv_55467684072d4bd19f6d"),true);
 assert.equal(validCanonicalPublicId("cv_f5f5807bcdb84f709683"),true);
});
test("deny unsafe or arbitrary product path and list identifiers",()=>{
 for(const value of ["../checkout","cv_","cv_/../../admin","null","0".repeat(129),null]){
  assert.equal(validCanonicalPublicId(value),false);
 }
});
