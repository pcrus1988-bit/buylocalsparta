import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { KONTA_MOY_LEGAL_DETAILS, renderVendorAgreementPdf } from "./vendor-agreement-pdf";
import {
  agreementActorUserId,
  agreementAudit,
  agreementPdfData,
  agreementPdfHash,
  agreementPdfObjectKey,
  agreementText,
  upsertAgreementVaultPdf
} from "./agreement-document-vault-common";

export async function generateCommercialAgreementPdfVault(principal: SessionPrincipal, agreementIdRaw: unknown): Promise<void> {
  const agreementId = agreementText(agreementIdRaw, "agreementId");
  const { row, data } = await agreementPdfData(agreementId);
  if (!["data_complete", "pdf_generated"].includes(String(row.status))) {
    throw new Error("PDF can only be generated before the agreement is sent for signature");
  }

  const buffer = await renderVendorAgreementPdf(data);
  if (buffer.byteLength <= 0 || buffer.byteLength > 15 * 1024 * 1024) throw new Error("Generated agreement PDF size is invalid");
  const sha256 = agreementPdfHash(buffer);
  const objectKey = agreementPdfObjectKey(String(row.vendor_public_id), String(row.agreement_code), Number(row.agreement_version), "unsigned");

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT id,vendor_id,status FROM vendor_commercial_agreements WHERE id=$1 FOR UPDATE`, [row.id]);
    if (!current.rowCount) throw new Error("Agreement not found");
    const fromStatus = String(current.rows[0].status);
    if (!["data_complete", "pdf_generated"].includes(fromStatus)) throw new Error("Agreement changed while PDF was being generated");
    const actorUserId = await agreementActorUserId(client, principal);

    await upsertAgreementVaultPdf(client, {
      agreementId: String(row.id),
      vendorId: String(current.rows[0].vendor_id),
      objectKey,
      kind: "unsigned",
      buffer,
      sha256,
      actorUserId
    });
    await client.query(`
      UPDATE vendor_commercial_agreements
      SET unsigned_pdf_object_key=$2,unsigned_pdf_sha256=$3,pdf_generated_at=now(),status='pdf_generated',updated_at=now()
      WHERE id=$1
    `, [row.id, objectKey, sha256]);
    await agreementAudit(client, {
      agreementId: String(row.id),
      vendorId: String(current.rows[0].vendor_id),
      action: "pdf_generated",
      fromStatus,
      toStatus: "pdf_generated",
      actorUserId,
      metadata: { objectKey, sha256, storage: "postgres_document_vault", contactEmail: KONTA_MOY_LEGAL_DETAILS.email }
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
