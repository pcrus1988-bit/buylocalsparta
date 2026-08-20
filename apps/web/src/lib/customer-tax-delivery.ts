import { renderKontaMoyEmail, resendConfigFromEnv, resendDeliveryEnabled, signedKontaMoyText } from "@buy-local-sparta/resend-notifications";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { customerFiscalDocumentForOrder } from "./customer-fiscal-runtime";
import { renderCustomerTaxPdf } from "./customer-tax-pdf";

export async function deliverAcceptedCustomerTaxDocumentById(documentId: string): Promise<{ sent: boolean; reason?: string }> {
  if (!productionDatabaseConfigured() || !resendDeliveryEnabled(process.env) || !process.env.RESEND_API_KEY?.trim()) return { sent: false, reason: "email_not_configured" };
  const db = getProductionPostgresRuntime().nativePool;
  const claimed = await db.query<{ order_id: string; email: string | null }>(`UPDATE tax_documents td
       SET customer_email_status='sending',customer_email_error=NULL
      FROM customer_orders o LEFT JOIN users u ON u.id=o.user_id
     WHERE td.order_id=o.id AND td.public_id=$1 AND td.type IN ('retail_receipt','customer_invoice')
       AND td.transmission_status='accepted' AND td.aade_mark IS NOT NULL
       AND td.customer_email_status IN ('not_sent','failed')
     RETURNING o.public_id AS order_id,u.email`, [documentId]);
  if (!claimed.rowCount) return { sent: false, reason: "not_eligible_or_already_claimed" };
  const row = claimed.rows[0]!;
  if (!row.email) {
    await markFailed(documentId, "Customer email is missing");
    return { sent: false, reason: "customer_email_missing" };
  }
  try {
    const document = await customerFiscalDocumentForOrder(row.order_id);
    if (!document || document.id !== documentId) throw new Error("Accepted fiscal document is not available");
    const pdf = await renderCustomerTaxPdf(document);
    const config = resendConfigFromEnv(process.env);
    const publicBaseUrl = publicBaseUrlFromEnv();
    const emailInput = {
      subject: `Το παραστατικό σας ${document.documentNumber} · KONTA MOY`,
      text: [
        `Η πληρωμή της παραγγελίας ${document.orderId} ολοκληρώθηκε.`,
        "",
        `Επισυνάπτεται το φορολογικό παραστατικό ${document.documentNumber} με MARK ${document.mark}.`,
        "Μπορείτε επίσης να το κατεβάσετε οποιαδήποτε στιγμή από τη συγκεκριμένη παραγγελία στον λογαριασμό σας."
      ].join("\n"),
      eventType: "tax.document_issued",
      locale: "el",
      payload: {
        orderId: document.orderId,
        documentId: document.id,
        documentNumber: document.documentNumber,
        ctaPath: `/account/orders/${encodeURIComponent(document.orderId)}`,
        ctaLabel: "Προβολή παραγγελίας"
      }
    } as const;
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", "idempotency-key": `customer-tax:${document.id}:${document.mark}` },
      body: JSON.stringify({
        from: config.from,
        to: [row.email.trim().toLowerCase()],
        subject: emailInput.subject,
        text: signedKontaMoyText(emailInput, { publicBaseUrl }),
        html: renderKontaMoyEmail(emailInput, { publicBaseUrl }),
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        attachments: [{ filename: `KONTA-MOY-${safeFilename(document.documentNumber)}.pdf`, content: pdf.toString("base64") }]
      })
    });
    const body = await response.json().catch(() => ({})) as { id?: unknown; message?: unknown };
    if (!response.ok || typeof body.id !== "string") throw new Error(`Resend send failed (${response.status})`);
    await db.query(`UPDATE tax_documents SET customer_email_status='sent',customer_email_provider_id=$2,customer_emailed_at=clock_timestamp(),customer_email_error=NULL WHERE public_id=$1`, [documentId, body.id]);
    return { sent: true };
  } catch (error) {
    await markFailed(documentId, error instanceof Error ? error.message : "Tax document email failed");
    throw error;
  }
}

async function markFailed(documentId: string, message: string) {
  await getProductionPostgresRuntime().nativePool.query(`UPDATE tax_documents SET customer_email_status='failed',customer_email_error=$2 WHERE public_id=$1`, [documentId, message.slice(0, 500)]);
}

function publicBaseUrlFromEnv(): string {
  const explicit = process.env.BLS_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  return production ? `https://${production.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : "https://kontamou.site";
}

function safeFilename(value: string): string { return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "parastatiko"; }
