import { S3ObjectStorage, objectStorageConfigFromEnv } from "@buy-local-sparta/object-storage";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import type { VendorProfileMediaRole } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

let storageSingleton: S3ObjectStorage | undefined;
const storage = () => storageSingleton ??= new S3ObjectStorage(objectStorageConfigFromEnv(process.env));

export type MediaUploadMode = "direct" | "development_memory" | "gated";
export function mediaPipelineEnabled():boolean{return process.env.BLS_MEDIA_PIPELINE_ENABLED === "true"}
export function mediaUploadMode(): MediaUploadMode {
  if (!postgresVendorRuntimeEnabled()) return "development_memory";
  return mediaPipelineEnabled() && storageConfigured() ? "direct" : "gated";
}
export async function mediaPipelineReadiness(){
  if(!mediaPipelineEnabled())return{enabled:false,ready:true,message:"Media pipeline disabled"};
  if(!postgresVendorRuntimeEnabled())return{enabled:true,ready:false,message:"Media pipeline requires PostgreSQL"};
  if(!storageConfigured())return{enabled:true,ready:false,message:"Private object storage configuration is incomplete"};
  try{
    const object=await storage().readiness();
    if(!object.ok)return{enabled:true,ready:false,message:`Object storage: ${object.message}`};
    return{enabled:true,ready:true,message:"Private object storage is ready; malware scanning is verified by the separate media worker"};
  }catch(error){return{enabled:true,ready:false,message:error instanceof Error?error.message:String(error)}}
}

export async function createVendorMediaUploadIntent(principal:SessionPrincipal,input:{canonicalVariantId?:string;profileRole?:VendorProfileMediaRole;kind:"image"|"video"|"document";filename:string;contentType:string;byteSize:number;altText?:string;rightsOwner:string}){
  if(mediaUploadMode()!=="direct") throw new Error("Production media upload requires private object storage and malware-scanner configuration");
  const intent=await getProductionPostgresRuntime().mediaPipeline.createUploadIntent(principal,{...input,now:Date.now()});
  const signed=await storage().createUploadUrl({objectKey:intent.objectKey,contentType:intent.contentType});
  enforceUploadOrigin(signed.url);
  return{intentId:intent.id,uploadUrl:signed.url,headers:signed.headers,expiresAt:intent.expiresAt,maxBytes:maxMediaBytes()};
}

export async function completeVendorMediaUpload(principal:SessionPrincipal,intentId:string){
  if(mediaUploadMode()!=="direct") throw new Error("Direct media upload is not configured");
  const pipeline=getProductionPostgresRuntime().mediaPipeline;
  const intents=await getIntentObjectKey(principal,intentId);
  try{
    const metadata=await storage().head(intents.objectKey); if(!metadata)throw new Error("Uploaded object was not found in private storage");
    return await pipeline.completeUpload(principal,{intentId,actualByteSize:metadata.byteSize,actualContentType:metadata.contentType,now:Date.now()});
  }catch(error){
    await pipeline.failUploadIntent(principal,intentId,error instanceof Error?error.message:"storage_verification_failed").catch(()=>undefined);
    await storage().delete(intents.objectKey).catch(()=>undefined);
    throw error;
  }
}

async function getIntentObjectKey(principal:SessionPrincipal,intentId:string):Promise<{objectKey:string}>{return getProductionPostgresRuntime().mediaPipeline.uploadIntentForVendor(principal,intentId)}

function storageConfigured():boolean{
  const bucket=(process.env.BLS_OBJECT_STORAGE_BUCKET||process.env.OBJECT_STORAGE_BUCKET)?.trim();
  const region=(process.env.BLS_OBJECT_STORAGE_REGION||process.env.AWS_REGION)?.trim();
  const uploadOrigin=process.env.BLS_MEDIA_UPLOAD_ORIGIN?.trim();
  if(!bucket||!region||!uploadOrigin)return false;

  const endpoint=(process.env.BLS_OBJECT_STORAGE_ENDPOINT||process.env.OBJECT_STORAGE_ENDPOINT)?.trim();
  if(isSupabaseStorageEndpoint(endpoint)){
    const accessKey=(process.env.BLS_OBJECT_STORAGE_ACCESS_KEY_ID||process.env.AWS_ACCESS_KEY_ID||process.env.OBJECT_STORAGE_ACCESS_KEY)?.trim();
    const secretKey=(process.env.BLS_OBJECT_STORAGE_SECRET_ACCESS_KEY||process.env.AWS_SECRET_ACCESS_KEY||process.env.OBJECT_STORAGE_SECRET_KEY)?.trim();
    if(!accessKey||!secretKey)return false;
  }
  return true;
}
function isSupabaseStorageEndpoint(endpoint:string|undefined):boolean{if(!endpoint)return false;try{return new URL(endpoint).hostname.toLowerCase().endsWith(".storage.supabase.co")}catch{return false}}
function maxMediaBytes():number{const parsed=Number(process.env.BLS_MEDIA_UPLOAD_MAX_BYTES||process.env.BLS_MEDIA_MAX_BYTES||25*1024*1024);return Number.isSafeInteger(parsed)&&parsed>0?parsed:25*1024*1024}
function enforceUploadOrigin(url:string):void{const expected=process.env.BLS_MEDIA_UPLOAD_ORIGIN?.trim();if(!expected)throw new Error("BLS_MEDIA_UPLOAD_ORIGIN is required");const actualOrigin=new URL(url).origin;const expectedOrigin=new URL(expected).origin;if(actualOrigin!==expectedOrigin)throw new Error(`Signed upload origin ${actualOrigin} does not match BLS_MEDIA_UPLOAD_ORIGIN`)}
