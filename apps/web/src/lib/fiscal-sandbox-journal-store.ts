import {createHash} from "node:crypto";
import {fiscalPool} from "./fiscal-runtime";
import {FiscalApiError,isFiscalUuid} from "./fiscal-api-clients";
import {previewFiscalSandboxJournal,type FiscalSandboxJournal} from "./fiscal-sandbox-journal";
import type {FiscalActor} from "./fiscal-auth";

export type FiscalSavedSandboxJournal={
 id:string;external_id:string;entry_count:number;total_debit_minor:string;created_at:Date;
 lines:{line_no:number;account_code:string;side:"debit"|"credit";amount_minor:string}[];
};

/** Bounded, actor-scoped read. No public tax journal or official postings exist. */
export async function listFiscalSandboxJournals(actor:Pick<FiscalActor,"id">,organizationId:string):Promise<FiscalSavedSandboxJournal[]>{
 if(!isFiscalUuid(organizationId))throw new FiscalApiError("INVALID_ORGANIZATION");
 const result=await fiscalPool().query<FiscalSavedSandboxJournal>(
  `WITH allowed AS (
     SELECT j.id,j.organization_id,j.external_id,j.entry_count,j.total_debit_minor,j.created_at
     FROM fiscal_sandbox_journals j
     JOIN fiscal_memberships m ON m.organization_id=j.organization_id AND m.user_id=$2
     JOIN fiscal_users u ON u.id=m.user_id AND u.disabled_at IS NULL
     WHERE j.organization_id=$1
     ORDER BY j.created_at DESC,j.id DESC LIMIT 20
    )
    SELECT j.id,j.external_id,j.entry_count,j.total_debit_minor::text AS total_debit_minor,
      j.created_at,
      COALESCE(jsonb_agg(jsonb_build_object('line_no',l.line_no,
       'account_code',l.account_code,'side',l.side,'amount_minor',l.amount_minor::text)
       ORDER BY l.line_no) FILTER(WHERE l.line_no IS NOT NULL),'[]'::jsonb) AS lines
    FROM allowed j
    LEFT JOIN fiscal_sandbox_journal_lines l
      ON l.organization_id=j.organization_id AND l.journal_id=j.id
    GROUP BY j.id,j.external_id,j.entry_count,j.total_debit_minor,j.created_at
    ORDER BY j.created_at DESC,j.id DESC`,[organizationId,actor.id]
 );
 return result.rows;
}

/** Atomic, immutable test snapshot: checked seller membership, balanced lines and audit. */
export async function saveFiscalSandboxJournal(
 actor:Pick<FiscalActor,"id">,organizationId:string,externalId:string,raw:unknown
):Promise<{id:string;created:boolean;preview:FiscalSandboxJournal}>{
 if(!isFiscalUuid(organizationId))throw new FiscalApiError("INVALID_ORGANIZATION");
 if(!/^[A-Za-z0-9._:-]{8,120}$/.test(externalId))throw new FiscalApiError("INVALID_EXTERNAL_ID");
 let preview:FiscalSandboxJournal;
 try{preview=previewFiscalSandboxJournal(raw);}
 catch(error){
  const code=error instanceof Error&&/^JOURNAL_[A-Z_]+$/.test(error.message)
   ?error.message:"JOURNAL_INVALID_INPUT";
  throw new FiscalApiError(code,400);
 }
 const digest=createHash("sha256").update(JSON.stringify({
  currency:preview.currency,entries:preview.entries
 })).digest("hex");
 const client=await fiscalPool().connect();
 try{
  await client.query("BEGIN");
  const authorized=await client.query(
   `SELECT o.id FROM fiscal_organizations o
     JOIN fiscal_memberships m ON m.organization_id=o.id
     JOIN fiscal_users u ON u.id=m.user_id
     WHERE o.id=$1 AND m.user_id=$2 AND m.role IN ('owner','accountant')
      AND o.status='approved' AND u.disabled_at IS NULL
     FOR SHARE OF o,m,u`,[organizationId,actor.id]
  );
  if(!authorized.rowCount)throw new FiscalApiError("JOURNAL_NOT_AUTHORIZED",403);
  const inserted=await client.query<{id:string}>(
   `INSERT INTO fiscal_sandbox_journals
    (organization_id,external_id,digest,entry_count,total_debit_minor,total_credit_minor,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(organization_id,external_id) DO NOTHING RETURNING id`,
   [organizationId,externalId,digest,preview.entries.length,
    preview.totalDebitMinor,preview.totalCreditMinor,actor.id]
  );
  let id=inserted.rows[0]?.id;
  if(id){
   for(let index=0;index<preview.entries.length;index++){
    const entry=preview.entries[index];
    await client.query(
     `INSERT INTO fiscal_sandbox_journal_lines
      (organization_id,journal_id,line_no,account_code,side,amount_minor)
      VALUES($1,$2,$3,$4,$5,$6)`,
     [organizationId,id,index+1,entry.account,entry.side,entry.amountMinor]
    );
   }
   await client.query(
    `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details)
      VALUES('merchant',$1,$2,'journal_sandbox.saved',$3::jsonb)`,
    [actor.id,organizationId,JSON.stringify({journalId:id,entryCount:preview.entries.length})]
   );
  }else{
   const prior=await client.query<{id:string;digest:string}>(
    `SELECT id,digest FROM fiscal_sandbox_journals
     WHERE organization_id=$1 AND external_id=$2 LIMIT 1`,
    [organizationId,externalId]
   );
   if(!prior.rows[0]||prior.rows[0].digest!==digest)
    throw new FiscalApiError("JOURNAL_IDEMPOTENCY_CONFLICT",409);
   id=prior.rows[0].id;
  }
  await client.query("COMMIT"); // Deferred database balance validation must succeed.
  return {id,created:inserted.rowCount===1,preview};
 }catch(error){
  await client.query("ROLLBACK").catch(()=>undefined);
  throw error;
 }finally{client.release();}
}
