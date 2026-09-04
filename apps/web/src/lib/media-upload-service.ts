import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "@buy-local-sparta/object-storage";
import { platformScope, type VendorProfileMediaRole } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

let storageSingleton: S3ObjectStorage | undefined;
const storage = () => storageSingleton ??= new S3ObjectStorage(objectStorageConfigFromEnv(process.env));
const ADMIN_PROFILE_ROLES = new Set<VendorProfileMediaRole>(["logo", "storefront", "team", "gallery"]);
const ADMIN_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

/**
 * Admin equivalent of the vendor storefront upload flow. It intentionally writes
 * through platform scope instead of impersonating a vendor user, while preserving
 * the same private-object-storage, malware scan, rights and moderation gates.
 */
export async function createAdminVendorProfileMediaUploadIntent(principal: SessionPrincipal, input: {
  vendorId: string;
  profileRole: VendorProfileMediaRole;
  filename: string;
  contentType: string;
  byteSize: number;
  altText: string;
  rightsOwner: string;
}) {
  if (mediaUploadMode() !== "direct") throw new Error("Production media upload requires private object storage and malware-scanner configuration");
  const vendorId = input.vendorId.trim();
  const role = input.profileRole;
  const contentType = input.contentType.trim().toLowerCase();
  const filename = safeFilename(input.filename);
  const altText = input.altText.trim();
  const rightsOwner = input.rightsOwner.trim();
  const maxBytes = maxMediaBytes();
  if (!vendorId) throw new Error("Vendor is required");
  if (!ADMIN_PROFILE_ROLES.has(role)) throw new Error("Invalid vendor storefront media role");
  if (!ADMIN_PROFILE_IMAGE_TYPES.has(contentType)) throw new Error("Storefront media must be JPEG, PNG or WebP");
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > maxBytes) throw new Error(`Media size must be between 1 and ${maxBytes} bytes`);
  if (!filename) throw new Error("Original filename is required");
  if (!altText) throw new Error("Image alt text is required");
  if (!rightsOwner) throw new Error("Rights owner is required");

  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const intent = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const actor = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1", [principal.userId]);
    if (!actor.rowCount) throw new Error("Admin actor not found");
    const vendor = await tx.query<SqlRow>(`SELECT v.id::text AS id,v.public_id
      FROM vendor_businesses v JOIN markets m ON m.id=v.market_id
      WHERE (v.public_id=$1 OR v.id::text=$1) AND m.code='sparta' LIMIT 1`, [vendorId]);
    if (!vendor.rowCount) throw new Error("Vendor shop not found");
    const vendorPublicId = requiredText(vendor.rows[0].public_id, "vendor.public_id");
    const intentId = `mui_${randomUUID().replaceAll("-", "")}`;
    const objectKey = `private/vendor-media/${vendorPublicId}/profile/${role}/${randomUUID()}`;
    await tx.query(`INSERT INTO media_upload_intents(
        public_id,vendor_id,canonical_variant_id,purpose,profile_role,kind,object_key,original_filename,
        content_type,expected_byte_size,alt_text,rights_owner,status,expires_at,created_by,created_at
      ) VALUES($1,$2::uuid,NULL,'vendor_profile',$3,'image',$4,$5,$6,$7,$8,$9,'initiated',$10,$11::uuid,$12)`, [
      intentId,
      requiredText(vendor.rows[0].id, "vendor.id"),
      role,
      objectKey,
      filename,
      contentType,
      input.byteSize,
      altText,
      rightsOwner,
      new Date(expiresAt),
      requiredText(actor.rows[0].id, "actor.id"),
      new Date(now)
    ]);
    return { id: intentId, objectKey, contentType, expiresAt, vendorId: vendorPublicId };
  }, { isolation: "serializable" });

  const signed = await storage().createUploadUrl({ objectKey: intent.objectKey, contentType: intent.contentType });
  enforceUploadOrigin(signed.url);
  return { intentId: intent.id, uploadUrl: signed.url, headers: signed.headers, expiresAt: intent.expiresAt, maxBytes, vendorId: intent.vendorId };
}

export async function completeAdminVendorProfileMediaUpload(principal: SessionPrincipal, intentId: string) {
  if (mediaUploadMode() !== "direct") throw new Error("Direct media upload is not configured");
  const id = intentId.trim();
  if (!id) throw new Error("Media upload intent is required");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const lookup = await uow.withTransaction(platformScope(principal.userId), (tx) => tx.query<SqlRow>(`
    SELECT mui.object_key,mui.status,pm.public_id AS media_public_id
    FROM media_upload_intents mui LEFT JOIN product_media pm ON pm.id=mui.media_asset_id
    WHERE mui.public_id=$1 AND mui.purpose='vendor_profile' LIMIT 1`, [id]), { readOnly: true });
  const found = lookup.rows[0];
  if (!found) throw new Error("Media upload intent not found");
  if (requiredText(found.status, "intent.status") === "completed" && typeof found.media_public_id === "string") {
    return { assetId: found.media_public_id, scanStatus: "pending" as const };
  }
  const objectKey = requiredText(found.object_key, "intent.object_key");

  try {
    const metadata = await storage().head(objectKey);
    if (!metadata) throw new Error("Uploaded object was not found in private storage");
    const now = Date.now();
    return await uow.withTransaction(platformScope(principal.userId), async (tx) => {
      const intent = await tx.query<SqlRow>(`SELECT mui.id::text AS intent_uuid,mui.status,mui.object_key,mui.kind,mui.original_filename,
          mui.content_type,mui.expected_byte_size,mui.alt_text,mui.rights_owner,mui.expires_at,mui.media_asset_id::text AS media_uuid,
          mui.vendor_id::text AS vendor_uuid,mui.created_by::text AS created_by_uuid,mui.profile_role,pm.public_id AS media_public_id
        FROM media_upload_intents mui LEFT JOIN product_media pm ON pm.id=mui.media_asset_id
        WHERE mui.public_id=$1 AND mui.purpose='vendor_profile' FOR UPDATE OF mui`, [id]);
      if (!intent.rowCount) throw new Error("Media upload intent not found");
      const row = intent.rows[0];
      const status = requiredText(row.status, "intent.status");
      if (status === "completed" && typeof row.media_public_id === "string") return { assetId: row.media_public_id, scanStatus: "pending" as const };
      if (status !== "initiated") throw new Error(`Media upload intent is ${status}`);
      if (new Date(String(row.expires_at)).getTime() <= now) throw new Error("Media upload intent expired");
      const expectedSize = Number(row.expected_byte_size);
      const actualType = (metadata.contentType ?? "").split(";")[0]!.trim().toLowerCase();
      const expectedType = requiredText(row.content_type, "intent.content_type").toLowerCase();
      if (metadata.byteSize !== expectedSize || actualType !== expectedType) throw new Error("Uploaded object metadata does not match the signed intent");
      const role = requiredProfileRole(row.profile_role);
      const assetUuid = randomUUID();
      const assetId = `media_${randomUUID().replaceAll("-", "")}`;
      await tx.query(`INSERT INTO product_media(
          id,public_id,canonical_variant_id,vendor_id,kind,object_key,alt_text,rights_owner,rights_status,moderation_status,
          original_filename,content_type,byte_size,scan_status,storage_verified_at,next_scan_at,created_at
        ) VALUES($1,$2,NULL,$3::uuid,'image',$4,$5,$6,'pending','pending',$7,$8,$9,'pending',$10,$10,$10)`, [
        assetUuid,
        assetId,
        requiredText(row.vendor_uuid, "vendor_uuid"),
        requiredText(row.object_key, "object_key"),
        optionalText(row.alt_text) ?? null,
        requiredText(row.rights_owner, "rights_owner"),
        requiredText(row.original_filename, "original_filename"),
        expectedType,
        expectedSize,
        new Date(now)
      ]);
      let sortOrder = 0;
      if (role === "gallery") {
        const order = await tx.query<SqlRow>("SELECT COALESCE(MAX(sort_order),0)+10 AS next_sort FROM vendor_profile_media WHERE vendor_id=$1::uuid AND role='gallery'", [requiredText(row.vendor_uuid, "vendor_uuid")]);
        sortOrder = Number(order.rows[0]?.next_sort ?? 10);
      }
      await tx.query(`INSERT INTO vendor_profile_media(id,public_id,vendor_id,media_id,role,sort_order,publication_status,created_by,created_at,updated_at)
        VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,'draft',$7::uuid,$8,$8)`, [
        randomUUID(),
        `vpm_${randomUUID().replaceAll("-", "")}`,
        requiredText(row.vendor_uuid, "vendor_uuid"),
        assetUuid,
        role,
        sortOrder,
        requiredText(row.created_by_uuid, "created_by_uuid"),
        new Date(now)
      ]);
      await tx.query("UPDATE media_upload_intents SET status='completed',storage_verified_at=$2,media_asset_id=$3::uuid,completed_at=$2,failure_reason=NULL WHERE id=$1::uuid", [requiredText(row.intent_uuid, "intent_uuid"), new Date(now), assetUuid]);
      return { assetId, scanStatus: "pending" as const };
    }, { isolation: "serializable" });
  } catch (error) {
    await uow.withTransaction(platformScope(principal.userId), async (tx) => {
      await tx.query("UPDATE media_upload_intents SET status='failed',failure_reason=$2 WHERE public_id=$1 AND status='initiated'", [id, (error instanceof Error ? error.message : "storage_verification_failed").slice(0, 500)]);
    }, { isolation: "serializable" }).catch(() => undefined);
    await storage().delete(objectKey).catch(() => undefined);
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
function safeFilename(value:string):string{return value.replace(/[\u0000-\u001f\u007f]/g,"").replaceAll("\\","/").split("/").pop()?.trim().slice(0,240)??""}
function requiredText(value:unknown,label:string):string{if(typeof value!=="string"||!value)throw new Error(`Invalid ${label}`);return value}
function optionalText(value:unknown):string|undefined{return typeof value==="string"&&value.trim()?value.trim():undefined}
function requiredProfileRole(value:unknown):VendorProfileMediaRole{const role=requiredText(value,"profile role") as VendorProfileMediaRole;if(!ADMIN_PROFILE_ROLES.has(role))throw new Error("Invalid vendor storefront media role");return role}
