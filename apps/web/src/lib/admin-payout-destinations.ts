import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type AdminPayoutDestinationWorkspace = Readonly<{
  vendors: readonly Readonly<{ id: string; name: string; status: string }>[];
  destinations: readonly Readonly<{
    id: string;
    vendorId: string;
    vendorName: string;
    provider: string;
    displayLabel: string;
    maskedAccount: string;
    accountHolder: string;
    bic?: string;
    status: string;
    createdBy?: string;
    verifiedBy?: string;
    verifiedAt?: number;
    effectiveAt: number;
    supersededAt?: number;
    createdAt: number;
  }>[];
}>;

type CreateInput = Readonly<{
  vendorId: string;
  provider: string;
  providerReference: string;
  displayLabel: string;
  maskedAccount: string;
  accountHolder: string;
  bic?: string;
  reason: string;
}>;

type DecisionInput = Readonly<{ destinationId: string; reason: string }>;

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function opt(value: unknown): string | undefined { const v=text(value).trim(); return v || undefined; }
function epoch(value: unknown): number | undefined { if (!value) return undefined; const n=new Date(String(value)).getTime(); return Number.isFinite(n) ? n : undefined; }
function requireReason(reason: string): string { const value=reason.trim(); if (value.length < 5) throw new Error("Απαιτείται αιτιολογία τουλάχιστον 5 χαρακτήρων"); return value; }
function normalizeProvider(value: string): string { const result=value.trim().toLowerCase(); if (!/^[a-z0-9_-]{2,40}$/.test(result)) throw new Error("Invalid payout provider"); return result; }
function assertTokenizedReference(value: string): string {
  const reference=value.trim();
  if (reference.length < 6 || reference.length > 200) throw new Error("A tokenized payout provider reference is required");
  const compact=reference.replace(/\s+/g,"");
  if (/^GR\d{25}$/i.test(compact) || /^\d{15,34}$/.test(compact)) throw new Error("Do not store a full IBAN/account number. Store only the vault/provider token.");
  return reference;
}
function assertMaskedAccount(value: string): string {
  const masked=value.trim();
  if (masked.length < 5 || masked.length > 60) throw new Error("Masked account label is required");
  if (!/[•*xX]/.test(masked)) throw new Error("Account display must be masked (for example GR••••1234)");
  return masked;
}
function requireDb() {
  if (!productionDatabaseConfigured()) throw new Error("Payout destination management requires PostgreSQL");
  return getProductionPostgresRuntime().nativePool;
}
async function actorUuid(principal: SessionPrincipal): Promise<string> {
  const row=await requireDb().query(`SELECT id::text FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1`,[principal.userId]);
  if (!row.rowCount) throw new Error("Admin actor was not found");
  return String(row.rows[0].id);
}

export async function adminPayoutDestinationsWorkspace(principal: SessionPrincipal): Promise<AdminPayoutDestinationWorkspace> {
  assertAdminPermission(principal,"finance.read");
  const db=requireDb();
  const [vendors,destinations]=await Promise.all([
    db.query(`SELECT public_id,COALESCE(NULLIF(trading_name,''),legal_name) AS name,status::text
      FROM vendor_businesses
      WHERE status::text <> 'closed'
      ORDER BY lower(COALESCE(NULLIF(trading_name,''),legal_name)),public_id`),
    db.query(`SELECT d.public_id,v.public_id AS vendor_public_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,
        d.provider,d.display_label,d.masked_account,d.account_holder,d.bic,d.status,d.effective_at,d.superseded_at,d.created_at,
        cu.public_id AS created_by,vu.public_id AS verified_by,d.verified_at
      FROM vendor_payout_destinations d
      JOIN vendor_businesses v ON v.id=d.vendor_id
      LEFT JOIN users cu ON cu.id=d.created_by
      LEFT JOIN users vu ON vu.id=d.verified_by
      ORDER BY CASE d.status WHEN 'pending' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END,d.created_at DESC`)
  ]);
  return {
    vendors: vendors.rows.map(row=>({id:text(row.public_id),name:text(row.name),status:text(row.status)})),
    destinations: destinations.rows.map(row=>({
      id:text(row.public_id),vendorId:text(row.vendor_public_id),vendorName:text(row.vendor_name),provider:text(row.provider),
      displayLabel:text(row.display_label),maskedAccount:text(row.masked_account),accountHolder:text(row.account_holder),bic:opt(row.bic),
      status:text(row.status),createdBy:opt(row.created_by),verifiedBy:opt(row.verified_by),verifiedAt:epoch(row.verified_at),
      effectiveAt:epoch(row.effective_at) ?? 0,supersededAt:epoch(row.superseded_at),createdAt:epoch(row.created_at) ?? 0
    }))
  };
}

export async function adminCreatePayoutDestination(principal: SessionPrincipal,input:CreateInput) {
  assertAdminPermission(principal,"finance.write");
  const reason=requireReason(input.reason);
  const provider=normalizeProvider(input.provider);
  const providerReference=assertTokenizedReference(input.providerReference);
  const maskedAccount=assertMaskedAccount(input.maskedAccount);
  const displayLabel=input.displayLabel.trim();
  const accountHolder=input.accountHolder.trim();
  if (displayLabel.length < 2 || displayLabel.length > 80) throw new Error("Display label is required");
  if (accountHolder.length < 2 || accountHolder.length > 160) throw new Error("Account holder is required");
  const db=requireDb(); const client=await db.connect();
  let destinationId="";
  try {
    await client.query("BEGIN");
    const actor=await actorUuid(principal);
    const vendor=await client.query(`SELECT id::text,public_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 FOR UPDATE`,[input.vendorId]);
    if (!vendor.rowCount) throw new Error("Vendor not found");
    const vendorUuid=String(vendor.rows[0].id);
    await client.query(`UPDATE vendor_payout_destinations SET status='disabled',superseded_at=now(),updated_at=now()
      WHERE vendor_id=$1::uuid AND status='pending' AND superseded_at IS NULL`,[vendorUuid]);
    const inserted=await client.query(`INSERT INTO vendor_payout_destinations(
        vendor_id,provider,provider_reference,display_label,masked_account,account_holder,bic,status,effective_at,metadata,created_by,created_at,updated_at
      ) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,'pending',now(),$8::jsonb,$9::uuid,now(),now()) RETURNING public_id`,[
      vendorUuid,provider,providerReference,displayLabel,maskedAccount,accountHolder,input.bic?.trim()||null,
      JSON.stringify({reason,source:"admin_finance"}),actor
    ]);
    destinationId=String(inserted.rows[0].public_id);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
  finally { client.release(); }
  await recordAdminAudit(principal,"finance.payout_destination_created","vendor_payout_destination",destinationId,reason,{vendorId:input.vendorId,provider,displayLabel,maskedAccount,accountHolder});
  return {ok:true,destinationId,status:"pending" as const};
}

export async function adminVerifyPayoutDestination(principal: SessionPrincipal,input:DecisionInput) {
  assertAdminPermission(principal,"finance.write");
  const reason=requireReason(input.reason); const db=requireDb(); const client=await db.connect();
  let vendorId="";
  try {
    await client.query("BEGIN");
    const actor=await actorUuid(principal);
    const destination=await client.query(`SELECT d.id::text,d.public_id,d.vendor_id::text,d.status,d.created_by::text,v.public_id AS vendor_public_id
      FROM vendor_payout_destinations d JOIN vendor_businesses v ON v.id=d.vendor_id
      WHERE d.public_id=$1 OR d.id::text=$1 FOR UPDATE`,[input.destinationId]);
    if (!destination.rowCount) throw new Error("Payout destination not found");
    const row=destination.rows[0];
    if (String(row.status)!=="pending") throw new Error("Only a pending payout destination can be verified");
    if (row.created_by && String(row.created_by)===actor) throw new Error("Maker/checker rule: the creator cannot verify the same payout destination");
    vendorId=String(row.vendor_public_id);
    await client.query(`UPDATE vendor_payout_destinations SET status='disabled',superseded_at=now(),updated_at=now()
      WHERE vendor_id=$1::uuid AND status='verified' AND superseded_at IS NULL AND id<>$2::uuid`,[row.vendor_id,row.id]);
    await client.query(`UPDATE vendor_payout_destinations SET status='verified',verified_by=$2::uuid,verified_at=now(),effective_at=now(),updated_at=now(),metadata=metadata||$3::jsonb
      WHERE id=$1::uuid`,[row.id,actor,JSON.stringify({verificationReason:reason})]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
  finally { client.release(); }
  await recordAdminAudit(principal,"finance.payout_destination_verified","vendor_payout_destination",input.destinationId,reason,{vendorId});
  return {ok:true,destinationId:input.destinationId,status:"verified" as const};
}

export async function adminDisablePayoutDestination(principal: SessionPrincipal,input:DecisionInput) {
  assertAdminPermission(principal,"finance.write");
  const reason=requireReason(input.reason); const db=requireDb();
  const result=await db.query(`UPDATE vendor_payout_destinations
    SET status='disabled',superseded_at=COALESCE(superseded_at,now()),updated_at=now(),metadata=metadata||$2::jsonb
    WHERE public_id=$1 AND status IN ('pending','verified') RETURNING public_id`,[input.destinationId,JSON.stringify({disabledReason:reason})]);
  if (!result.rowCount) throw new Error("Active payout destination not found");
  await recordAdminAudit(principal,"finance.payout_destination_disabled","vendor_payout_destination",input.destinationId,reason,{});
  return {ok:true,destinationId:input.destinationId,status:"disabled" as const};
}
