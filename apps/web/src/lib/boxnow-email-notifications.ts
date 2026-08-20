import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { sendTransactionalEmailBestEffort } from "./transactional-email";

const IMPORTANT_EVENTS = new Set(["accepted-to-locker", "final-destination", "delivered", "expired", "returned", "cancelled", "missing", "lost"]);

export async function sendBoxNowCustomerEmail(input: { shipmentId?: string; eventId: string; event: string; parcelId: string }): Promise<void> {
  if (!productionDatabaseConfigured() || !input.shipmentId || !IMPORTANT_EVENTS.has(input.event)) return;
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<{
    order_id: string;
    order_number: string;
    customer_email: string | null;
    tracking_number: string | null;
    destination_label: string | null;
  }>(`SELECT o.public_id AS order_id,o.order_number,u.email::text AS customer_email,s.tracking_number,
             o.shipping_address_snapshot->>'providerDestinationLabel' AS destination_label
        FROM shipments s
        JOIN customer_orders o ON o.id=s.order_id
        LEFT JOIN users u ON u.id=o.user_id
       WHERE s.public_id=$1 LIMIT 1`, [input.shipmentId]);
  if (!result.rowCount || !result.rows[0].customer_email) return;
  const row = result.rows[0];
  const copy = boxNowCopy(input.event, row);
  if (!copy) return;
  await sendTransactionalEmailBestEffort({
    to: row.customer_email!,
    subject: `${copy.subject} · ${row.order_number}`,
    text: copy.body,
    eventType: `shipping.boxnow.${input.event}`,
    idempotencyKey: `boxnow-customer:${input.eventId}`,
    payload: {
      orderId: row.order_id,
      shipmentId: input.shipmentId,
      parcelId: input.parcelId,
      trackingNumber: row.tracking_number,
      ctaPath: `/account/orders/${encodeURIComponent(row.order_id)}`,
      ctaLabel: copy.ctaLabel
    }
  });
}

function boxNowCopy(event: string, row: { order_id: string; tracking_number: string | null; destination_label: string | null }): { subject: string; body: string; ctaLabel: string } | undefined {
  const tracking = row.tracking_number ? `\nTracking: ${row.tracking_number}` : "";
  if (event === "accepted-to-locker") return {
    subject: "Η αποστολή σου ξεκίνησε με BOX NOW",
    body: `Η BOX NOW παρέλαβε το δέμα για την παραγγελία ${row.order_id} και η μεταφορά έχει ξεκινήσει.${tracking}\n\nΘα σε ενημερώσουμε ξανά όταν το δέμα φτάσει στη θυρίδα παραλαβής.`,
    ctaLabel: "Παρακολούθηση παραγγελίας"
  };
  if (event === "final-destination") return {
    subject: "Το δέμα σου είναι στη θυρίδα BOX NOW",
    body: `Το δέμα της παραγγελίας ${row.order_id} βρίσκεται πλέον στη θυρίδα BOX NOW${row.destination_label ? ` «${row.destination_label}»` : ""} και είναι έτοιμο για παραλαβή.${tracking}\n\nΑκολούθησε τις οδηγίες της BOX NOW για να ανοίξεις τη θυρίδα και να παραλάβεις το δέμα σου.`,
    ctaLabel: "Προβολή στοιχείων παραλαβής"
  };
  if (event === "delivered") return {
    subject: "Η παραγγελία σου παραδόθηκε",
    body: `Η BOX NOW επιβεβαίωσε την ολοκλήρωση της παράδοσης για την παραγγελία ${row.order_id}.${tracking}`,
    ctaLabel: "Προβολή παραγγελίας"
  };
  if (event === "expired") return {
    subject: "Έληξε η προθεσμία παραλαβής BOX NOW",
    body: `Η προθεσμία παραλαβής για την παραγγελία ${row.order_id} έληξε και το δέμα έχει μπει σε διαδικασία επιστροφής.${tracking}\n\nΆνοιξε την παραγγελία για την τρέχουσα κατάσταση.`,
    ctaLabel: "Έλεγχος παραγγελίας"
  };
  if (event === "returned") return {
    subject: "Η αποστολή BOX NOW επιστράφηκε",
    body: `Η BOX NOW ενημέρωσε ότι το δέμα της παραγγελίας ${row.order_id} επιστράφηκε στον αποστολέα.${tracking}\n\nΗ ομάδα KONTA MOY θα διαχειριστεί τα επόμενα βήματα μέσα από την ίδια παραγγελία.`,
    ctaLabel: "Έλεγχος παραγγελίας"
  };
  if (event === "cancelled") return {
    subject: "Η αποστολή BOX NOW ακυρώθηκε",
    body: `Η αποστολή BOX NOW που συνδέεται με την παραγγελία ${row.order_id} ακυρώθηκε.${tracking}\n\nΗ κατάσταση της παραγγελίας και τυχόν επόμενες ενέργειες εμφανίζονται στον λογαριασμό σου.`,
    ctaLabel: "Έλεγχος παραγγελίας"
  };
  if (event === "missing" || event === "lost") return {
    subject: "Χρειάζεται έλεγχος στην αποστολή BOX NOW",
    body: `Η BOX NOW ανέφερε πρόβλημα στην αποστολή της παραγγελίας ${row.order_id}.${tracking}\n\nΗ ομάδα KONTA MOY έχει καταγράψει την εξέλιξη. Δεν χρειάζεται να δημιουργήσεις νέα παραγγελία· παρακολούθησε την υπάρχουσα για τις επόμενες ενημερώσεις.`,
    ctaLabel: "Έλεγχος παραγγελίας"
  };
  return undefined;
}
