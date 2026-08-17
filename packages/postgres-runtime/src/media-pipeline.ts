import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlPool, type SqlRow } from "@buy-local-sparta/core";
import { vendorScope } from "./vendor-auth.ts";

export type MediaKind = "image" | "video" | "document";
export type MediaUploadIntent = Readonly<{
  id: string;
  objectKey: string;
  contentType: string;
  expectedByteSize: number;
  expiresAt: number;
}>;
export type MediaScanLease = Readonly<{
  assetId: string;
  objectKey: string;
  contentType: string;
  expectedByteSize: number;
  attempt: number;
}>;

const MIME_BY_KIND: Readonly<Record<MediaKind, ReadonlySet<string>>> = {
  image: new Set(["image/jpeg","image/png","image/webp"]),
  video: new Set(["video/mp4","video/webm"]),
  document: new Set(["application/pdf"])
};

export class PostgresMediaPipelineService {
  readonly #uow: PostgresUnitOfWork;
  readonly #maxBytes: number;
  constructor(pool: SqlPool, input: { maxBytes?: number } = {}) {
    this.#uow = new PostgresUnitOfWork(pool);
    this.#maxBytes = input.maxBytes ?? 25 * 1024 * 1024;
  }

  async createUploadIntent(principal: SessionPrincipal, input: { canonicalVariantId:string; kind:MediaKind; filename:string; contentType:string; byteSize:number; altText?:string; rightsOwner:string; now:number; ttlMs?:number }): Promise<MediaUploadIntent> {
    const vendorId=requiredVendor(principal); const kind=input.kind; const contentType=input.contentType.trim().toLowerCase();
    if(!MIME_BY_KIND[kind]?.has(contentType)) throw new Error(`Unsupported ${kind} content type`);
    if(!Number.isSafeInteger(input.byteSize)||input.byteSize<=0||input.byteSize>this.#maxBytes) throw new Error(`Media size must be between 1 and ${this.#maxBytes} bytes`);
    const rightsOwner=input.rightsOwner.trim(); if(!rightsOwner) throw new Error("Rights owner is required");
    const filename=safeFilename(input.filename); if(!filename) throw new Error("Original filename is required");
    const altText=input.altText?.trim()||undefined; if(kind==="image"&&!altText) throw new Error("Image alt text is required");
    const ttlMs=input.ttlMs??15*60*1000; if(!Number.isSafeInteger(ttlMs)||ttlMs<60_000||ttlMs>60*60*1000) throw new Error("Upload intent TTL must be between 1 and 60 minutes");
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const ownership=await tx.query<SqlRow>(`SELECT cv.id::text AS canonical_uuid FROM canonical_variants cv WHERE cv.public_id=$1 AND EXISTS(
        SELECT 1 FROM vendor_offers vo JOIN vendor_businesses v ON v.id=vo.vendor_id WHERE vo.canonical_variant_id=cv.id AND v.public_id=$2 AND vo.status='approved')`,[input.canonicalVariantId,vendorId]);
      if(!ownership.rowCount) throw new Error("Vendor media access denied");
      const user=await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1",[principal.userId]); if(!user.rowCount) throw new Error("Vendor actor not found");
      const vendor=await tx.query<SqlRow>("SELECT id::text AS id FROM vendor_businesses WHERE public_id=$1",[vendorId]); if(!vendor.rowCount) throw new Error("Vendor not found");
      const intentId=`mui_${randomUUID().replaceAll("-","")}`; const objectKey=`private/vendor-media/${vendorId}/${randomUUID()}`; const expiresAt=input.now+ttlMs;
      await tx.query(`INSERT INTO media_upload_intents(public_id,vendor_id,canonical_variant_id,kind,object_key,original_filename,content_type,expected_byte_size,alt_text,rights_owner,status,expires_at,created_by,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'initiated',$11,$12,$13)`,[intentId,text(vendor.rows[0].id),text(ownership.rows[0].canonical_uuid),kind,objectKey,filename,contentType,input.byteSize,altText??null,rightsOwner,new Date(expiresAt),text(user.rows[0].id),new Date(input.now)]);
      return{id:intentId,objectKey,contentType,expectedByteSize:input.byteSize,expiresAt};
    },{isolation:"serializable"});
  }

  async completeUpload(principal: SessionPrincipal, input:{intentId:string; actualByteSize:number; actualContentType?:string; now:number}):Promise<{assetId:string;scanStatus:"pending"}> {
    const vendorId=requiredVendor(principal);
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const found=await tx.query<SqlRow>(`SELECT mui.id::text AS intent_uuid,mui.status,mui.object_key,mui.kind,mui.original_filename,mui.content_type,mui.expected_byte_size,mui.alt_text,mui.rights_owner,mui.expires_at,mui.media_asset_id::text AS media_uuid,
        mui.canonical_variant_id::text AS canonical_uuid,mui.vendor_id::text AS vendor_uuid,pm.public_id AS media_public_id
        FROM media_upload_intents mui LEFT JOIN product_media pm ON pm.id=mui.media_asset_id WHERE mui.public_id=$1 FOR UPDATE OF mui`,[input.intentId]);
      if(!found.rowCount) throw new Error("Media upload intent not found"); const row=found.rows[0];
      if(text(row.status)==="completed"&&typeof row.media_public_id==="string") return{assetId:row.media_public_id,scanStatus:"pending"};
      if(text(row.status)!=="initiated") throw new Error(`Media upload intent is ${text(row.status)}`);
      if(epoch(row.expires_at)<=input.now) throw new Error("Media upload intent expired");
      const expected=int(row.expected_byte_size); const actualType=(input.actualContentType??"").split(";")[0]!.trim().toLowerCase(); const expectedType=text(row.content_type).toLowerCase();
      if(input.actualByteSize!==expected||actualType!==expectedType) throw new Error("Uploaded object metadata does not match the signed intent");
      const assetUuid=randomUUID(),assetId=`media_${randomUUID().replaceAll("-","")}`;
      await tx.query(`INSERT INTO product_media(id,public_id,canonical_variant_id,vendor_id,kind,object_key,alt_text,rights_owner,rights_status,moderation_status,original_filename,content_type,byte_size,scan_status,storage_verified_at,next_scan_at,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending','pending',$9,$10,$11,'pending',$12,$12,$12)`,[assetUuid,assetId,text(row.canonical_uuid),text(row.vendor_uuid),text(row.kind),text(row.object_key),optional(row.alt_text)??null,text(row.rights_owner),text(row.original_filename),expectedType,expected,new Date(input.now)]);
      await tx.query("UPDATE media_upload_intents SET status='completed',storage_verified_at=$2,media_asset_id=$3,completed_at=$2,failure_reason=NULL WHERE id=$1",[text(row.intent_uuid),new Date(input.now),assetUuid]);
      return{assetId,scanStatus:"pending"};
    },{isolation:"serializable"});
  }


  async uploadIntentForVendor(principal:SessionPrincipal,intentId:string):Promise<{objectKey:string}>{
    const vendorId=requiredVendor(principal);return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{const result=await tx.query<SqlRow>(`SELECT object_key FROM media_upload_intents WHERE public_id=$1`,[intentId]);if(!result.rowCount)throw new Error("Media upload intent not found");return{objectKey:text(result.rows[0].object_key)}} ,{readOnly:true})
  }

  async failUploadIntent(principal:SessionPrincipal,intentId:string,reason:string):Promise<void>{const vendorId=requiredVendor(principal);await this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{await tx.query("UPDATE media_upload_intents SET status='failed',failure_reason=$2 WHERE public_id=$1 AND status='initiated'",[intentId,reason.slice(0,500)])},{isolation:"serializable"})}

  async claimNextScan(input:{workerId:string;now:number;leaseMs?:number;maxAttempts?:number}):Promise<MediaScanLease|undefined>{const leaseMs=input.leaseMs??120_000,maxAttempts=input.maxAttempts??5;return this.#uow.withTransaction({actorUserId:input.workerId,marketId:"sparta",platformAccess:true},async(tx)=>{
    const picked=await tx.query<SqlRow>(`SELECT pm.id::text AS asset_uuid,pm.public_id,pm.object_key,pm.content_type,pm.byte_size,pm.scan_attempts FROM product_media pm
      WHERE pm.storage_verified_at IS NOT NULL AND pm.scan_status IN ('pending','failed') AND pm.scan_attempts<$1 AND (pm.next_scan_at IS NULL OR pm.next_scan_at<=$2) AND (pm.scan_lease_until IS NULL OR pm.scan_lease_until<$2)
      ORDER BY pm.next_scan_at NULLS FIRST,pm.created_at FOR UPDATE SKIP LOCKED LIMIT 1`,[maxAttempts,new Date(input.now)]); if(!picked.rowCount)return undefined; const row=picked.rows[0],attempt=int(row.scan_attempts)+1;
    await tx.query("UPDATE product_media SET scan_attempts=$2,scan_lease_owner=$3,scan_lease_until=$4 WHERE id=$1",[text(row.asset_uuid),attempt,input.workerId,new Date(input.now+leaseMs)]);
    return{assetId:text(row.public_id),objectKey:text(row.object_key),contentType:text(row.content_type),expectedByteSize:int(row.byte_size),attempt};
  },{isolation:"read committed"})}

  async finishScan(input:{workerId:string;assetId:string;status:"clean"|"infected"|"failed";sha256?:string;verifiedObjectKey?:string;reason?:string;now:number;retryAt?:number}):Promise<void>{await this.#uow.withTransaction({actorUserId:input.workerId,marketId:"sparta",platformAccess:true},async(tx)=>{
    const found=await tx.query<SqlRow>("SELECT id::text AS id,scan_lease_owner FROM product_media WHERE public_id=$1 FOR UPDATE",[input.assetId]);if(!found.rowCount)throw new Error("Media asset not found");if(text(found.rows[0].scan_lease_owner)!==input.workerId)throw new Error("Media scan lease is not owned by this worker");
    if(input.status==="clean"){if(!input.sha256||!/^[a-f0-9]{64}$/.test(input.sha256))throw new Error("Clean scan requires SHA-256");if(!input.verifiedObjectKey)throw new Error("Clean scan requires immutable verified object key");await tx.query("UPDATE product_media SET scan_status='clean',sha256=$2,object_key=$3,scan_error=NULL,rejection_reason=NULL,scan_lease_owner=NULL,scan_lease_until=NULL,next_scan_at=NULL WHERE id=$1",[text(found.rows[0].id),input.sha256,input.verifiedObjectKey]);}
    else if(input.status==="infected"){await tx.query("UPDATE product_media SET scan_status='infected',sha256=$2,scan_error=NULL,rejection_reason=$3,scan_lease_owner=NULL,scan_lease_until=NULL,next_scan_at=NULL WHERE id=$1",[text(found.rows[0].id),input.sha256??null,(input.reason??"Malware detected").slice(0,500)]);}
    else await tx.query("UPDATE product_media SET scan_status='failed',scan_error=$2,rejection_reason='Automated malware scan failed',scan_lease_owner=NULL,scan_lease_until=NULL,next_scan_at=$3 WHERE id=$1",[text(found.rows[0].id),(input.reason??"Scanner failure").slice(0,1000),input.retryAt?new Date(input.retryAt):null]);
  },{isolation:"serializable"})}

  async expireUploadIntents(now:number):Promise<{count:number;objectKeys:readonly string[]}>{return this.#uow.withTransaction({actorUserId:"media-worker",marketId:"sparta",platformAccess:true},async(tx)=>{const result=await tx.query<SqlRow>("UPDATE media_upload_intents SET status='expired',failure_reason='upload_intent_expired' WHERE status='initiated' AND expires_at<$1 RETURNING object_key",[new Date(now)]);return{count:result.rowCount,objectKeys:result.rows.map(row=>text(row.object_key))}},{isolation:"read committed"})}
}

function requiredVendor(principal:SessionPrincipal):string{if(!principal.vendorId||!principal.roles.some((role)=>role.startsWith("vendor_")))throw new Error("VENDOR_AUTH_REQUIRED");return principal.vendorId}
function safeFilename(value:string):string{return value.replace(/[\u0000-\u001f\u007f]/g,"").replaceAll("\\","/").split("/").pop()?.trim().slice(0,240)??""}
function text(value:unknown):string{if(typeof value!=="string"||!value)throw new Error("Invalid database text value");return value}
function optional(value:unknown):string|undefined{return typeof value==="string"&&value.length?value:undefined}
function int(value:unknown):number{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error("Invalid database integer value");return n}
function epoch(value:unknown):number{const n=value instanceof Date?value.getTime():new Date(String(value)).getTime();if(!Number.isFinite(n))throw new Error("Invalid database timestamp");return n}
