import type { SessionPrincipal } from "@buy-local-sparta/core";
import { prepareCustomerFiscalDocument } from "./admin-fiscal-preparation";
import { deliverAcceptedCustomerTaxDocumentById } from "./customer-tax-delivery";
import { reconcileCustomerFiscalDocument } from "./customer-fiscal-reconciliation";
import { capturePaidOrderForFiscalIssuance } from "./customer-fiscal-runtime";
import { configuredMyDataService, myDataAdminRuntimeConfig } from "./mydata-runtime";
import { syncConfirmedOrderLifecycle } from "./order-lifecycle";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { verifiedVivaProcessorMethod } from "./viva-runtime";

export type CapturedPaymentFinalization = Readonly<{
  orderId: string;
  orderNumber?: string;
  documentId?: string;
  documentNumber?: string;
  fiscalStatus: "disabled" | "not_captured" | "captured" | "ready" | "accepted" | "rejected" | "manual_review";
  aadeMark?: string;
  error?: string;
}>;

const SYSTEM_FISCAL_PRINCIPAL: SessionPrincipal = {
  userId: "system_fiscalization",
  email: "system-fiscalization@kontamou.local",
  roles: ["platform_finance"],
  csrfToken: "system",
  sessionId: "system-fiscalization"
};

export async function finalizeCapturedCustomerPayment(orderId: string, now = Date.now()): Promise<CapturedPaymentFinalization> {
  const orderNumber = await publicOrderNumber(orderId);
  await syncConfirmedOrderLifecycle(orderId, now);

  const config = await myDataAdminRuntimeConfig();
  if (!config.capturePaidOrders) return { orderId, orderNumber, fiscalStatus: "disabled" };

  const captured = await capturePaidOrderForFiscalIssuance(orderId, now);
  if (!captured.captured || !captured.documentId) return { orderId, orderNumber, fiscalStatus: "not_captured" };
  const documentId = captured.documentId;

  if (!config.issuanceEnabled) return { orderId, orderNumber, documentId, fiscalStatus: "captured" };

  const existing = await fiscalSnapshot(orderId, orderNumber, documentId);
  if (existing.fiscalStatus === "accepted") {
    await emailAcceptedDocumentBestEffort(documentId, config.emailAcceptedDocuments);
    return existing;
  }

  // A numbered document with a prior uncertain/rejected transmission must be reconciled
  // against AADE before any attempt to prepare or send it again.
  if (existing.documentNumber && ["rejected", "manual_review"].includes(existing.fiscalStatus)) {
    try {
      await reconcileCustomerFiscalDocument(documentId, now);
      const reconciled = await fiscalSnapshot(orderId, orderNumber, documentId);
      if (reconciled.fiscalStatus === "accepted") await emailAcceptedDocumentBestEffort(documentId, config.emailAcceptedDocuments);
      return reconciled;
    } catch (error) {
      const message = error instanceof Error ? error.message : "AADE reconciliation failed";
      await recordFiscalFailure(documentId, message).catch(() => undefined);
      return await fiscalSnapshot(orderId, orderNumber, documentId).catch(() => ({ orderId, orderNumber, documentId, fiscalStatus: "manual_review", error: message }));
    }
  }

  try {
    const transactionId = await capturedVivaTransactionId(orderId);
    const processorMethod = await verifiedVivaProcessorMethod(transactionId);
    const prepared = await prepareCustomerFiscalDocument({
      documentId,
      eventCode: "b2c_goods_gr",
      processor: "VIVA",
      processorMethod,
      reason: `automatic fiscalization after verified Viva Smart Checkout ${processorMethod} capture`
    });
    const service = await configuredMyDataService();
    if (!service) throw new Error("AADE myDATA service is not configured");
    const transmission = await service.transmitPreparedDocument(SYSTEM_FISCAL_PRINCIPAL, { documentId: prepared.documentId, now });

    // AADE can return statusCode=Success while the immediate ResponseDoc omits MARK.
    // Never interpret that as a rejection or resend blindly: verify the issued document
    // through RequestTransmittedDocs and recover its authoritative MARK/UID/QR.
    if (transmission.ok && transmission.items.length > 0 && !transmission.items.some((item) => item.invoiceMark)) {
      await reconcileCustomerFiscalDocument(documentId, now);
    }
    const finalized = await fiscalSnapshot(orderId, orderNumber, documentId);
    if (finalized.fiscalStatus === "accepted") await emailAcceptedDocumentBestEffort(documentId, config.emailAcceptedDocuments);
    return finalized;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic fiscalization failed";
    await recordFiscalFailure(documentId, message).catch(() => undefined);
    const snapshot = await fiscalSnapshot(orderId, orderNumber, documentId).catch(() => undefined);
    return snapshot ?? { orderId, orderNumber, documentId, fiscalStatus: "manual_review", error: message };
  }
}

async function emailAcceptedDocumentBestEffort(documentId: string, enabled: boolean): Promise<void> {
  if (!enabled) return;
  try {
    await deliverAcceptedCustomerTaxDocumentById(documentId);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "customer_tax.email_delivery_failed",
      documentId,
      message: error instanceof Error ? error.message : String(error)
    }));
  }
}

async function publicOrderNumber(orderId: string): Promise<string | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().nativePool.query<{ order_number: string }>(
    `SELECT order_number FROM customer_orders WHERE public_id=$1 LIMIT 1`,
    [orderId]
  );
  return result.rows[0]?.order_number;
}

async function capturedVivaTransactionId(orderId: string): Promise<string> {
  if (!productionDatabaseConfigured()) throw new Error("Verified Viva transaction lookup requires PostgreSQL");
  const result = await getProductionPostgresRuntime().nativePool.query<{ provider_transaction_id: string | null }>(
    `SELECT p.provider_transaction_id
       FROM payments p JOIN customer_orders o ON o.id=p.order_id
      WHERE o.public_id=$1 AND p.provider='viva' AND p.status IN ('captured','partially_refunded','refunded')
      ORDER BY p.updated_at DESC LIMIT 1`,
    [orderId]
  );
  const transactionId = result.rows[0]?.provider_transaction_id?.trim();
  if (!transactionId) throw new Error("Captured Viva payment is missing its verified transaction id");
  return transactionId;
}

async function fiscalSnapshot(orderId: string, orderNumber: string | undefined, documentId: string): Promise<CapturedPaymentFinalization> {
  if (!productionDatabaseConfigured()) return { orderId, orderNumber, documentId, fiscalStatus: "captured" };
  const result = await getProductionPostgresRuntime().nativePool.query<{
    document_number: string | null;
    transmission_status: string;
    aade_mark: string | null;
    last_error: string | null;
  }>(`SELECT document_number,transmission_status,aade_mark,last_error FROM tax_documents WHERE public_id=$1 LIMIT 1`, [documentId]);
  const row = result.rows[0];
  if (!row) return { orderId, orderNumber, documentId, fiscalStatus: "not_captured" };
  const status = normalizeFiscalStatus(row.transmission_status);
  return {
    orderId,
    orderNumber,
    documentId,
    documentNumber: row.document_number ?? undefined,
    fiscalStatus: status,
    aadeMark: row.aade_mark ?? undefined,
    error: row.last_error ?? undefined
  };
}

async function recordFiscalFailure(documentId: string, message: string): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  await getProductionPostgresRuntime().nativePool.query(
    `UPDATE tax_documents
        SET transmission_status=CASE WHEN transmission_status IN ('not_ready','ready') THEN 'manual_review' ELSE transmission_status END,
            last_error=CASE WHEN transmission_status='accepted' THEN last_error ELSE $2 END
      WHERE public_id=$1`,
    [documentId, message.slice(0, 1000)]
  );
}

function normalizeFiscalStatus(value: string): CapturedPaymentFinalization["fiscalStatus"] {
  if (["accepted", "rejected", "manual_review", "ready"].includes(value)) return value as CapturedPaymentFinalization["fiscalStatus"];
  return "captured";
}
