import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type AdminFinanceAdjustmentWorkspace = Readonly<{
  adjustments: readonly Readonly<{
    id: string;
    vendorId: string;
    vendorName: string;
    orderId?: string;
    sourceKind: string;
    direction: "credit_vendor" | "debit_vendor";
    amountMinor: number;
    reasonCode: string;
    reason: string;
    status: string;
    requiresPlatformCreditDocument: boolean;
    linkedCreditDocumentId?: string;
    createdBy?: string;
    createdAt: number;
    candidateCreditDocuments: readonly Readonly<{ id: string; documentNumber: string; invoiceTypeCode: string; mark: string }>[];
  }>[];
}>;

function db() {
  if (!productionDatabaseConfigured()) throw new Error("Finance adjustment review requires PostgreSQL");
  return getProductionPostgresRuntime().nativePool;
}
function amount(value: unknown) { const n=Number(value??0); return Number.isSafeInteger(n)?n:0; }
function epoch(value: unknown) { const n=new Date(String(value??"")).getTime(); return Number.isFinite(n)?n:0; }
function cleanReason(value: string) { const reason=value.trim(); if(reason.length<5) throw new Error("Απαιτείται αιτιολογία τουλάχιστον 5 χαρακτήρων"); return reason; }

async function actorUuid(principal: SessionPrincipal) {
  const row=await db().query(`SELECT id::text FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1`,[principal.userId]);
  if(!row.rowCount) throw new Error("Admin actor was not found");
  return String(row.rows[0].id);
}

export async function adminFinanceAdjustmentWorkspace(principal: SessionPrincipal): Promise<AdminFinanceAdjustmentWorkspace> {
  assertAdminPermission(principal,"finance.read");
  const result=await db().query(`SELECT a.public_id,v.public_id AS vendor_public_id,
      COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,o.public_id AS order_public_id,
      a.source_kind,a.direction,a.amount_minor,a.reason_code,a.reason,a.status,
      a.requires_platform_credit_document,a.platform_credit_tax_document_id,
      cu.public_id AS created_by,a.created_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',td.public_id,'documentNumber',COALESCE(td.document_number,td.document_aa,td.public_id),
        'invoiceTypeCode',COALESCE(td.invoice_type_code,''),'mark',COALESCE(td.aade_mark,'')) ORDER BY td.issued_at DESC NULLS LAST,td.created_at DESC)
        FROM tax_documents td
        WHERE td.vendor_id=a.vendor_id AND td.status='issued' AND td.transmission_status='accepted'
          AND td.invoice_type_code IN ('5.1','5.2')
      ),'[]'::jsonb) AS credit_documents
    FROM vendor_finance_adjustments a
    JOIN vendor_businesses v ON v.id=a.vendor_id
    LEFT JOIN customer_orders o ON o.id=a.order_id
    LEFT JOIN users cu ON cu.id=a.created_by
    WHERE a.status IN ('pending','approved')
    ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END,a.created_at DESC
    LIMIT 200`);
  return {adjustments:result.rows.map(row=>({
    id:String(row.public_id),vendorId:String(row.vendor_public_id),vendorName:String(row.vendor_name),
    orderId:row.order_public_id?String(row.order_public_id):undefined,sourceKind:String(row.source_kind),
    direction:String(row.direction) as "credit_vendor"|"debit_vendor",amountMinor:amount(row.amount_minor),
    reasonCode:String(row.reason_code),reason:String(row.reason),status:String(row.status),
    requiresPlatformCreditDocument:Boolean(row.requires_platform_credit_document),
    linkedCreditDocumentId:row.platform_credit_tax_document_id?String(row.platform_credit_tax_document_id):undefined,
    createdBy:row.created_by?String(row.created_by):undefined,createdAt:epoch(row.created_at),
    candidateCreditDocuments:Array.isArray(row.credit_documents)?row.credit_documents.map((doc:Record<string,unknown>)=>({id:String(doc.id),documentNumber:String(doc.documentNumber),invoiceTypeCode:String(doc.invoiceTypeCode),mark:String(doc.mark)})):[]
  }))};
}

export async function adminApproveFinanceAdjustment(principal: SessionPrincipal,input:{adjustmentId:string;creditDocumentId?:string;reason:string}) {
  assertAdminPermission(principal,"finance.write");
  const reason=cleanReason(input.reason); const actor=await actorUuid(principal); const client=await db().connect();
  let vendorId="";
  try {
    await client.query("BEGIN");
    const found=await client.query(`SELECT a.id::text,a.public_id,a.vendor_id::text,a.status,a.created_by::text,a.requires_platform_credit_document,v.public_id AS vendor_public_id
      FROM vendor_finance_adjustments a JOIN vendor_businesses v ON v.id=a.vendor_id
      WHERE a.public_id=$1 OR a.id::text=$1 FOR UPDATE`,[input.adjustmentId]);
    if(!found.rowCount) throw new Error("Finance adjustment not found");
    const row=found.rows[0];
    if(String(row.status)!=="pending") throw new Error("Only pending finance adjustments can be approved");
    if(row.created_by && String(row.created_by)===actor) throw new Error("Maker / checker rule: the creator cannot approve the same finance adjustment");
    vendorId=String(row.vendor_public_id);
    let creditDocumentUuid:string|null=null;
    if(Boolean(row.requires_platform_credit_document)) {
      if(!input.creditDocumentId) throw new Error("Issued and accepted B2B credit document is required before commission reversal approval");
      const doc=await client.query(`SELECT id::text FROM tax_documents
        WHERE (public_id=$1 OR id::text=$1) AND vendor_id=$2::uuid AND status='issued' AND transmission_status='accepted'
          AND invoice_type_code IN ('5.1','5.2') LIMIT 1`,[input.creditDocumentId,row.vendor_id]);
      if(!doc.rowCount) throw new Error("Credit document must belong to this vendor and be AADE accepted (5.1/5.2)");
      creditDocumentUuid=String(doc.rows[0].id);
    }
    await client.query(`UPDATE vendor_finance_adjustments SET status='approved',approved_by=$2::uuid,approved_at=now(),
        platform_credit_tax_document_id=$3::uuid,evidence=evidence||$4::jsonb,updated_at=now()
      WHERE id=$1::uuid`,[row.id,actor,creditDocumentUuid,JSON.stringify({approvalReason:reason,approvedBy:principal.userId})]);
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
  finally { client.release(); }
  await recordAdminAudit(principal,"finance.adjustment_approved","vendor_finance_adjustment",input.adjustmentId,reason,{vendorId,creditDocumentId:input.creditDocumentId});
  return {ok:true,status:"approved" as const};
}

export async function adminRejectFinanceAdjustment(principal: SessionPrincipal,input:{adjustmentId:string;reason:string}) {
  assertAdminPermission(principal,"finance.write");
  const reason=cleanReason(input.reason); const actor=await actorUuid(principal);
  const result=await db().query(`UPDATE vendor_finance_adjustments SET status='rejected',approved_by=$2::uuid,approved_at=now(),
      evidence=evidence||$3::jsonb,updated_at=now()
    WHERE (public_id=$1 OR id::text=$1) AND status='pending' RETURNING public_id`,[input.adjustmentId,actor,JSON.stringify({rejectionReason:reason,rejectedBy:principal.userId})]);
  if(!result.rowCount) throw new Error("Pending finance adjustment not found");
  await recordAdminAudit(principal,"finance.adjustment_rejected","vendor_finance_adjustment",input.adjustmentId,reason,{});
  return {ok:true,status:"rejected" as const};
}
