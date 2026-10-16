/** Classify only protocol-verified Firebase HTTP v1 failures.
 * INVALID_ARGUMENT also describes bad payloads; never disable a token for a
 * generic 400 unless Firebase specifies an FcmError for that registration.
 */
export type FcmSendOutcome = "submitted"|"invalid_token"|"retry"|"failed";
export function classifyFcmResponse(status:number,payload:unknown):FcmSendOutcome{
 if(status>=200&&status<300)return "submitted";
 const error=payload&&typeof payload==="object" ? (payload as {error?:unknown}).error:null;
 const data=error&&typeof error==="object"?error as {status?:unknown;details?:unknown}:null;
 const firebaseErrors=data&&Array.isArray(data.details)?
    data.details.filter((detail:unknown)=>detail!==null&&typeof detail==="object"
      && (detail as Record<string,unknown>)["@type"]==="type.googleapis.com/google.firebase.fcm.v1.FcmError")
      .map((detail:unknown)=>(detail as Record<string,unknown>).errorCode):[];
 // A 404 can also mean the *project* was misconfigured. Revoke only when
 // Firebase identifies this precise registration as unregistered.
 if(status===404&&firebaseErrors.includes("UNREGISTERED"))return "invalid_token";
 if(status===400&&data?.status==="INVALID_ARGUMENT"
   &&firebaseErrors.includes("INVALID_ARGUMENT"))return "invalid_token";
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
