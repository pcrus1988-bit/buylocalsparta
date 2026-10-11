import {createHash,createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import { fiscalPool } from "./fiscal-runtime";
import {FiscalApiError,isFiscalUuid} from "./fiscal-api-clients";
import type {FiscalActor} from "./fiscal-auth";

const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
const codePattern=/^kmfl_[A-Za-z0-9_-]{43}$/;
const publicVendorPattern=/^[A-Za-z0-9_-]{5,160}$/;
export type FiscalMarketplaceLink={
 id:string;organization_id:string;marketplace_vendor_public_id:string;issuer_vat_number:string;linked_at:Date;revoked_at:Date|null;
};
export function marketplaceLinkSecret():string{
 const secret=process.env.FISCAL_MARKETPLACE_LINK_SECRET?.trim();
 if(!secret||secret.length<32)throw new Error("FISCAL_LINK_SECRET_NOT_CONFIGURED");
 return secret;
}
export function marketplaceLinkSignature(body:string,timestamp:string):string{
 return createHmac("sha256",marketplaceLinkSecret()).update(timestamp+"."+body).digest("base64url");
}
export function verifyMarketplaceAssertion(body:string,timestamp:string,signature:string):boolean{
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>60_000)return false;
 if(!/^[A-Za-z0-9_-]{43}$/.test(signature))return false;
 return equal(marketplaceLinkSignature(body,timestamp),signature);
}
async function ownedOrg(actor:FiscalActor,organizationId:string){
 if(!isFiscalUuid(organizationId))throw new FiscalApiError("INVALID_ORGANIZATION",400);
 const r=await fiscalPool().query<{status:string;vat_number:string}>(
  "SELECT o.status,o.vat_number FROM fiscal_organizations o JOIN fiscal_memberships m ON m.organization_id=o.id WHERE o.id=$1 AND m.user_id=$2 AND m.role='owner' LIMIT 1",
  [organizationId,actor.id]);
 if(!r.rows.length)throw new FiscalApiError("FISCAL_ORGANIZATION_NOT_OWNED",403);
 return r.rows[0];
}
export async function createMarketplacePairingCode(actor:FiscalActor,organizationId:string){
 const org=await ownedOrg(actor,organizationId);
 if(org.status!=="approved")throw new FiscalApiError("FISCAL_ORGANIZATION_NOT_VERIFIED",403);
 const code="kmfl_"+randomBytes(32).toString("base64url");
 const db=await fiscalPool().connect();
 try {
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))",[organizationId]);
  // Creating a new pairing code invalidates older unused codes for this organization.
  await db.query("UPDATE fiscal_marketplace_link_challenges SET revoked_at=now() WHERE organization_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL",[organizationId]);
  const row=await db.query<{id:string;expires_at:Date}>(
   "INSERT INTO fiscal_marketplace_link_challenges(organization_id,created_by,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes') RETURNING id,expires_at",
   [organizationId,actor.id,sha(code)]);
  await db.query(
   "INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details) VALUES('merchant',$1,$2,'marketplace_pairing.created',$3::jsonb)",
   [actor.id,organizationId,JSON.stringify({challengeId:row.rows[0].id})]);
  await db.query("COMMIT");
  return {code,expiresAt:row.rows[0].expires_at};
 }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}finally{db.release();}
}
export async function listMarketplaceLinks(actor:FiscalActor,organizationId:string){
 await ownedOrg(actor,organizationId);
 const r=await fiscalPool().query<FiscalMarketplaceLink>(
  "SELECT id,organization_id,marketplace_vendor_public_id,issuer_vat_number,linked_at,revoked_at FROM fiscal_marketplace_links WHERE organization_id=$1 ORDER BY linked_at DESC LIMIT 40",
  [organizationId]);
 return r.rows;
}
export async function revokeMarketplaceLink(actor:FiscalActor,organizationId:string,linkId:string){
 await ownedOrg(actor,organizationId);
 if(!isFiscalUuid(linkId))throw new FiscalApiError("INVALID_LINK_ID",400);
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const r=await db.query<{id:string}>(
   "UPDATE fiscal_marketplace_links SET revoked_at=now() WHERE organization_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id",
   [organizationId,linkId]);
  if(!r.rows.length)throw new FiscalApiError("LINK_NOT_ACTIVE",404);
  await db.query("INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details) VALUES('merchant',$1,$2,'marketplace_pairing.revoked',$3::jsonb)",
   [actor.id,organizationId,JSON.stringify({linkId})]);
  await db.query("COMMIT");
  return {revoked:true};
 }catch(e){await db.query("ROLLBACK").catch(()=>undefined);throw e;}finally{db.release();}
}
/** Only the authenticated marketplace service may redeem a merchant-generated code.
 * Caller must have independently verified vendor ownership and registered tax identity.
 */
export async function redeemMarketplaceCode(input:{code:unknown;vendorId:unknown;vendorPublicId:unknown;vatNumber:unknown}){
 const {code,vendorId,vendorPublicId,vatNumber}=input;
 if(typeof code!=="string"||!codePattern.test(code)||
    !isFiscalUuid(vendorId)||
    typeof vendorPublicId!=="string"||!publicVendorPattern.test(vendorPublicId)||
    typeof vatNumber!=="string"||!/^\d{9}$/.test(vatNumber))
  throw new FiscalApiError("INVALID_LINK_ASSERTION",400);
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const challenge=await db.query<{id:string;organization_id:string;created_by:string;vat_number:string;status:string}>(
   "SELECT c.id,c.organization_id,c.created_by,o.vat_number,o.status FROM fiscal_marketplace_link_challenges c JOIN fiscal_organizations o ON o.id=c.organization_id WHERE c.code_hash=$1 AND c.expires_at>now() AND c.consumed_at IS NULL AND c.revoked_at IS NULL FOR UPDATE OF c",
   [sha(code)]);
  const approved=challenge.rows[0];
  if(!approved||approved.status!=="approved")throw new FiscalApiError("PAIRING_CODE_EXPIRED_OR_INVALID",409);
  if(approved.vat_number!==vatNumber)throw new FiscalApiError("LEGAL_ISSUER_VAT_MISMATCH",403);
  const existing=await db.query<{id:string}>(
   "SELECT id FROM fiscal_marketplace_links WHERE marketplace_vendor_id=$1 AND revoked_at IS NULL LIMIT 1 FOR UPDATE",
   [vendorId]);
  if(existing.rows.length)throw new FiscalApiError("MARKETPLACE_VENDOR_ALREADY_LINKED",409);
  const result=await db.query<{id:string;organization_id:string}>(
   "INSERT INTO fiscal_marketplace_links(organization_id,marketplace_vendor_id,marketplace_vendor_public_id,issuer_vat_number,authorized_by) VALUES($1,$2,$3,$4,$5) RETURNING id,organization_id",
   [approved.organization_id,vendorId,vendorPublicId,vatNumber,approved.created_by]);
  await db.query("UPDATE fiscal_marketplace_link_challenges SET consumed_at=now() WHERE id=$1",[approved.id]);
  await db.query(
   "INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details) VALUES('system',$1,$2,'marketplace_pairing.completed',$3::jsonb)",
   [vendorPublicId,approved.organization_id,JSON.stringify({linkId:result.rows[0].id,vendorId})]);
  await db.query("COMMIT");
  return {linked:true,linkId:result.rows[0].id,organizationId:result.rows[0].organization_id};
 }catch(e){await db.query("ROLLBACK").catch(()=>undefined);if((e as {code?:string}).code==="23505")throw new FiscalApiError("MARKETPLACE_VENDOR_ALREADY_LINKED",409);throw e;}finally{db.release();}
}
