import { createHash, randomBytes } from "node:crypto";
import { fiscalPool } from "./fiscal-runtime";
import type { FiscalActor } from "./fiscal-auth";

const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class FiscalApiError extends Error {
  constructor(public readonly code:string, public readonly status:number=400){super(code);}
}
export type FiscalClientKind="marketplace"|"external_erp";
export type FiscalClientRecord={id:string;label:string;kind:FiscalClientKind;token_hint:string;created_at:Date;expires_at:Date;revoked_at:Date|null};
export function isFiscalUuid(value:unknown):value is string{return typeof value==="string"&&uuid.test(value);}
async function assertOwner(userId:string,organizationId:string){
  const check=await fiscalPool().query<{status:string}>(
    "SELECT o.status FROM fiscal_memberships m JOIN fiscal_organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND o.id=$2 AND m.role='owner' LIMIT 1",
    [userId,organizationId]);
  if(!check.rows.length)throw new FiscalApiError("ORGANIZATION_NOT_OWNED",403);
  if(["rejected","suspended"].includes(check.rows[0].status))throw new FiscalApiError("ORGANIZATION_NOT_ELIGIBLE",403);
}
export async function listFiscalClients(actor:FiscalActor,orgId:string):Promise<FiscalClientRecord[]> {
  if(!isFiscalUuid(orgId))throw new FiscalApiError("INVALID_ORGANIZATION");
  await assertOwner(actor.id,orgId);
  const result=await fiscalPool().query<FiscalClientRecord>(
    "SELECT id,label,kind,token_hint,created_at,expires_at,revoked_at FROM fiscal_api_clients WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50",[orgId]);
  return result.rows;
}
export async function createFiscalClient(actor:FiscalActor,orgId:string,labelInput:string,kind:FiscalClientKind){
  if(!isFiscalUuid(orgId))throw new FiscalApiError("INVALID_ORGANIZATION");
  const label=labelInput.trim();
  if(label.length<3||label.length>100||!["marketplace","external_erp"].includes(kind))throw new FiscalApiError("INVALID_CLIENT_DETAILS");
  await assertOwner(actor.id,orgId);
  // These are intentionally test-scoped draft-only tokens, not production fiscal credentials.
  const token="kmf_test_"+randomBytes(32).toString("base64url");
  const client=await fiscalPool().connect();
  try{
    await client.query("BEGIN");
    const row=await client.query<{id:string;expires_at:Date}>(
      "INSERT INTO fiscal_api_clients(organization_id,created_by,label,kind,token_hash,token_hint,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 days') RETURNING id,expires_at",
      [orgId,actor.id,label,kind,digest(token),token.slice(0,18)]);
    await client.query("INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details) VALUES('merchant',$1,$2,'api_client.created',$3::jsonb)",
      [actor.id,orgId,JSON.stringify({clientId:row.rows[0].id,kind})]);
    await client.query("COMMIT");
    return {id:row.rows[0].id,token,expiresAt:row.rows[0].expires_at};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export async function revokeFiscalClient(actor:FiscalActor,orgId:string,clientId:string){
  if(!isFiscalUuid(orgId)||!isFiscalUuid(clientId))throw new FiscalApiError("INVALID_CLIENT");
  await assertOwner(actor.id,orgId);
  const client=await fiscalPool().connect();
  try{
    await client.query("BEGIN");
    const result=await client.query<{id:string}>(
      "UPDATE fiscal_api_clients SET revoked_at=now() WHERE organization_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id",[orgId,clientId]);
    if(!result.rows.length){await client.query("ROLLBACK");throw new FiscalApiError("CLIENT_NOT_ACTIVE",404);}
    await client.query("INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details) VALUES('merchant',$1,$2,'api_client.revoked',$3::jsonb)",
      [actor.id,orgId,JSON.stringify({clientId})]);
    await client.query("COMMIT");
    return {revoked:true};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export type FiscalApiPrincipal={clientId:string;organizationId:string;kind:FiscalClientKind;issuerVatNumber:string};
export async function authenticateFiscalApi(request:Request):Promise<FiscalApiPrincipal>{
  const header=request.headers.get("authorization")??"";
  const token=header.startsWith("Bearer ")?header.slice(7):"";
  if(!/^kmf_test_[A-Za-z0-9_-]{43}$/.test(token))throw new FiscalApiError("API_TOKEN_REQUIRED",401);
  const r=await fiscalPool().query<{id:string;organization_id:string;kind:FiscalClientKind;vat_number:string}>(
    "SELECT c.id,c.organization_id,c.kind,o.vat_number FROM fiscal_api_clients c JOIN fiscal_organizations o ON o.id=c.organization_id JOIN fiscal_users u ON u.id=c.created_by WHERE c.token_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>now() AND o.status NOT IN ('rejected','suspended') AND u.disabled_at IS NULL LIMIT 1",
    [digest(token)]);
  if(!r.rows.length)throw new FiscalApiError("API_TOKEN_INVALID",401);
  const row=r.rows[0];
  await fiscalPool().query("UPDATE fiscal_api_clients SET last_used_at=now() WHERE id=$1 AND revoked_at IS NULL",[row.id]);
  return {clientId:row.id,organizationId:row.organization_id,kind:row.kind,issuerVatNumber:row.vat_number};
}
