/** Classify only protocol-verified Firebase HTTP v1 failures.
 * INVALID_ARGUMENT also describes bad payloads; never disable a token for a
 * generic 400 unless Firebase specifies an FcmError for that registration.
 */
export type FcmSendOutcome = "submitted"|"invalid_token"|"retry"|"failed";
export function classifyFcmResponse(status:number,payload:unknown):FcmSendOutcome{
 if(status>=200&&status<300)return "submitted";
 if(status===404)return "invalid_token"; // Firebase UNREGISTERED
 if(status===400 && payload && typeof payload==="object"){
   const error=(payload as {error?:unknown}).error;
   if(error && typeof error==="object"){
     const data=error as {status?:unknown;details?:unknown};
     if(data.status==="INVALID_ARGUMENT" && Array.isArray(data.details)
       && data.details.some((d:unknown)=>d!==null&&typeof d==="object"
        && (d as Record<string,unknown>)["@type"]==="type.googleapis.com/google.firebase.fcm.v1.FcmError"
        && (d as Record<string,unknown>).errorCode==="INVALID_ARGUMENT"))return "invalid_token";
   }
 }
 if([408,429,500,502,503,504].includes(status))return "retry";
 return "failed";
}
export function companionDispatchGate(env:Record<string,string|undefined>):boolean{
 return env.NODE_ENV==="production"
   && env.COMPANION_ANDROID_AUTH_ENABLED==="true"
   && env.COMPANION_ANDROID_PUSH_REGISTRATION_ENABLED==="true"
   && env.COMPANION_ANDROID_PUSH_DISPATCH_ENABLED==="true"
   && Boolean(env.COMPANION_PUSH_DISPATCH_SECRET && env.COMPANION_PUSH_DISPATCH_SECRET.length>=32);
}
