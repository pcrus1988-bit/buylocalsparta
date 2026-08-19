import type { SessionPrincipal } from "@buy-local-sparta/core";
import { resendConfigFromEnv } from "@buy-local-sparta/resend-notifications";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { KONTA_MOY_LEGAL_DETAILS } from "./vendor-agreement-pdf";
import {
  agreementActorUserId,
  agreementAudit,
  agreementPdfData,
  agreementRecord,
  agreementText,
  readAgreementVaultPdf
} from "./agreement-document-vault-common";

export async function emailCommercialAgreementPdfVault(principal: SessionPrincipal, agreementIdRaw: unknown): Promise<void> {
  const agreementId = agreementText(agreementIdRaw, "agreementId");
  const { row } = await agreementPdfData(agreementId);
  if (!row.unsigned_pdf_object_key) throw new Error("Generate the agreement PDF before sending it");
  const vendorSnapshot = agreementRecord(row.vendor_snapshot);
  const destination = typeof vendorSnapshot.contactEmail === "string" ? vendorSnapshot.contactEmail.trim() : "";
  if (!destination) throw new Error("Vendor contract email is missing");
  const attachment = await readAgreementVaultPdf(String(row.unsigned_pdf_object_key));
  const config = resendConfigFromEnv();
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/emails`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `vendor-agreement-${row.public_id}-${Date.now()}`
    },
    body: JSON.stringify({
      from: config.from,
      to: [destination],
      reply_to: KONTA_MOY_LEGAL_DETAILS.email,
      subject: `KONTA MOY – Συμφωνία συνεργασίας ${row.agreement_code}`,
      text: `Σας αποστέλλουμε τη συμφωνία συνεργασίας ${row.agreement_code} (έκδοση v${row.agreement_version}). Παρακαλούμε ελέγξτε τα στοιχεία και ολοκληρώστε τη συνυπογραφή μέσω gov.gr. Για οποιαδήποτε διευκρίνιση: ${KONTA_MOY_LEGAL_DETAILS.email}.`,
      attachments: [{ filename: `${row.agreement_code}-v${row.agreement_version}-unsigned.pdf`, content: attachment.toString("base64") }]
    })
  });
  const responseBody = await response.json().catch(() => ({})) as { id?: unknown; message?: unknown };
  if (!response.ok) throw new Error(`Agreement email failed (${response.status}): ${typeof responseBody.message === "string" ? responseBody.message : "unexpected response"}`);

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT id,vendor_id,status FROM vendor_commercial_agreements WHERE id=$1 FOR UPDATE`, [row.id]);
    if (!current.rowCount) throw new Error("Agreement not found");
    const actorUserId = await agreementActorUserId(client, principal);
    const fromStatus = String(current.rows[0].status);
    await client.query(`UPDATE vendor_commercial_agreements SET pdf_sent_at=now(),status='pending_signature',updated_at=now() WHERE id=$1`, [row.id]);
    await agreementAudit(client, {
      agreementId: String(row.id),
      vendorId: String(current.rows[0].vendor_id),
      action: "pdf_emailed",
      fromStatus,
      toStatus: "pending_signature",
      actorUserId,
      metadata: { destination, providerMessageId: responseBody.id ?? null, storage: "postgres_document_vault" }
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
