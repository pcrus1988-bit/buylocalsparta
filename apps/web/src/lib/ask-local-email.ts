import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { sendTransactionalEmailBestEffort } from "./transactional-email";

export async function sendAskLocalVendorAssignmentEmails(input: { requestId: string; vendorId: string }): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const db = getProductionPostgresRuntime().nativePool;
  const request = await db.query<{
    request_id: string;
    reference_number: string;
    need: string | null;
    category: string | null;
    postcode: string;
    requested_quantity: number | string;
    expires_at: Date | null;
    customer_email: string | null;
    vendor_uuid: string;
    vendor_id: string;
    vendor_name: string;
  }>(`SELECT cr.public_id AS request_id,COALESCE(cr.reference_number,cr.public_id) AS reference_number,
             cr.source_metadata->>'need' AS need,cr.source_metadata->>'category' AS category,cr.postcode,cr.requested_quantity,cr.expires_at,
             customer.email::text AS customer_email,v.id::text AS vendor_uuid,v.public_id AS vendor_id,
             COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name
        FROM counteroffer_requests cr
        JOIN users customer ON customer.id=cr.customer_user_id
        JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
       WHERE (cr.public_id=$1 OR cr.reference_number=$1) AND v.public_id=$2
       LIMIT 1`, [input.requestId, input.vendorId]);
  if (!request.rowCount) return;
  const row = request.rows[0];
  const due = row.expires_at ? row.expires_at.toLocaleString("el-GR", { timeZone: "Europe/Athens" }) : undefined;
  const recipients = await db.query<{ user_id: string; email: string }>(`SELECT DISTINCT u.public_id AS user_id,u.email::text AS email
      FROM vendor_users vu JOIN users u ON u.id=vu.user_id
     WHERE vu.vendor_id=$1::uuid AND u.email IS NOT NULL AND length(trim(u.email::text))>0`, [row.vendor_uuid]);
  for (const recipient of recipients.rows) {
    await sendTransactionalEmailBestEffort({
      to: recipient.email,
      subject: `Νέο Ask Local αίτημα · ${row.reference_number}`,
      text: [
        `Η ομάδα KONTA MOY ανέθεσε στο κατάστημα «${row.vendor_name}» νέο αίτημα Ask Local.`,
        "",
        `Αίτημα: ${row.need || "Αναζήτηση τοπικού προϊόντος"}`,
        row.category ? `Κατηγορία: ${row.category}` : undefined,
        `Ποσότητα: ${Number(row.requested_quantity)}`,
        `Τ.Κ.: ${row.postcode}`,
        due ? `Προθεσμία απάντησης: ${due}` : undefined,
        "",
        "Παρακαλούμε ελέγξτε το αίτημα και απαντήστε μέσα από το Vendor Workspace."
      ].filter((line): line is string => typeof line === "string").join("\n"),
      eventType: "vendor.ask_local_assigned",
      idempotencyKey: `ask-local-assigned:${row.request_id}:${row.vendor_id}:${recipient.user_id}`,
      payload: {
        requestId: row.request_id,
        vendorId: row.vendor_id,
        ctaPath: "/vendor",
        ctaLabel: "Προβολή Ask Local"
      }
    });
  }
  if (row.customer_email) {
    await sendTransactionalEmailBestEffort({
      to: row.customer_email,
      subject: `Το Ask Local αίτημά σου προωθήθηκε σε τοπικό κατάστημα · ${row.reference_number}`,
      text: [
        `Το αίτημα Ask Local ${row.reference_number} προωθήθηκε στο «${row.vendor_name}».`,
        "",
        "Το κατάστημα θα ελέγξει τη διαθεσιμότητα και τις δυνατότητες εξυπηρέτησης. Θα λάβεις νέα ενημέρωση μόλις υπάρξει απάντηση ή πρόταση."
      ].join("\n"),
      eventType: "ask_local.vendor_assigned",
      idempotencyKey: `ask-local-customer-assigned:${row.request_id}:${row.vendor_id}`,
      payload: {
        requestId: row.request_id,
        ctaPath: "/account",
        ctaLabel: "Προβολή λογαριασμού"
      }
    });
  }
}
