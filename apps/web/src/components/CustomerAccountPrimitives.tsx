import Link from "next/link";

export type CustomerLifecycleState = "done" | "current" | "pending" | "action" | "problem" | "cancelled";

export type CustomerLifecycleStage = Readonly<{
  label: string;
  description?: string;
  state: CustomerLifecycleState;
}>;

const stateIcon: Record<CustomerLifecycleState, string> = {
  done: "✓",
  current: "●",
  pending: "○",
  action: "!",
  problem: "!",
  cancelled: "×"
};

export function CustomerLifecycle({ stages, label }: { stages: readonly CustomerLifecycleStage[]; label: string }) {
  return <ol className="customer-lifecycle" aria-label={label}>
    {stages.map((stage, index) => <li className={`customer-lifecycle-stage is-${stage.state}`} key={`${stage.label}-${index}`}>
      <span className="customer-lifecycle-marker" aria-hidden="true">{stateIcon[stage.state]}</span>
      <span className="customer-lifecycle-copy"><strong>{stage.label}</strong>{stage.description && <small>{stage.description}</small>}</span>
    </li>)}
  </ol>;
}

export function CustomerHowItWorks({ title = "Πώς λειτουργεί", children }: { title?: string; children: React.ReactNode }) {
  return <details className="customer-how-it-works">
    <summary><span aria-hidden="true">ⓘ</span>{title}</summary>
    <div>{children}</div>
  </details>;
}

export function CustomerActionCard({
  tone,
  title,
  body,
  href,
  action,
  meta
}: Readonly<{
  tone: "action" | "progress" | "success" | "problem";
  title: string;
  body: string;
  href?: string;
  action?: string;
  meta?: string;
}>) {
  return <article className={`customer-action-card is-${tone}`}>
    <span className="customer-action-icon" aria-hidden="true">{tone === "success" ? "✓" : tone === "progress" ? "●" : "!"}</span>
    <div className="customer-action-copy"><strong>{title}</strong><p>{body}</p>{meta && <small>{meta}</small>}</div>
    {href && action && <Link className="button button-secondary" href={href}>{action}</Link>}
  </article>;
}

export function CustomerStatusNotice({
  tone,
  title,
  children
}: Readonly<{
  tone: "action" | "progress" | "success" | "problem";
  title: string;
  children: React.ReactNode;
}>) {
  return <article className={`customer-action-card customer-status-notice is-${tone}`}>
    <span className="customer-action-icon" aria-hidden="true">{tone === "success" ? "✓" : tone === "progress" ? "●" : "!"}</span>
    <div className="customer-action-copy"><strong>{title}</strong><div>{children}</div></div>
  </article>;
}

export function customerOrderLifecycle(status: string, fulfilmentMode: string): readonly CustomerLifecycleStage[] {
  const normalized = status.toLocaleLowerCase("el-GR");
  const cancelled = normalized.includes("ακυρ");
  if (cancelled) return [
    { label: "Παραγγελία", state: "done" },
    { label: "Ακύρωση", description: "Η παραγγελία δεν θα προχωρήσει σε παράδοση.", state: "cancelled" }
  ];

  const paymentAction = normalized.includes("αναμονή πληρωμής");
  const awaitingShop = normalized.includes("αναμονή αποδοχής");
  const preparing = normalized.includes("ετοιμάζεται") || normalized.includes("επιβεβαιω");
  const ready = normalized.includes("έτοιμη");
  const shipping = normalized.includes("αποστολή");
  const complete = normalized.includes("ολοκληρώ") || normalized.includes("παραλήφθηκε") || normalized.includes("επιστράφηκαν τα χρήματα");
  const customerAction = normalized.includes("χρειάζεται ενέργεια");

  const fulfilmentLabel = fulfilmentMode === "pickup" ? "Παραλαβή" : fulfilmentMode === "shipping" ? "Μεταφορά" : "Παράδοση";
  const finalLabel = fulfilmentMode === "pickup" ? "Παραλήφθηκε" : "Ολοκληρώθηκε";

  let currentIndex = 0;
  if (awaitingShop) currentIndex = 1;
  if (preparing) currentIndex = 2;
  if (ready || shipping) currentIndex = 3;
  if (complete) currentIndex = 4;

  const labels = ["Παραγγελία", "Επιβεβαίωση", "Προετοιμασία", fulfilmentLabel, finalLabel];
  return labels.map((label, index) => {
    if (complete) return { label, state: "done" as const };
    if (index < currentIndex) return { label, state: "done" as const };
    if (index > currentIndex) return { label, state: "pending" as const };
    if ((paymentAction && index === 0) || customerAction || (ready && fulfilmentMode === "pickup" && index === 3)) return { label, state: "action" as const };
    return { label, state: "current" as const };
  });
}
