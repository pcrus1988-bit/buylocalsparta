export const PUSH_CONSENT_VERSION="companion-android-push-v1";
export type CompanionPushConsent={
 orderUpdates:boolean;
 savedItems:boolean;
 vendorOffers:false;
};
export function parsePushConsent(value:unknown):CompanionPushConsent {
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID_PUSH_CONSENT");
 const o=value as Record<string,unknown>;
 if(typeof o.orderUpdates!=="boolean"||typeof o.savedItems!=="boolean"
   ||o.vendorOffers!==false)throw Error("INVALID_PUSH_CONSENT");
 if(o.orderUpdates===false&&o.savedItems===false)throw Error("NO_ENABLED_PURPOSE");
 return {orderUpdates:o.orderUpdates,savedItems:o.savedItems,vendorOffers:false};
}
export function validFcmToken(input:unknown):input is string{
 return typeof input==="string"&&input.length>=50&&input.length<=2048
   &&/^[a-zA-Z0-9_:\-.]+$/.test(input);
}
export function allowCompanionPush(env:Record<string,string|undefined>){
 return env.COMPANION_ANDROID_AUTH_ENABLED==="true"
   &&env.COMPANION_ANDROID_PUSH_REGISTRATION_ENABLED==="true"
   &&env.NODE_ENV==="production";
}
export function allowCompanionTestPush(env:Record<string,string|undefined>){
 return allowCompanionPush(env)&&env.COMPANION_ANDROID_PUSH_TEST_ENABLED==="true";
}
