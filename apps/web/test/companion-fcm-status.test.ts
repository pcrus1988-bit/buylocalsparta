import assert from "node:assert/strict";
import test from "node:test";
import {classifyFcmResponse,companionDispatchGate} from "../src/lib/companion-fcm-status.ts";

test("Only verified invalid registration responses suppress a device",()=>{
 assert.equal(classifyFcmResponse(404,{error:{status:"UNREGISTERED"}}),"invalid_token");
 assert.equal(classifyFcmResponse(400,{error:{status:"INVALID_ARGUMENT",details:[
   {"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError",errorCode:"INVALID_ARGUMENT"}
 ]}}),"invalid_token");
 assert.equal(classifyFcmResponse(400,{error:{status:"INVALID_ARGUMENT",details:[
   {"@type":"type.googleapis.com/google.rpc.BadRequest",fieldViolations:[]}
 ]}}),"failed");
});
test("FCM retryable errors never remove a device",()=>{
 for(const status of [408,429,500,502,503,504]){
  assert.equal(classifyFcmResponse(status,{}),"retry");
 }
 assert.equal(classifyFcmResponse(200,{}),"submitted");
 assert.equal(classifyFcmResponse(401,{}),"failed");
});
test("No transactional send without all independent gates and strong secret",()=>{
 const env={NODE_ENV:"production",COMPANION_ANDROID_AUTH_ENABLED:"true",
   COMPANION_ANDROID_PUSH_REGISTRATION_ENABLED:"true",
   COMPANION_ANDROID_PUSH_DISPATCH_ENABLED:"true",
   COMPANION_PUSH_DISPATCH_SECRET:"x".repeat(40)};
 assert.equal(companionDispatchGate(env),true);
 for(const name of ["COMPANION_ANDROID_AUTH_ENABLED",
  "COMPANION_ANDROID_PUSH_REGISTRATION_ENABLED",
  "COMPANION_ANDROID_PUSH_DISPATCH_ENABLED"] as const){
   assert.equal(companionDispatchGate({...env,[name]:"false"}),false);
 }
 assert.equal(companionDispatchGate({...env,COMPANION_PUSH_DISPATCH_SECRET:"short"}),false);
 assert.equal(companionDispatchGate({...env,NODE_ENV:"test"}),false);
});
