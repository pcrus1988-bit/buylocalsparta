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
// Invalidate late login/refresh responses as soon as logout begins.
let sessionEpoch=0;
// Serialize Android Keystore writes/deletes so a pending write cannot race logout.
let storeQueue:Promise<void>=Promise.resolve();
function withStoreLock<T>(operation:()=>Promise<T>):Promise<T>{
 const job=storeQueue.then(operation,operation);
 storeQueue=job.then(()=>undefined,()=>undefined);
 return job;
}

function validToken(value:unknown):value is string{
 return typeof value==="string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
async function saveTokens(tokens:TokenResponse,epoch:number){
 if(!validToken(tokens.accessToken)||!validToken(tokens.refreshToken)
   ||tokens.tokenType!=="Bearer"||!Number.isFinite(tokens.expiresIn)||tokens.expiresIn<=0)
   throw new Error("INVALID_SESSION");
 // Keystore mutation happens in one serial queue with logout.
 await withStoreLock(async()=>{
   if(epoch!==sessionEpoch)throw new Error("SESSION_CHANGED");
   await SecureStore.setItemAsync(REFRESH_KEY,tokens.refreshToken,{keychainService:REFRESH_KEY});
   if(epoch!==sessionEpoch)throw new Error("SESSION_CHANGED");
   activeAccess=tokens.accessToken;
   expiresAt=Date.now()+tokens.expiresIn*1000;
 });
}
export async function connectCompanion(code:string,verifier:string){
 if(!validToken(code)||!(/^[A-Za-z0-9_-]{43,128}$/.test(verifier)))throw new Error("INVALID_GRANT");
 const startEpoch=sessionEpoch;
 const r=await fetch(`${BASE}/auth/token`,{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({grant_type:"authorization_code",code,code_verifier:verifier})
 });
 if(!r.ok)throw new Error(r.status===503?"NOT_ENABLED":"LOGIN_FAILED");
 const payload=await r.json() as TokenResponse;
 if(startEpoch!==sessionEpoch)throw new Error("SESSION_CHANGED");
 // Any older in-flight refresh cannot replace a newly approved session.
 await saveTokens(payload,++sessionEpoch);
}
async function refreshAccess():Promise<string|null>{
 const epoch=sessionEpoch;
 const refresh=await withStoreLock(async()=>
   epoch===sessionEpoch
    ? SecureStore.getItemAsync(REFRESH_KEY,{keychainService:REFRESH_KEY})
    : null
 );
 if(!validToken(refresh)||epoch!==sessionEpoch)return null;
 try{
   const r=await fetch(`${BASE}/auth/token`,{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({grant_type:"refresh_token",refresh_token:refresh})
   });
   if(epoch!==sessionEpoch)return null;
   if(!r.ok){
     if(r.status===401){
       // Only delete the same refresh token. Never wipe a later approved login.
       await withStoreLock(async()=>{
         if(epoch!==sessionEpoch)return;
         const current=await SecureStore.getItemAsync(REFRESH_KEY,{keychainService:REFRESH_KEY});
         if(current!==refresh)return;
         await SecureStore.deleteItemAsync(REFRESH_KEY,{keychainService:REFRESH_KEY});
         activeAccess=null;expiresAt=0;
       });
     }
     return null;
   }
   const tokens=await r.json() as TokenResponse;
   if(epoch!==sessionEpoch)return null;
   await saveTokens(tokens,epoch);
   return epoch===sessionEpoch?activeAccess:null;
 }catch{
   // Retain original offline session on network timeouts; logout is irrevocable.
   return null;
 }
}
async function accessToken():Promise<string|null>{
 if(activeAccess && Date.now()<expiresAt-EXPIRES_EARLY_MS)return activeAccess;
 if(!refreshing)refreshing=refreshAccess().finally(()=>{refreshing=null;});
 return refreshing;
}
export async function loadCompanionAccount():Promise<CompanionAccount|null>{
 const epoch=sessionEpoch;
 const token=await accessToken();
 if(!token||epoch!==sessionEpoch)return null;
 let r=await fetch(`${BASE}/account`,{
   headers:{Authorization:`Bearer ${token}`},cache:"no-store"
 });
 if(epoch!==sessionEpoch)return null;
 if(r.status===401){
   activeAccess=null;expiresAt=0;
   const replacement=await accessToken();
   if(!replacement||epoch!==sessionEpoch)return null;
   r=await fetch(`${BASE}/account`,{
     headers:{Authorization:`Bearer ${replacement}`},cache:"no-store"
   });
 }
 if(!r.ok)throw new Error(r.status===503?"ACCOUNT_UNAVAILABLE":"ACCOUNT_SYNC_FAILED");
 const snapshot=await r.json() as CompanionAccount;
 if(epoch!==sessionEpoch)return null;
 if(!snapshot||typeof snapshot.account?.email!=="string"
   ||!Array.isArray(snapshot.orders)||!Array.isArray(snapshot.savedProducts))
   throw new Error("INVALID_ACCOUNT_RESPONSE");
 return snapshot;
}
export async function disconnectCompanion(){
 // Make all previous network responses unusable before the first await.
 ++sessionEpoch;
 activeAccess=null;expiresAt=0;
 const refresh=await withStoreLock(async()=>{
   const saved=await SecureStore.getItemAsync(REFRESH_KEY,{keychainService:REFRESH_KEY});
   await SecureStore.deleteItemAsync(REFRESH_KEY,{keychainService:REFRESH_KEY});
   return saved;
 });
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
