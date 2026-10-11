import {fiscalPool} from "./fiscal-runtime";
import {FiscalApiError,isFiscalUuid} from "./fiscal-api-clients";
import type {FiscalActor} from "./fiscal-auth";

export type FiscalCounterpartyKind="business"|"public_body";
export type FiscalCounterparty=Readonly<{
 id:string;organization_id:string;kind:FiscalCounterpartyKind;legal_name:string;
 vat_number:string;country_code:"GR";verification_status:"unverified";created_at:Date;
}>;
export function parseFiscalCounterparty(input:unknown):{
 kind:FiscalCounterpartyKind;legalName:string;vatNumber:string
}{
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new FiscalApiError("INVALID_COUNTERPARTY",400);
 const data=input as Record<string,unknown>;
 if(Object.keys(data).some(k=>!["kind","legalName","vatNumber"].includes(k)))
  throw new FiscalApiError("UNEXPECTED_COUNTERPARTY_FIELDS",400);
 const {kind,legalName,vatNumber}=data;
 if(kind!=="business"&&kind!=="public_body")
  throw new FiscalApiError("INVALID_COUNTERPARTY_KIND",400);
 if(typeof legalName!=="string"||legalName.trim().length<2||legalName.trim().length>240||
  /[\u0000-\u001f\u007f]/.test(legalName))
  throw new FiscalApiError("INVALID_COUNTERPARTY_NAME",400);
 if(typeof vatNumber!=="string"||!/^[0-9]{9}$/.test(vatNumber))
  throw new FiscalApiError("INVALID_COUNTERPARTY_VAT_FORMAT",400);
 return {kind,legalName:legalName.trim(),vatNumber};
}

/** Bounded merchant-facing list; PostgreSQL independently checks tenant membership. */
export async function listFiscalCounterparties(actor:Pick<FiscalActor,"id">,orgId:string):
 Promise<FiscalCounterparty[]>{
 if(!isFiscalUuid(actor.id)||!isFiscalUuid(orgId))return [];
 const results=await fiscalPool().query<FiscalCounterparty>(
  `SELECT c.id,c.organization_id,c.kind,c.legal_name,c.vat_number,
    c.country_code,c.verification_status,c.created_at
   FROM fiscal_counterparties c
   JOIN fiscal_memberships m ON m.organization_id=c.organization_id AND m.user_id=$2
   JOIN fiscal_users u ON u.id=m.user_id AND u.disabled_at IS NULL
   WHERE c.organization_id=$1
   ORDER BY c.created_at DESC,c.id DESC LIMIT 100`,[orgId,actor.id]);
 return results.rows;
}
/** Writes only synthetic/unverified test identities. No GEMI/AADE lookup here. */
export async function createFiscalCounterparty(
 actor:Pick<FiscalActor,"id">,orgId:string,input:unknown
):Promise<{id:string;created:boolean}>{
 if(!isFiscalUuid(actor.id)||!isFiscalUuid(orgId))
  throw new FiscalApiError("INVALID_ORGANIZATION",400);
 const data=parseFiscalCounterparty(input);
 const db=await fiscalPool().connect();
 try{
  await db.query("BEGIN");
  const authorized=await db.query(
   `SELECT 1 FROM fiscal_organizations o
    JOIN fiscal_memberships m ON m.organization_id=o.id
    JOIN fiscal_users u ON u.id=m.user_id
    WHERE o.id=$1 AND m.user_id=$2 AND m.role IN('owner','accountant')
      AND o.status='approved' AND u.disabled_at IS NULL
    FOR SHARE OF o,m,u`,[orgId,actor.id]);
  if(!authorized.rowCount)throw new FiscalApiError("COUNTERPARTY_NOT_AUTHORIZED",403);
  const inserted=await db.query<{id:string}>(
   `INSERT INTO fiscal_counterparties(
     organization_id,kind,legal_name,vat_number,country_code,verification_status,created_by)
    VALUES($1,$2,$3,$4,'GR','unverified',$5)
    ON CONFLICT(organization_id,kind,vat_number) DO NOTHING RETURNING id`,
   [orgId,data.kind,data.legalName,data.vatNumber,actor.id]);
  let id=inserted.rows[0]?.id;
  if(id){
   await db.query(
    `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details)
     VALUES('merchant',$1,$2,'counterparty.test_created',$3::jsonb)`,
    [actor.id,orgId,JSON.stringify({counterpartyId:id,kind:data.kind})]);
  }else{
   const existing=await db.query<{id:string;legal_name:string}>(
    `SELECT id,legal_name FROM fiscal_counterparties
     WHERE organization_id=$1 AND kind=$2 AND vat_number=$3 LIMIT 1`,
    [orgId,data.kind,data.vatNumber]);
   if(!existing.rows[0]||existing.rows[0].legal_name!==data.legalName)
    throw new FiscalApiError("COUNTERPARTY_IDENTITY_CONFLICT",409);
   id=existing.rows[0].id;
  }
  await db.query("COMMIT");
  return {id,created:inserted.rows.length>0};
 }catch(error){
  await db.query("ROLLBACK").catch(()=>undefined);
  throw error;
 }finally{db.release()}
}
