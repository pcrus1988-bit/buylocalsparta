import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { sendTransactionalEmailBestEffort } from "./transactional-email";

export async function sendVendorRejectionOutcomeEmails(input: { fulfilmentId: string }): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const db = getProductionPostgresRuntime().nativePool;
  const original = await db.query<{
    fulfilment_uuid: string;
    order_id: string;
    order_status: string;
    customer_email: string | null;
    rejected_vendor_name: string;
  }>(`SELECT fo.id::text AS fulfilment_uuid,o.public_id AS order_id,o.status::text AS order_status,
             u.email::text AS customer_email,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS rejected_vendor_name
        FROM fulfilment_orders fo
        JOIN customer_orders o ON o.id=fo.order_id
        JOIN vendor_businesses v ON v.id=fo.vendor_id
        LEFT JOIN users u ON u.id=o.user_id
       WHERE fo.public_id=$1 AND fo.status='rejected'
       LIMIT 1`, [input.fulfilmentId]);
  if (!original.rowCount) return;
  const row = original.rows[0];

  const rescues = await db.query<{
    fulfilment_id: string;
    vendor_uuid: string;
    vendor_id: string;
    vendor_name: string;
  }>(`SELECT fo.public_id AS fulfilment_id,v.id::text AS vendor_uuid,v.public_id AS vendor_id,
             COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name
        FROM fulfilment_orders fo JOIN vendor_businesses v ON v.id=fo.vendor_id
       WHERE fo.rescued_from_fulfilment_id=$1::uuid AND fo.status='awaiting_acceptance'
       ORDER BY fo.created_at`, [row.fulfilment_uuid]);

  if (row.customer_email) {
    const actionRequired = row.order_status === "requires_customer_action";
    await sendTransactionalEmailBestEffort({
      to: row.customer_email,
      subject: actionRequired
        ? `Χρειάζεται ενέργεια για την παραγγελία σου · ${row.order_id}`
        : `Η παραγγελία σου ανατέθηκε σε άλλο τοπικό κατάστημα · ${row.order_id}`,
      text: actionRequired
        ? [
            `Το κατάστημα «${row.rejected_vendor_name}» δεν μπόρεσε να εκτελέσει μέρος της παραγγελίας ${row.order_id}.`,
            "",
            "Δεν βρέθηκε αυτόματα πλήρης εναλλακτική ανάθεση για όλα τα είδη. Η ομάδα ΚΟΝΤΑ ΜΟΥ έχει καταγράψει το συμβάν και η παραγγελία χρειάζεται έλεγχο πριν προχωρήσει.",
            "Δεν χρειάζεται να δημιουργήσεις νέα παραγγελία. Θα εμφανίζονται στην υπάρχουσα παραγγελία οι επόμενες ενέργειες και τυχόν οικονομική τακτοποίηση."
          ].join("\n")
        : [
            `Το κατάστημα «${row.rejected_vendor_name}» δεν μπόρεσε να εκτελέσει μέρος της παραγγελίας ${row.order_id}.`,
            "",
            "Το ΚΟΝΤΑ ΜΟΥ βρήκε αυτόματα άλλο διαθέσιμο τοπικό κατάστημα και η παραγγελία συνεχίζεται χωρίς να χρειάζεται δική σου ενέργεια.",
            "Θα λάβεις νέα ενημέρωση μόλις το νέο κατάστημα αποδεχθεί την ανάθεση."
          ].join("\n"),
      eventType: actionRequired ? "order.vendor_rejected_action_required" : "order.vendor_reassigned",
      idempotencyKey: `order-rejection-outcome:${row.order_id}:${input.fulfilmentId}:customer`,
      payload: {
        orderId: row.order_id,
        rejectedFulfilmentId: input.fulfilmentId,
        ctaPath: `/account/orders/${encodeURIComponent(row.order_id)}`,
        ctaLabel: "Προβολή παραγγελίας"
      }
    });
  }

  for (const rescue of rescues.rows) {
    const recipients = await db.query<{ user_id: string; email: string }>(`SELECT DISTINCT u.public_id AS user_id,u.email::text AS email
        FROM vendor_users vu JOIN users u ON u.id=vu.user_id
       WHERE vu.vendor_id=$1::uuid AND u.email IS NOT NULL AND length(trim(u.email::text))>0`, [rescue.vendor_uuid]);
    for (const recipient of recipients.rows) {
      await sendTransactionalEmailBestEffort({
        to: recipient.email,
        subject: `Νέα πληρωμένη παραγγελία μετά από αυτόματη ανάθεση · ${row.order_id}`,
        text: [
          `Η παραγγελία ${row.order_id} ανατέθηκε στο κατάστημα «${rescue.vendor_name}» μέσω του μηχανισμού εναλλακτικού τοπικού προμηθευτή.`,
          "",
          "Η παραγγελία είναι ήδη πληρωμένη και χρειάζεται αποδοχή ή απόρριψη. Παρακαλούμε ελέγξτε άμεσα τα είδη και το διαθέσιμο απόθεμα στο Vendor Daily."
        ].join("\n"),
        eventType: "vendor.order_rescue_assigned",
        idempotencyKey: `vendor-rescue-assigned:${row.order_id}:${rescue.fulfilment_id}:${recipient.user_id}`,
        payload: {
          orderId: row.order_id,
          fulfilmentId: rescue.fulfilment_id,
          vendorId: rescue.vendor_id,
          ctaPath: "/daily",
          ctaLabel: "Άνοιγμα Vendor Daily"
        }
      });
    }
  }
}
