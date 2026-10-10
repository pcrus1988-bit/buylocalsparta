import {createHash} from "node:crypto";
import { fiscalPool } from "./fiscal-runtime";
import { FiscalApiError, type FiscalApiPrincipal } from "./fiscal-api-clients";

export type FiscalDraftLane="b2c"|"pos"|"b2b"|"b2g";
type DraftInput=Readonly<{
  lane:FiscalDraftLane;externalId:string;reference:string;currency:"EUR";grossMinor:number;issuerVatNumber:string;
}>;
export type DraftRecord=Readonly<{
  id:string;lane:FiscalDraftLane;source:"marketplace"|"external_api";external_id:string;
  status:"draft";payload:Omit<DraftInput,"lane"|"externalId">;created_at:Date;payload_digest:string|null;
}>;
export function parseDraftInput(input:unknown,expectedIssuer:string):DraftInput{
  if(!input||typeof input!=="object"||Array.isArray(input))throw new FiscalApiError("INVALID_DRAFT");
  const data=input as Record<string,unknown>;
  const fields=["lane","externalId","reference","currency","grossMinor","issuerVatNumber"];
  if(Object.keys(data).some(key=>!fields.includes(key)))throw new FiscalApiError("UNEXPECTED_DRAFT_FIELDS");
  const {lane,externalId,reference,currency,grossMinor,issuerVatNumber}=data;
  if(typeof lane!=="string"||!["b2c","pos","b2b","b2g"].includes(lane))throw new FiscalApiError("INVALID_LANE");
  if(typeof externalId!=="string"||!(/^[A-Za-z0-9._:-]{8,120}$/).test(externalId))throw new FiscalApiError("INVALID_EXTERNAL_ID");
  if(typeof reference!=="string"||reference.trim().length<1||reference.length>120||/[\u0000-\u001f\u007f]/.test(reference))throw new FiscalApiError("INVALID_REFERENCE");
  if(currency!=="EUR")throw new FiscalApiError("UNSUPPORTED_CURRENCY");
  if(typeof grossMinor!=="number"||!Number.isSafeInteger(grossMinor)||grossMinor<0||grossMinor>1e12)throw new FiscalApiError("INVALID_GROSS_AMOUNT");
  if(typeof issuerVatNumber!=="string"||issuerVatNumber!==expectedIssuer)throw new FiscalApiError("ISSUER_IDENTITY_MISMATCH",403);
  return {lane:lane as FiscalDraftLane,externalId,reference:reference.trim(),currency:"EUR",grossMinor,issuerVatNumber};
}
export async function createFiscalDraft(actor:FiscalApiPrincipal,raw:unknown){
  const data=parseDraftInput(raw,actor.issuerVatNumber);
  const source=actor.kind==="marketplace"?"marketplace":"external_api";
  const payload={reference:data.reference,currency:data.currency,grossMinor:data.grossMinor,issuerVatNumber:data.issuerVatNumber};
  const normalized=JSON.stringify({lane:data.lane,...payload});
  const digest=createHash("sha256").update(normalized).digest("hex");
  const client=await fiscalPool().connect();
  try{
    await client.query("BEGIN");
    const created=await client.query<DraftRecord>(
      "INSERT INTO fiscal_document_intakes(organization_id,lane,source,external_id,payload,payload_digest,status) VALUES($1,$2,$3,$4,$5::jsonb,$6,'draft') ON CONFLICT (organization_id,source,external_id) DO NOTHING RETURNING id,lane,source,external_id,status,payload,payload_digest,created_at",
      [actor.organizationId,data.lane,source,data.externalId,JSON.stringify(payload),digest]);
    if(created.rows.length){
      await client.query("INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details) VALUES('system',$1,$2,'draft.created',$3::jsonb)",
        [actor.clientId,actor.organizationId,JSON.stringify({draftId:created.rows[0].id,lane:data.lane,source})]);
      await client.query("COMMIT");
      return {created:true,draft:created.rows[0]};
    }
    const existing=await client.query<DraftRecord>(
      "SELECT id,lane,source,external_id,status,payload,payload_digest,created_at FROM fiscal_document_intakes WHERE organization_id=$1 AND source=$2 AND external_id=$3 LIMIT 1",
      [actor.organizationId,source,data.externalId]);
    await client.query("COMMIT");
    if(!existing.rows.length)throw new FiscalApiError("DRAFT_CONFLICT",409);
    if(existing.rows[0].payload_digest!==digest||existing.rows[0].lane!==data.lane)throw new FiscalApiError("IDEMPOTENCY_CONFLICT",409);
    return {created:false,draft:existing.rows[0]};
  }catch(error){
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error;
  }finally{client.release();}
}
export async function listFiscalDrafts(actor:FiscalApiPrincipal){
  const result=await fiscalPool().query<DraftRecord>(
    "SELECT id,lane,source,external_id,status,payload,payload_digest,created_at FROM fiscal_document_intakes WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 30",[actor.organizationId]);
  return result.rows.map(({payload_digest,...draft})=>draft);
}
export async function getFiscalDraft(actor:FiscalApiPrincipal,id:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new FiscalApiError("INVALID_DRAFT_ID");
  const result=await fiscalPool().query<DraftRecord>(
    "SELECT id,lane,source,external_id,status,payload,payload_digest,created_at FROM fiscal_document_intakes WHERE organization_id=$1 AND id=$2 LIMIT 1",
    [actor.organizationId,id]);
  if(!result.rows[0])throw new FiscalApiError("DRAFT_NOT_FOUND",404);
  const {payload_digest,...draft}=result.rows[0];
  return draft;
}
