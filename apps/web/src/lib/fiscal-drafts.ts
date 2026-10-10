import {createHash} from "node:crypto";
import { fiscalPool } from "./fiscal-runtime";
import { FiscalApiError, isFiscalUuid, type FiscalApiPrincipal } from "./fiscal-api-clients";
import type { FiscalActor } from "./fiscal-auth";
import {calculateFiscalPreview,type FiscalPreviewResult} from "./fiscal-preview-calculator";

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


/**
 * Browser-originated, NON-FISCAL draft with optional immutable line snapshots.
 * Client calculations are never trusted. Recompute every line in the server.
 * All authorization, draft, line inserts and audit happen in one DB transaction.
 */
export async function createFiscalConsoleDraft(
 actor:Pick<FiscalActor,"id">,organizationId:string,
 input:{lane:unknown;externalId:unknown;reference:unknown;grossMinor:unknown;items?:unknown;counterpartyId?:unknown}
):Promise<{created:boolean;id:string}> {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId))
  throw new FiscalApiError("INVALID_ORGANIZATION",400);
 let simulation:FiscalPreviewResult|null=null;
 if(input.items!==undefined){
  try{
   simulation=calculateFiscalPreview({lane:input.lane,items:input.items});
  }catch(error){
   throw new FiscalApiError(error instanceof Error&&/^PREVIEW_[A-Z_]+$/.test(error.message)
    ?error.message:"PREVIEW_INVALID_INPUT",400);
  }
  if(simulation.totals.grossMinor!==input.grossMinor)
   throw new FiscalApiError("PREVIEW_TOTAL_MISMATCH",422);
 }
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const authorized=await db.query<{vat_number:string}>(
   `SELECT o.vat_number FROM fiscal_organizations o
    JOIN fiscal_memberships m ON m.organization_id=o.id
    JOIN fiscal_users u ON u.id=m.user_id
    WHERE o.id=$1 AND m.user_id=$2 AND m.role IN ('owner','accountant')
     AND o.status='approved' AND u.disabled_at IS NULL
    FOR SHARE OF o,m,u`,[organizationId,actor.id]
  );
  if(!authorized.rows[0])throw new FiscalApiError("CONSOLE_DRAFT_NOT_AUTHORIZED",403);
  const data=parseDraftInput(
   {lane:input.lane,externalId:input.externalId,reference:input.reference,
    grossMinor:input.grossMinor,currency:"EUR",issuerVatNumber:authorized.rows[0].vat_number},
   authorized.rows[0].vat_number
  );
  let counterparty:null|{
   id:string;kind:"business"|"public_body";legalName:string;vatNumber:string;
   countryCode:"GR";verificationStatus:"unverified"
  }=null;
  if(input.counterpartyId!==undefined&&input.counterpartyId!==null&&input.counterpartyId!==""){
   if(data.lane!=="b2b"&&data.lane!=="b2g")
    throw new FiscalApiError("COUNTERPARTY_NOT_SUPPORTED_FOR_LANE",400);
   if(!isFiscalUuid(input.counterpartyId))
    throw new FiscalApiError("INVALID_COUNTERPARTY_ID",400);
   const expectedKind=data.lane==="b2b"?"business":"public_body";
   const row=await db.query<{
    id:string;kind:"business"|"public_body";legal_name:string;vat_number:string
   }>(
    `SELECT id,kind,legal_name,vat_number FROM fiscal_counterparties
     WHERE organization_id=$1 AND id=$2 AND kind=$3
     FOR SHARE`,
    [organizationId,input.counterpartyId,expectedKind]
   );
   if(!row.rows[0])throw new FiscalApiError("COUNTERPARTY_NOT_FOUND",404);
   counterparty={id:row.rows[0].id,kind:row.rows[0].kind,
    legalName:row.rows[0].legal_name,vatNumber:row.rows[0].vat_number,
    countryCode:"GR",verificationStatus:"unverified"};
  }
  const payload={
   reference:data.reference,currency:"EUR",grossMinor:data.grossMinor,
   ...(counterparty?{counterparty}:{}),
   issuerVatNumber:data.issuerVatNumber,
   ...(simulation?{
    calculationKind:"non_fiscal_test_preview",
    rounding:simulation.rounding,lineCount:simulation.items.length,
    netMinor:simulation.totals.netMinor,
    vatMinor:simulation.totals.vatMinor,
    discountMinor:simulation.totals.discountMinor
   }:{})
  };
  const fingerprint=JSON.stringify({lane:data.lane,...payload,
   ...(simulation?{items:simulation.items}:{})});
  const digest=createHash("sha256").update(fingerprint).digest("hex");
  const created=await db.query<{id:string}>(
   `INSERT INTO fiscal_document_intakes
    (organization_id,lane,source,external_id,status,payload,payload_digest)
    VALUES ($1,$2,'console',$3,'draft',$4::jsonb,$5)
    ON CONFLICT (organization_id,source,external_id) DO NOTHING RETURNING id`,
   [organizationId,data.lane,data.externalId,JSON.stringify(payload),digest]
  );
  let id=created.rows[0]?.id;
  if(id){
   if(simulation){
    for(let n=0;n<simulation.items.length;n++){
     const line=simulation.items[n];
     await db.query(
      `INSERT INTO fiscal_document_intake_lines(
       organization_id,draft_id,line_no,description,quantity_milli,unit_price_minor,
       vat_rate_bps,discount_bps,before_discount_minor,discount_minor,net_minor,vat_minor,gross_minor)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [organizationId,id,n+1,line.description,line.quantityMilli,line.unitPriceMinor,
       line.vatRateBps,line.discountBps,line.beforeDiscountMinor,line.discountMinor,
       line.netMinor,line.vatMinor,line.grossMinor]
     );
    }
   }
   await db.query(
    `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details)
     VALUES('merchant',$1,$2,'draft.console_created',$3::jsonb)`,
    [actor.id,organizationId,JSON.stringify({
     draftId:id,lane:data.lane,simulation:simulation!==null,lineCount:simulation?.items.length??0
    })]
   );
  }else{
   const existing=await db.query<{id:string;lane:string;payload_digest:string|null}>(
    `SELECT id,lane,payload_digest FROM fiscal_document_intakes
     WHERE organization_id=$1 AND source='console' AND external_id=$2
      AND status='draft' LIMIT 1`,[organizationId,data.externalId]
   );
   if(!existing.rows[0]||existing.rows[0].lane!==data.lane||existing.rows[0].payload_digest!==digest)
    throw new FiscalApiError("IDEMPOTENCY_CONFLICT",409);
   id=existing.rows[0].id;
  }
  await db.query("COMMIT");
  return {created:created.rows.length>0,id};
 }catch(error){
  await db.query("ROLLBACK").catch(()=>undefined);
  throw error;
 }finally{db.release();}
}
