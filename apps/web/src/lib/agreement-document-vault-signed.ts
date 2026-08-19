import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  agreementActorUserId,
  agreementAudit,
  agreementOptionalTimestamp,
  agreementPdfData,
  agreementPdfHash,
  agreementPdfObjectKey,
  agreementText,
  upsertAgreementVaultPdf
} from "./agreement-document-vault-common";

export async function storeSignedCommercialAgreementVault(
  principal: SessionPrincipal,
  input: { agreementId: unknown; govgrReference: unknown; signedAt?: unknown; file: File }
): Promise<void> {
  const agreementId = agreementText(input.agreementId, "agreementId");
  const govgrReference = agreementText(input.govgrReference, "govgrReference", 500);
  const signedAt = agreementOptionalTimestamp(input.signedAt, "signedAt") ?? new Date();
  if (input.file.size <= 0 || input.file.size > 15 * 1024 * 1024) throw new Error("Signed PDF must be between 1 byte and 15 MB");
  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("The signed document must be a PDF");

  const { row } = await agreementPdfData(agreementId);
  if (!["pdf_generated", "sent", "pending_signature", "signed_received"].includes(String(row.status))) {
    throw new Error("Signed PDF cannot be attached in the current agreement state");
  }
  if (!row.unsigned_pdf_object_key) throw new Error("The original generated contract PDF is missing");
  const objectKey = agreementPdfObjectKey(String(row.vendor_public_id), String(row.agreement_code), Number(row.agreement_version), "signed-govgr");
  const sha256 = agreementPdfHash(buffer);

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT id,vendor_id,status FROM vendor_commercial_agreements WHERE id=$1 FOR UPDATE`, [row.id]);
    if (!current.rowCount) throw new Error("Agreement not found");
    const fromStatus = String(current.rows[0].status);
    if (["govgr_verified", "eligible_for_activation", "active"].includes(fromStatus)) {
      throw new Error("A verified agreement cannot be replaced; create a new agreement version instead");
    }
    const actorUserId = await agreementActorUserId(client, principal);
    await upsertAgreementVaultPdf(client, {
      agreementId: String(row.id),
      vendorId: String(current.rows[0].vendor_id),
      objectKey,
      kind: "signed-govgr",
      buffer,
      sha256,
      actorUserId
    });
    await client.query(`
      UPDATE vendor_commercial_agreements
      SET signed_pdf_object_key=$2,signed_pdf_sha256=$3,signed_document_received_at=now(),signed_at=$4,
          govgr_reference=$5,source_document_reference=$5,govgr_verified_at=NULL,govgr_verified_by=NULL,
          status='signed_received',updated_at=now()
      WHERE id=$1
    `, [row.id, objectKey, sha256, signedAt, govgrReference]);
    await agreementAudit(client, {
      agreementId: String(row.id),
      vendorId: String(current.rows[0].vendor_id),
      action: "signed_pdf_received",
      fromStatus,
      toStatus: "signed_received",
      actorUserId,
      metadata: { objectKey, sha256, govgrReference, storage: "postgres_document_vault" }
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
