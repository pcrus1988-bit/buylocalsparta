import assert from "node:assert/strict";
import test from "node:test";
import {parsePushConsent,validFcmToken,allowCompanionPush,allowCompanionTestPush} from "../src/lib/companion-push-policy.ts";

test("separate affirmative opt-ins required; vendor marketing never enabled",()=>{
 assert.deepEqual(parsePushConsent({orderUpdates:true,savedItems:false,vendorOffers:false}),
   {orderUpdates:true,savedItems:false,vendorOffers:false});
 assert.throws(()=>parsePushConsent({orderUpdates:false,savedItems:false,vendorOffers:false}));
 assert.throws(()=>parsePushConsent({orderUpdates:true,savedItems:false,vendorOffers:true}));
 assert.throws(()=>parsePushConsent({orderUpdates:true,savedItems:"true",vendorOffers:false}));
 assert.throws(()=>parsePushConsent({orderUpdates:true,savedItems:false}));
});
test("native FCM token, not arbitrary text or Expo token",()=>{
 assert.equal(validFcmToken("abc-def_A:".repeat(9)),true);
 assert.equal(validFcmToken("ExponentPushToken[secret]"),false);
 assert.equal(validFcmToken("x".repeat(49)),false);
 assert.equal(validFcmToken("x".repeat(2049)),false);
 assert.equal(validFcmToken(null),false);
});
test("push registration and test delivery require independent explicit gates",()=>{
 const configured={NODE_ENV:"production",COMPANION_ANDROID_AUTH_ENABLED:"true",
   COMPANION_ANDROID_PUSH_REGISTRATION_ENABLED:"true"};
 assert.equal(allowCompanionPush(configured),true);
 assert.equal(allowCompanionTestPush(configured),false);
 assert.equal(allowCompanionTestPush({...configured,COMPANION_ANDROID_PUSH_TEST_ENABLED:"true"}),true);
 assert.equal(allowCompanionPush({...configured,NODE_ENV:"development"}),false);
 assert.equal(allowCompanionPush({...configured,COMPANION_ANDROID_AUTH_ENABLED:"false"}),false);
});
