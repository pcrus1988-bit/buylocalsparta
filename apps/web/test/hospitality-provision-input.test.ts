import assert from "node:assert/strict";
import test from "node:test";
import {parseHospitalityProvisionInput,HospitalityProvisionInputError} from "../src/lib/hospitality-provision-input.ts";
const valid={slug:"spartabar",name:"Sparta Bar",ownerEmail:"Owner@Example.com",venueName:"Central Bar"};
test("canonical owner and partner identity",()=>{
  assert.deepEqual(parseHospitalityProvisionInput(valid),{...valid,ownerEmail:"owner@example.com"});
});
test("prevents invalid partner slugs and emails",()=>{
  for (const input of [{...valid,slug:"../admin"},{...valid,slug:"x"},{...valid,ownerEmail:"not-email"},{...valid,venueName:""}])
    assert.throws(()=>parseHospitalityProvisionInput(input),HospitalityProvisionInputError);
});
test("rejects missing or non-object payloads",()=>{
  for(const payload of [null,undefined,[],false])assert.throws(()=>parseHospitalityProvisionInput(payload));
});
