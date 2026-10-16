import * as SecureStore from "expo-secure-store";

const BASE="https://kontamou.site/api/mobile/companion";
const REFRESH_KEY="km_companion_android_refresh_v1";
const EXPIRES_EARLY_MS=30_000;
type TokenResponse={
  accessToken:string;refreshToken:string;tokenType:"Bearer";expiresIn:number
};
export type CompanionOrder={
 id:string;reference:string;status:string;totalMinor:number;currency:string;
 createdAt:string;hasPickup:boolean;pickupReady:boolean
};
export type CompanionSavedProduct={
 id:string;variantId:string;title:string;slug:string
};
export type CompanionAccount={
 account:{id:string;email:string};
 orders:CompanionOrder[];
 savedProducts:CompanionSavedProduct[];
};
let activeAccess:string|null=null,expiresAt=0;
let refreshing:Promise<string|null>|null=null;

function validToken(value:unknown):value is string{
 return typeof value==="string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
async function saveTokens(tokens:TokenResponse){
 if(!validToken(tokens.accessToken)||!validToken(tokens.refreshToken)
   ||tokens.tokenType!=="Bearer"||!Number.isFinite(tokens.expiresIn)||tokens.expiresIn<=0)
   throw new Error("INVALID_SESSION");
 // Refresh belongs only in Android Keystore-backed SecureStore. Access stays in RAM.
 // Persist refresh before replacing live access so a storage failure fails closed.
 await SecureStore.setItemAsync(REFRESH_KEY,tokens.refreshToken,{keychainService:REFRESH_KEY});
 activeAccess=tokens.accessToken;
 expiresAt=Date.now()+tokens.expiresIn*1000;
}
export async function connectCompanion(code:string,verifier:string){
 if(!validToken(code)||!(/^[A-Za-z0-9_-]{43,128}$/.test(verifier)))throw new Error("INVALID_GRANT");
 const r=await fetch(`${BASE}/auth/token`,{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({grant_type:"authorization_code",code,code_verifier:verifier})
 });
 if(!r.ok)throw new Error(r.status===503?"NOT_ENABLED":"LOGIN_FAILED");
 const payload=await r.json() as TokenResponse;
 await saveTokens(payload);
}
async function refreshAccess():Promise<string|null>{
 const refresh=await SecureStore.getItemAsync(REFRESH_KEY,{keychainService:REFRESH_KEY});
 if(!validToken(refresh))return null;
 try{
   const r=await fetch(`${BASE}/auth/token`,{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({grant_type:"refresh_token",refresh_token:refresh})
   });
   if(!r.ok){
     if(r.status===401){
       // Invalid/revoked refresh is not a temporary network failure.
       await SecureStore.deleteItemAsync(REFRESH_KEY,{keychainService:REFRESH_KEY});
       activeAccess=null;expiresAt=0;
     }
     return null;
   }
   const tokens=await r.json() as TokenResponse;
   await saveTokens(tokens);
   return activeAccess;
 }catch{
   // Keep local session on offline/timeouts; retry when user next opens account.
   return null;
 }
}
async function accessToken():Promise<string|null>{
 if(activeAccess && Date.now()<expiresAt-EXPIRES_EARLY_MS)return activeAccess;
 if(!refreshing)refreshing=refreshAccess().finally(()=>{refreshing=null;});
 return refreshing;
}
export async function loadCompanionAccount():Promise<CompanionAccount|null>{
 const token=await accessToken();
 if(!token)return null;
 let r=await fetch(`${BASE}/account`,{
   headers:{Authorization:`Bearer ${token}`},cache:"no-store"
 });
 if(r.status===401){
   activeAccess=null;expiresAt=0;
   const replacement=await accessToken();
   if(!replacement)return null;
   r=await fetch(`${BASE}/account`,{
     headers:{Authorization:`Bearer ${replacement}`},cache:"no-store"
   });
 }
 if(!r.ok)throw new Error(r.status===503?"ACCOUNT_UNAVAILABLE":"ACCOUNT_SYNC_FAILED");
 const snapshot=await r.json() as CompanionAccount;
 if(!snapshot||typeof snapshot.account?.email!=="string"
   ||!Array.isArray(snapshot.orders)||!Array.isArray(snapshot.savedProducts))
   throw new Error("INVALID_ACCOUNT_RESPONSE");
 return snapshot;
}
export async function disconnectCompanion(){
 const refresh=await SecureStore.getItemAsync(REFRESH_KEY,{keychainService:REFRESH_KEY});
 // Clear local secrets even if the remote revocation service is offline.
 activeAccess=null;expiresAt=0;
 await SecureStore.deleteItemAsync(REFRESH_KEY,{keychainService:REFRESH_KEY});
 if(validToken(refresh)){
   try{
     await fetch(`${BASE}/auth/token`,{method:"DELETE",headers:{"content-type":"application/json"},
        body:JSON.stringify({refresh_token:refresh})});
   }catch{/* previously issued bearer expires within 15 minutes */}
 }
}

/** Owned Companion API calls only. Access never leaves this first-party HTTPS origin. */
export async function companionAuthorizedRequest<T>(
 path:"/push/device"|"/push/test"|"/wishlist/import",method:"GET"|"PUT"|"DELETE"|"POST",payload?:unknown
):Promise<T>{
 const call=async(token:string)=>fetch(`${BASE}${path}`,{
   method,headers:{
    Authorization:`Bearer ${token}`,
    ...(payload===undefined?{}:{"Content-Type":"application/json"})
   },
   ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
 });
 let token=await accessToken();
 if(!token)throw Error("LOGIN_REQUIRED");
 let r=await call(token);
 if(r.status===401){
   activeAccess=null;expiresAt=0;
   token=await accessToken();
   if(!token)throw Error("LOGIN_REQUIRED");
   r=await call(token);
 }
 if(!r.ok)throw Error(r.status===503?"NOT_ENABLED":r.status===401?"LOGIN_REQUIRED":"REQUEST_FAILED");
 return await r.json() as T;
}
