import type { CSSProperties, ReactNode } from "react";

export type VendorLifecycleTone = "done" | "current" | "attention" | "waiting" | "blocked" | "future";

export type VendorLifecycleStep = Readonly<{
  label: string;
  tone: VendorLifecycleTone;
  detail?: ReactNode;
}>;

const STEP_ICON: Record<VendorLifecycleTone, string> = {
  done: "✓",
  current: "●",
  attention: "!",
  waiting: "…",
  blocked: "×",
  future: "○"
};

export function VendorLifecycle({
  steps,
  ariaLabel = "Πορεία εργασίας"
}: Readonly<{ steps: readonly VendorLifecycleStep[]; ariaLabel?: string }>) {
  const style = { "--vendor-lifecycle-columns": Math.max(1, Math.min(steps.length, 6)) } as CSSProperties;
  return <ol className="vendor-lifecycle" aria-label={ariaLabel} style={style}>
    {steps.map((step, index) => <li className={`vendor-lifecycle-step is-${step.tone}`} key={`${index}:${step.label}`}>
      <span className="vendor-lifecycle-marker" aria-hidden="true">{STEP_ICON[step.tone]}</span>
      <span className="vendor-lifecycle-copy"><strong>{step.label}</strong>{step.detail ? <small>{step.detail}</small> : null}</span>
    </li>)}
  </ol>;
}

export function VendorActionNotice({
  tone = "waiting",
  title,
  children
}: Readonly<{ tone?: "attention" | "danger" | "waiting" | "positive"; title: string; children?: ReactNode }>) {
  return <div className={`vendor-action-notice is-${tone}`} role={tone === "danger" ? "alert" : undefined}>
    <div className="vendor-action-notice-icon" aria-hidden="true">{tone === "positive" ? "✓" : tone === "danger" ? "!" : tone === "attention" ? "!" : "…"}</div>
    <div><strong>{title}</strong>{children ? <div className="vendor-action-notice-body">{children}</div> : null}</div>
  </div>;
}

export function vendorStatusLabel(value: string): string {
  const status = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    active: "Ενεργό",
    private: "Ιδιωτική",
    booked: "Προγραμματισμένο",
    offered: "Προσφορά στάλθηκε",
    offer_sent: "Προσφορά στάλθηκε",
    waiting_customer: "Περιμένουμε τον πελάτη",
    pending: "Νέα",
    assigned: "Νέα",
    awaiting_vendor: "Περιμένει αποδοχή",
    accepted: "Αποδεκτή",
    preparing: "Σε προετοιμασία",
    ready: "Έτοιμη",
    ready_for_handover: "Έτοιμη για παράδοση",
    shipped: "Σε αποστολή",
    in_transit: "Σε μεταφορά",
    delivered: "Παραδόθηκε",
    collected: "Παραλήφθηκε",
    completed: "Ολοκληρώθηκε",
    fulfilled: "Ολοκληρώθηκε",
    cancelled: "Ακυρώθηκε",
    canceled: "Ακυρώθηκε",
    rejected: "Δεν θα εξυπηρετηθεί",
    requested: "Νέο αίτημα",
    inspection_required: "Χρειάζεται έλεγχο",
    approved: "Εγκρίθηκε",
    received: "Παραλήφθηκε από το κατάστημα",
    inspected: "Ο έλεγχος ολοκληρώθηκε",
    remedy_approved: "Εγκρίθηκε λύση",
    replaced: "Ολοκληρώθηκε με αντικατάσταση",
    refunded: "Ολοκληρώθηκε με επιστροφή χρημάτων",
    closed: "Ολοκληρώθηκε",
    expired: "Έληξε",
    in_repair: "Σε επισκευή",
    awaiting_part: "Αναμονή ανταλλακτικού",
    ready_for_customer: "Έτοιμο για τον πελάτη",
    returned: "Επιστράφηκε στον πελάτη",
    failed: "Δεν ολοκληρώθηκε"
  };
  return labels[status] ?? value.replaceAll("_", " ");
}
