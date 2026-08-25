type FulfilmentLine = Readonly<{ id: string; title: string; quantity: number }>;
type FulfilmentPart = Readonly<{ id: string; status: string; vendorId: string; vendorName: string; deliveryCharge: string; lineIds: readonly string[] }>;

type Tone = "pending" | "progress" | "action" | "success" | "problem";

const baseStatusLabel: Record<string, string> = {
  awaiting_acceptance: "Αναμονή αποδοχής",
  accepted: "Έγινε αποδεκτή",
  picking: "Ετοιμάζεται",
  packed: "Συσκευάστηκε",
  ready_for_handover: "Έτοιμη",
  shipped: "Σε αποστολή",
  delivered: "Παραδόθηκε",
  failed: "Πρόβλημα παράδοσης",
  cancelled: "Ακυρώθηκε"
};

function statusLabel(status: string, fulfilmentMode: string): string {
  if (status === "handed_over") {
    if (fulfilmentMode === "local_delivery") return "Παραλήφθηκε από οδηγό";
    if (fulfilmentMode === "shipping") return "Παραδόθηκε σε μεταφορέα";
    return "Παραλήφθηκε";
  }
  return baseStatusLabel[status] ?? status.replaceAll("_", " ");
}

function isCompleted(status: string, fulfilmentMode: string): boolean {
  return status === "delivered" || (fulfilmentMode === "pickup" && status === "handed_over");
}

function toneFor(status: string, fulfilmentMode: string): Tone {
  if (isCompleted(status, fulfilmentMode)) return "success";
  if (["failed", "cancelled"].includes(status)) return "problem";
  if (status === "ready_for_handover" && fulfilmentMode === "pickup") return "action";
  if (["accepted", "picking", "packed", "ready_for_handover", "handed_over", "shipped"].includes(status)) return "progress";
  return "pending";
}

function nextStep(status: string, fulfilmentMode: string): string {
  if (status === "awaiting_acceptance") return "Περιμένουμε το κατάστημα να επιβεβαιώσει αυτό το τμήμα της παραγγελίας.";
  if (status === "accepted") return "Το κατάστημα το έχει αποδεχθεί και θα ξεκινήσει την προετοιμασία.";
  if (status === "picking") return "Το κατάστημα συγκεντρώνει τα προϊόντα σου.";
  if (status === "packed") return fulfilmentMode === "pickup" ? "Το τμήμα έχει συσκευαστεί και ετοιμάζεται για παραλαβή." : "Το τμήμα έχει συσκευαστεί και ετοιμάζεται για αποστολή.";
  if (status === "ready_for_handover") {
    if (fulfilmentMode === "pickup") return "Μπορείς να προχωρήσεις σε παραλαβή όταν εμφανίζεται ενεργό QR / κωδικός παραλαβής παρακάτω.";
    if (fulfilmentMode === "local_delivery") return "Το κατάστημα ολοκλήρωσε την προετοιμασία και περιμένει την επιβεβαιωμένη παραλαβή από τον οδηγό.";
    return "Είναι έτοιμο να περάσει στο επόμενο βήμα της παράδοσης.";
  }
  if (status === "shipped") return "Το τμήμα βρίσκεται σε μεταφορά προς εσένα.";
  if (status === "handed_over") {
    if (fulfilmentMode === "local_delivery") return "Ο οδηγός παρέλαβε αυτό το τμήμα από το κατάστημα. Η παραγγελία δεν θεωρείται παραδομένη μέχρι να επιβεβαιωθεί το τελικό QR του πελάτη.";
    if (fulfilmentMode === "shipping") return "Το τμήμα παραδόθηκε στον μεταφορέα και συνεχίζει προς εσένα.";
    return "Η παραλαβή αυτού του τμήματος ολοκληρώθηκε.";
  }
  if (status === "delivered") return "Η παράδοση αυτού του τμήματος ολοκληρώθηκε.";
  if (status === "failed") return "Υπάρχει πρόβλημα με αυτό το τμήμα. Δες τις ενημερώσεις ή χρησιμοποίησε την υποστήριξη της παραγγελίας.";
  if (status === "cancelled") return "Αυτό το τμήμα δεν θα προχωρήσει. Τυχόν οικονομική τακτοποίηση ακολουθεί τη διαδικασία της παραγγελίας.";
  return "Η κατάσταση αυτού του τμήματος θα ενημερωθεί μόλις υπάρξει νέο γεγονός.";
}

function itemCopy(part: FulfilmentPart, lines: readonly FulfilmentLine[]): string {
  const matched = part.lineIds.flatMap((id) => {
    const line = lines.find((entry) => entry.id === id);
    return line ? [`${line.quantity}× ${line.title}`] : [];
  });
  if (matched.length) return matched.join(" · ");
  return `${part.lineIds.length} ${part.lineIds.length === 1 ? "προϊόν" : "προϊόντα"}`;
}

export function CustomerFulfilmentProgress({ fulfilments, lines, fulfilmentMode }: {
  fulfilments: readonly FulfilmentPart[];
  lines: readonly FulfilmentLine[];
  fulfilmentMode: string;
}) {
  if (!fulfilments.length) return null;
  const completed = fulfilments.filter((item) => isCompleted(item.status, fulfilmentMode)).length;
  const customerActions = fulfilments.filter((item) => toneFor(item.status, fulfilmentMode) === "action").length;
  const problems = fulfilments.filter((item) => toneFor(item.status, fulfilmentMode) === "problem").length;
  const percentage = Math.round((completed / fulfilments.length) * 100);
  const split = fulfilments.length > 1;

  return <section className="order-detail-card is-refined customer-fulfilment-progress" aria-labelledby="fulfilment-progress-title">
    <div className="customer-fulfilment-heading">
      <div><div className="eyebrow">Εξέλιξη παραγγελίας</div><h2 id="fulfilment-progress-title">{split ? `${completed} από ${fulfilments.length} τμήματα ολοκληρώθηκαν` : completed ? "Η παράδοση ολοκληρώθηκε" : "Η παραγγελία σου προχωρά"}</h2><p>{split ? "Κάθε κατάστημα μπορεί να ολοκληρώσει το δικό του τμήμα σε διαφορετικό χρόνο." : "Βλέπεις εδώ ποιος έχει την επόμενη ενέργεια και τι ακολουθεί."}</p></div>
      <div className="customer-fulfilment-count" aria-label={`${completed} από ${fulfilments.length} ολοκληρωμένα`}><strong>{completed}/{fulfilments.length}</strong><span>ολοκληρωμένα</span></div>
    </div>
    <progress className="customer-fulfilment-meter" max={fulfilments.length} value={completed}>{percentage}%</progress>
    {(customerActions > 0 || problems > 0) && <div className="customer-fulfilment-alerts" role="status">{customerActions > 0 && <span className="is-action">{customerActions} {customerActions === 1 ? "τμήμα περιμένει δική σου ενέργεια" : "τμήματα περιμένουν δική σου ενέργεια"}</span>}{problems > 0 && <span className="is-problem">{problems} {problems === 1 ? "τμήμα έχει πρόβλημα" : "τμήματα έχουν πρόβλημα"}</span>}</div>}
    <div className="customer-fulfilment-grid">
      {fulfilments.map((item, index) => {
        const tone = toneFor(item.status, fulfilmentMode);
        return <article className={`customer-fulfilment-card is-${tone}`} key={item.id}>
          <div className="customer-fulfilment-card-head"><div><span>Τμήμα {index + 1}</span><strong>{item.vendorName}</strong></div><span className="status-pill">{statusLabel(item.status, fulfilmentMode)}</span></div>
          <p className="customer-fulfilment-items">{itemCopy(item, lines)}</p>
          <div className="customer-fulfilment-next"><span>{tone === "action" ? "Δική σου ενέργεια" : tone === "problem" ? "Χρειάζεται προσοχή" : tone === "success" ? "Ολοκληρώθηκε" : "Τι ακολουθεί"}</span><p>{nextStep(item.status, fulfilmentMode)}</p></div>
          <small className="customer-fulfilment-charge">Χρέωση παράδοσης: {item.deliveryCharge}</small>
        </article>;
      })}
    </div>
  </section>;
}
