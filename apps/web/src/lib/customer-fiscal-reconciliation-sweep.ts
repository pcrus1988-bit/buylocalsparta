import { randomUUID } from "node:crypto";
import { deliverAcceptedCustomerTaxDocumentById } from "./customer-tax-delivery";
import { finalizeCapturedCustomerPayment } from "./customer-payment-finalization";
import { finalizePendingGiftCardSpvIssues } from "./gift-card-fiscalization";
import { reconcileCustomerFiscalDocument } from "./customer-fiscal-reconciliation";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerFiscalReconciliationSweep = Readonly<{
  checked: number;
  accepted: number;
  emailed: number;
  pending: number;
  failed: number;
  emailFailed: number;
  backfilled: number;
  backfillFailed: number;
}>;

const MIN_RECONCILIATION_AGE_MS = 4 * 60_000;
const DEFAULT_SWEEP_LIMIT = 5;
const MAX_SWEEP_LIMIT = 20;
const CUSTOMER_FISCAL_RECONCILIATION_JOB = "customer-fiscal-reconciliation";
const RECONCILIATION_LEASE_MS = 5 * 60_000;

export async function runCustomerFiscalReconciliationSweep(
  now = Date.now(),
  limit = DEFAULT_SWEEP_LIMIT
): Promise<CustomerFiscalReconciliationSweep> {
  if (!productionDatabaseConfigured()) return emptySweep();
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SWEEP_LIMIT) {
    throw new Error(`AADE reconciliation sweep limit must be between 1 and ${MAX_SWEEP_LIMIT}`);
  }

  const db = getProductionPostgresRuntime().nativePool;
  const leaseOwner = `fiscal:${randomUUID()}`;
  const lease = await db.query<{ lock_owner: string }>(`
    INSERT INTO scheduled_jobs(
      name,next_run_at,lock_owner,locked_until,last_started_at,last_succeeded_at,
      consecutive_failures,last_error,updated_at
    )
    VALUES($1,$2,$3,$4,$2,NULL,0,NULL,$2)
    ON CONFLICT(name) DO UPDATE SET
      lock_owner=EXCLUDED.lock_owner,
      locked_until=EXCLUDED.locked_until,
      last_started_at=EXCLUDED.last_started_at,
      updated_at=EXCLUDED.updated_at
    WHERE scheduled_jobs.locked_until IS NULL
       OR scheduled_jobs.locked_until <= EXCLUDED.last_started_at
    RETURNING lock_owner
  `, [
    CUSTOMER_FISCAL_RECONCILIATION_JOB,
    new Date(now),
    leaseOwner,
    new Date(now + RECONCILIATION_LEASE_MS)
  ]);
  if (lease.rows[0]?.lock_owner !== leaseOwner) return emptySweep();

  let completed = false;
  let failureMessage: string | undefined;
  try {
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
    let backfilled = 0;
    let backfillFailed = 0;

    await finalizePendingGiftCardSpvIssues(limit, now);

    const missingFiscalOrders = await db.query<{ order_id: string }>(`
      SELECT o.public_id AS order_id
      FROM customer_orders o
      JOIN payments p ON p.order_id=o.id
      WHERE o.status IN ('confirmed','partially_fulfilled','fulfilled','completed')
        AND p.status IN ('captured','partially_refunded','refunded')
        AND (
          p.captured_minor
          + COALESCE((
              SELECT SUM(ABS(gcl.amount_minor))
              FROM gift_card_ledger gcl
              WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'
            ),0)
        ) >= o.total_minor
        AND NOT EXISTS (
          SELECT 1
          FROM tax_documents td
          WHERE td.order_id=o.id
            AND td.type IN ('pending_customer_sale','retail_receipt','customer_invoice')
        )
      ORDER BY o.confirmed_at ASC NULLS LAST,o.created_at ASC
      LIMIT $1
    `, [limit]);

    for (const missing of missingFiscalOrders.rows) {
      const orderId = missing.order_id?.trim();
      if (!orderId) continue;
      try {
        await finalizeCapturedCustomerPayment(orderId, Date.now());
        backfilled += 1;
      } catch (error) {
        backfillFailed += 1;
        console.error(JSON.stringify({
          level: "error",
          event: "customer_tax.missing_fiscal_backfill_failed",
          orderId,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    }

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

    completed = true;
    return { checked, accepted, emailed, pending, failed, emailFailed, backfilled, backfillFailed };
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const finishedAt = new Date();
    await db.query(`
      UPDATE scheduled_jobs
      SET lock_owner=NULL,
          locked_until=NULL,
          last_succeeded_at=CASE WHEN $4::boolean THEN $2 ELSE last_succeeded_at END,
          consecutive_failures=CASE WHEN $4::boolean THEN 0 ELSE consecutive_failures+1 END,
          last_error=CASE WHEN $4::boolean THEN NULL ELSE $3 END,
          updated_at=$2
      WHERE name=$1 AND lock_owner=$5
    `, [
      CUSTOMER_FISCAL_RECONCILIATION_JOB,
      finishedAt,
      failureMessage?.slice(0, 1000) ?? null,
      completed,
      leaseOwner
    ]).catch(() => undefined);
  }
}

function emptySweep(): CustomerFiscalReconciliationSweep {
  return { checked: 0, accepted: 0, emailed: 0, pending: 0, failed: 0, emailFailed: 0, backfilled: 0, backfillFailed: 0 };
}
