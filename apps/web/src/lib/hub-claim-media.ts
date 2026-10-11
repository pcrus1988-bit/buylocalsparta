import { randomUUID } from "node:crypto";
import { serverObjectStorageFromEnv } from "@buy-local-sparta/object-storage";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const BUCKET = "buy-local-sparta-private";
const MAX_SIZE = 4 * 1024 * 1024;
const roles = new Set(["logo","storefront","gallery"]);
const contentTypes = new Set(["image/jpeg","image/png","image/webp"]);
const storage = () => serverObjectStorageFromEnv({ defaultBucket: BUCKET });

function checkImage(contentType: string, bytes: Uint8Array) {
  if (!contentTypes.has(contentType) || bytes.length < 16 || bytes.length > MAX_SIZE) throw new Error("Εικόνα JPEG, PNG ή WebP έως 4 MB.");
  const png = [137,80,78,71,13,10,26,10];
  const signature = contentType === "image/jpeg" ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
    : contentType==="image/png" ? png.every((v,i)=>bytes[i]===v)
    : String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if (!signature) throw new Error("Η εικόνα δεν ταιριάζει στον τύπο αρχείου.");
}

export async function uploadOwnedHubClaimImage(principal:SessionPrincipal, input:{
  claimId:string; role:string; filename:string; contentType:string; bytes:Uint8Array; altText:string; rightsOwner:string;
}):Promise<string> {
  if (!principal.roles.includes("customer") || !/^hubprospect_[a-zA-Z0-9_-]{6,90}$/.test(input.claimId)) throw new Error("CLAIM_ACCESS_DENIED");
  if (!roles.has(input.role)) throw new Error("INVALID_MEDIA_ROLE");
  const altText=input.altText.trim(),rightsOwner=input.rightsOwner.trim(),contentType=input.contentType.toLowerCase();
  if (altText.length<2||altText.length>240||rightsOwner.length<2||rightsOwner.length>200) throw new Error("INVALID_MEDIA_RIGHTS_OR_DESCRIPTION");
  checkImage(contentType,input.bytes);
  const ownership=await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT h.id::text AS id FROM hub_expansion_prospects h JOIN users u ON u.id=h.owner_user_id
    WHERE h.public_id=$1 AND h.status='converted' AND h.plan_code='claim'
      AND u.public_id=$2 AND u.status='active' AND u.email_verified_at IS NOT NULL LIMIT 1
  `,[input.claimId,principal.userId]);
  if (!ownership.rowCount) throw new Error("CLAIM_NOT_OWNED");
  const prospectiveId="hubclaimmedia_"+randomUUID().replaceAll("-","");
  const objectKey="hub-claim/profiles/"+ownership.rows[0].id+"/"+randomUUID();
  const objects=storage();
  await objects.put({objectKey,contentType,body:input.bytes});
  try {
    const head=await objects.head(objectKey);
    if (!head||head.byteSize!==input.bytes.length||head.contentType!==contentType) throw new Error("PRIVATE_STORAGE_VERIFICATION_FAILED");
    const uow=new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
    await uow.withTransaction({platformAccess:true,marketId:"sparta",requestId:"claim-media:"+prospectiveId},async tx=>{
      const owner=await tx.query<SqlRow>(`
        SELECT h.id::text AS id FROM hub_expansion_prospects h JOIN users u ON u.id=h.owner_user_id
        WHERE h.id=$1::uuid AND h.public_id=$2 AND u.public_id=$3
          AND h.status='converted' AND h.plan_code='claim' AND u.email_verified_at IS NOT NULL FOR UPDATE OF h
      `,[ownership.rows[0].id,input.claimId,principal.userId]);
      if (!owner.rowCount) throw new Error("CLAIM_NOT_OWNED");
      const pending=await tx.query<SqlRow>("SELECT count(*)::integer AS count FROM hub_claim_media WHERE prospect_id=$1::uuid AND status='pending'",[ownership.rows[0].id]);
      if(Number(pending.rows[0]?.count??0)>=12)throw new Error("CLAIM_MEDIA_PENDING_REVIEW_LIMIT");
      if (input.role==="gallery") {
        const count=await tx.query<SqlRow>("SELECT count(*)::integer AS count FROM hub_claim_media WHERE prospect_id=$1::uuid AND role='gallery' AND status IN ('pending','approved')",[ownership.rows[0].id]);
        if (Number(count.rows[0]?.count??0)>=4) throw new Error("CLAIM_GALLERY_LIMIT_FOUR");
      }
      await tx.query(`
        INSERT INTO hub_claim_media(public_id,prospect_id,role,content_type,object_key,alt_text,rights_owner)
        VALUES($1,$2::uuid,$3,$4,$5,$6,$7)
      `,[prospectiveId,ownership.rows[0].id,input.role,contentType,objectKey,altText,rightsOwner]);
    },{isolation:"serializable"});
    return prospectiveId;
  } catch(error){await objects.delete(objectKey).catch(()=>{});throw error;}
}

export async function reviewHubClaimImage(principal:SessionPrincipal, id:string, approve:boolean, reason:string):Promise<void> {
  if (!principal.roles.includes("super_admin") || !/^hubclaimmedia_[0-9a-f]{32}$/.test(id)) throw new Error("ADMIN_REVIEW_REQUIRED");
  if (!approve && reason.trim().length<3) throw new Error("REJECTION_REASON_REQUIRED");
  const uow=new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction({platformAccess:true,marketId:"sparta",requestId:"review-claim-media:"+id},async tx=>{
    const result=await tx.query<SqlRow>("SELECT id::text AS id,prospect_id::text AS prospect_id,role,status FROM hub_claim_media WHERE public_id=$1 FOR UPDATE",[id]);
    if (!result.rowCount||result.rows[0].status!=="pending") throw new Error("MEDIA_NOT_PENDING");
    const row=result.rows[0];
    if (approve && row.role!=="gallery") {
      await tx.query("UPDATE hub_claim_media SET status='rejected',reviewed_at=now(),reviewed_by=$3,rejection_reason='Superseded by approved replacement' WHERE prospect_id=$1::uuid AND role=$2 AND status='approved'",[row.prospect_id,row.role,principal.userId]);
    }
    await tx.query(`
      UPDATE hub_claim_media SET status=$2,reviewed_at=now(),reviewed_by=$3,rejection_reason=$4 WHERE id=$1::uuid
    `,[row.id,approve?"approved":"rejected",principal.userId,approve?null:reason.trim().slice(0,500)]);
  },{isolation:"serializable"});
}

export async function getHubClaimImageAccess(id:string,admin=false) {
  if (!/^hubclaimmedia_[0-9a-f]{32}$/.test(id)) return undefined;
  const result=await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT m.object_key,m.content_type,m.status FROM hub_claim_media m
    JOIN hub_expansion_prospects h ON h.id=m.prospect_id
    WHERE m.public_id=$1 AND h.plan_code='claim'
      AND ($2::boolean=true OR (m.status='approved' AND h.status='converted' AND h.owner_user_id IS NOT NULL))
    LIMIT 1
  `,[id,admin]);
  if (!result.rowCount) return undefined;
  return {key:String(result.rows[0].object_key),type:String(result.rows[0].content_type),status:String(result.rows[0].status)};
}

export async function readHubClaimImage(key:string):Promise<Uint8Array> {
  const item=await storage().read(key);
  if ((item.byteSize??0)>MAX_SIZE) throw new Error("IMAGE_SIZE_INVALID");
  const chunks:Uint8Array[]=[];
  let length=0;
  for await (const chunk of item.stream) {
    length+=chunk.length;
    if (length>MAX_SIZE) throw new Error("IMAGE_SIZE_INVALID");
    chunks.push(chunk);
  }
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}
