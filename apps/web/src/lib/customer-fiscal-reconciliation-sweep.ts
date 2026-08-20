import { deliverAcceptedCustomerTaxDocumentById } from "./customer-tax-delivery";
import { reconcileCustomerFiscalDocument } from "./customer-fiscal-reconciliation";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerFiscalReconciliationSweep = Readonly<{
  checked: number;
  accepted: number;
  emailed: number;
  pending: number;
  failed: number;
  emailFailed: number;
}>;

const MIN_RECONCILIATION_AGE_MS = 60_000;
const DEFAULT_SWEEP_LIMIT = 5;
const MAX_SWEEP_LIMIT = 20;

export async function runCustomerFiscalReconciliationSweep(
  now = Date.now(),
  limit = DEFAULT_SWEEP_LIMIT
): Promise<CustomerFiscalReconciliationSweep> {
  if (!productionDatabaseConfigured()) return emptySweep();
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SWEEP_LIMIT) {
    throw new Error(`AADE reconciliation sweep limit must be between 1 and ${MAX_SWEEP_LIMIT}`);
  }

  const db = getProductionPostgresRuntime().nativePool;
  const cutoff = new Date(now - MIN_RECONCILIATION_AGE_MS);
  const candidates = await db.query<{ public_id: string }>(
    `SELECT td.public_id
       FROM tax_documents td
      WHERE td.type IN ('retail_receipt','customer_invoice')
        AND td.transmission_status='manual_review'
        AND td.aade_mark IS NULL
        AND td.document_number IS NOT NULL
        AND td.last_transmission_at IS NOT NULL
        AND td.last_transmission_at <= $1
      ORDER BY td.last_transmission_at ASC
      LIMIT $2`,
    [cutoff, limit]
  );

  let checked = 0;
  let accepted = 0;
  let emailed = 0;
  let pending = 0;
  let failed = 0;
  let emailFailed = 0;

  for (const candidate of candidates.rows) {
    const documentId = candidate.public_id?.trim();
    if (!documentId) continue;
    checked += 1;
    try {
      const result = await reconcileCustomerFiscalDocument(documentId, Date.now());
      if (!result.accepted) {
        pending += 1;
        continue;
      }

      accepted += 1;
      try {
        const delivery = await deliverAcceptedCustomerTaxDocumentById(documentId);
        if (delivery.sent) emailed += 1;
      } catch (error) {
        emailFailed += 1;
        console.error(JSON.stringify({
          level: "error",
          event: "customer_tax.reconciliation_email_failed",
          documentId,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        level: "error",
        event: "customer_tax.reconciliation_sweep_item_failed",
        documentId,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  // A document can become accepted outside this process (for example, a governed manual
  // reconciliation after AADE's portal exposes a MARK before RequestTransmittedDocs does).
  // Recover the downstream customer delivery idempotently instead of requiring a second
  // operator action. Only not_sent rows are claimed here; hard delivery failures remain
  // visible for review instead of being retried forever every five minutes.
  const deliveryBacklog = await db.query<{ public_id: string }>(
    `SELECT td.public_id
       FROM tax_documents td
      WHERE td.type IN ('retail_receipt','customer_invoice')
        AND td.transmission_status='accepted'
        AND td.aade_mark IS NOT NULL
        AND td.customer_email_status='not_sent'
      ORDER BY td.issued_at ASC NULLS LAST,td.created_at ASC
      LIMIT $1`,
    [limit]
  );

  for (const candidate of deliveryBacklog.rows) {
    const documentId = candidate.public_id?.trim();
    if (!documentId) continue;
    try {
      const delivery = await deliverAcceptedCustomerTaxDocumentById(documentId);
      if (delivery.sent) emailed += 1;
    } catch (error) {
      emailFailed += 1;
      console.error(JSON.stringify({
        level: "error",
        event: "customer_tax.accepted_delivery_backlog_failed",
        documentId,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  return { checked, accepted, emailed, pending, failed, emailFailed };
}

function emptySweep(): CustomerFiscalReconciliationSweep {
  return { checked: 0, accepted: 0, emailed: 0, pending: 0, failed: 0, emailFailed: 0 };
}
