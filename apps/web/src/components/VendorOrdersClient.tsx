"use client";

import Link from "next/link";
import { useState } from "react";
import { VendorActionNotice, VendorLifecycle, type VendorLifecycleStep, vendorStatusLabel } from "./VendorLifecycle";
import { WorkspaceEmptyState, WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Fulfilment = {
  id: string;
  orderId: string;
  orderReference: string;
  orderStatus: string;
  status: string;
  mode: string;
  postcode: string;
  createdAt: number;
  customerIdentified: boolean;
  merchandiseSubtotal: string;
  deliveryCharge: string;
  lines: ReadonlyArray<{ id: string; title: string; quantity: number; status: string }>;
  actions: readonly string[];
};

type Dashboard = {
  csrfToken: string;
  metrics: { ordersRequiringAction: number; activeProducts: number; availableUnits: number; openFulfilments: number };
  fulfilments: readonly Fulfilment[];
};

type DeliveryContact = Readonly<{
  fulfilmentId: string;
  recipientName: string;
  line1: string;
  line2?: string;
  locality: string;
  region?: string;
  postcode: string;
  countryCode: string;
  phone?: string;
}>;

const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
const actionLabel: Record<string, string> = {
  accept: "Αποδοχή παραγγελίας",
  reject: "Δεν μπορώ να την εξυπηρετήσω",
  ready: "Έτοιμη για παράδοση",
  delivered: "Επιβεβαίωση παράδοσης"
};
const deliveryRevealStatuses = new Set(["accepted", "picking", "packed", "ready_for_handover"]);

function isFinished(status: string) {
  return ["delivered", "collected", "completed", "fulfilled"].includes(status.toLowerCase());
}

function isStopped(status: string) {
  return ["rejected", "cancelled", "canceled"].includes(status.toLowerCase());
}

function lifecycle(item: Fulfilment): readonly VendorLifecycleStep[] {
  const actions = new Set(item.actions);
  const status = item.status.toLowerCase();
  const finalLabel = item.mode === "pickup" ? "Παραλαβή από πελάτη" : "Παράδοση";
  const labels = ["Ανάθεση", "Αποδοχή", "Προετοιμασία", finalLabel, "Ολοκλήρωση"];

  if (isFinished(status)) return labels.map((label) => ({ label, tone: "done" as const }));
  if (isStopped(status)) return [
    { label: "Ανάθεση", tone: "done" },
    { label: "Δεν θα εξυπηρετηθεί", tone: "blocked" },
    { label: "Προετοιμασία", tone: "future" },
    { label: finalLabel, tone: "future" },
    { label: "Ολοκλήρωση", tone: "future" }
  ];

  let current = 0;
  if (actions.has("accept") || actions.has("reject")) current = 1;
  else if (actions.has("ready") || ["accepted", "preparing"].includes(status)) current = 2;
  else if (actions.has("delivered") || ["ready", "ready_for_handover", "shipped", "in_transit"].includes(status)) current = 3;
  else if (["assigned", "pending", "awaiting_vendor"].includes(status)) current = 1;
  else current = 2;

  return labels.map((label, index) => ({
    label,
    tone: index < current ? "done" : index === current ? (item.actions.length ? "attention" : "current") : "future"
  }));
}

export function VendorOrdersClient({ initial }: { initial: Dashboard }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState("");
  const [contactBusy, setContactBusy] = useState("");
  const [deliveryContacts, setDeliveryContacts] = useState<Record<string, DeliveryContact | undefined>>({});
  const [error, setError] = useState("");

  async function act(fulfilmentId: string, action: string) {
    if (action === "reject" && !window.confirm("Να δηλωθεί ότι το κατάστημά σου δεν μπορεί να εξυπηρετήσει αυτή την παραγγελία;")) return;
    if (action === "delivered" && !window.confirm("Επιβεβαιώνεις ότι τα σωστά προϊόντα παραδόθηκαν στον πελάτη;")) return;
    const key = `${fulfilmentId}:${action}`;
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/vendor/fulfilments/action", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": data.csrfToken },
        body: JSON.stringify({ fulfilmentId, action })
      });
      const payload = await response.json() as Dashboard & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν μπορέσαμε να ενημερώσουμε την παραγγελία.");
      setData(payload);
      if (["reject", "delivered"].includes(action)) {
        setDeliveryContacts((current) => {
          const next = { ...current };
          delete next[fulfilmentId];
          return next;
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν μπορέσαμε να ενημερώσουμε την παραγγελία.");
    } finally {
      setBusy("");
    }
  }

  async function revealDeliveryContact(fulfilmentId: string) {
    setContactBusy(fulfilmentId);
    setError("");
    try {
      const response = await fetch("/api/vendor/fulfilments/delivery-contact", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", "x-csrf-token": data.csrfToken },
        body: JSON.stringify({ fulfilmentId })
      });
      const payload = await response.json() as DeliveryContact & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατή η εμφάνιση των στοιχείων παράδοσης.");
      setDeliveryContacts((current) => ({ ...current, [fulfilmentId]: payload }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η εμφάνιση των στοιχείων παράδοσης.");
    } finally {
      setContactBusy("");
    }
  }

  function hideDeliveryContact(fulfilmentId: string) {
    setDeliveryContacts((current) => {
      const next = { ...current };
      delete next[fulfilmentId];
      return next;
    });
  }

  const pickup = data.fulfilments.filter((item) => item.mode === "pickup").length;
  const shipping = data.fulfilments.filter((item) => item.mode !== "pickup").length;

  return <>
    {error && <div className="shell form-error vendor-error" role="alert"><strong>Η κατάσταση δεν άλλαξε.</strong> {error} Δοκίμασε ξανά.</div>}

    <WorkspaceMetricStrip items={[
      { label: "Χρειάζονται ενέργεια", value: data.metrics.ordersRequiringAction, tone: data.metrics.ordersRequiringAction ? "attention" : "default" },
      { label: "Ανοιχτές", value: data.metrics.openFulfilments },
      { label: "Παραλαβή από κατάστημα", value: pickup },
      { label: "Αποστολή / παράδοση", value: shipping }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Παραγγελίες" title="Τι χρειάζεται να κάνεις τώρα" note="Η τρέχουσα θέση κάθε παραγγελίας φαίνεται στην πορεία της. Όταν χρειάζεται δική σου ενέργεια, το αντίστοιχο βήμα επισημαίνεται και εμφανίζεται μόνο η επόμενη επιτρεπόμενη ενέργεια." />
      <WorkspaceHowItWorks className="vendor-page-help">
        <p><strong>Τι είναι αυτή η σελίδα;</strong> Εδώ βλέπεις τις παραγγελίες που έχουν ανατεθεί στο κατάστημά σου.</p>
        <p><strong>Τι κάνεις;</strong> Ακολούθησε το επισημασμένο βήμα και πάτησε μόνο όταν το πραγματικό γεγονός έχει συμβεί.</p>
        <p><strong>Τι γίνεται μετά;</strong> Η πορεία ενημερώνεται αυτόματα και οι επόμενες εργασίες εμφανίζονται όταν γίνουν διαθέσιμες.</p>
        <p><strong>Στοιχεία παράδοσης:</strong> για τοπική παράδοση εμφανίζονται μόνο όταν τα ζητήσεις για ενεργή ανάθεση. Η πρόσβαση καταγράφεται και τα στοιχεία χρησιμοποιούνται αποκλειστικά για τη συγκεκριμένη παράδοση.</p>
      </WorkspaceHowItWorks>
      {data.fulfilments.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ανατεθειμένες παραγγελίες αυτή τη στιγμή." /> : <div className="workspace-queue-list">
        {data.fulfilments.map((item) => {
          const finished = isFinished(item.status);
          const stopped = isStopped(item.status);
          const deliveryContact = deliveryContacts[item.id];
          const mayRevealDelivery = item.mode === "local_delivery" && deliveryRevealStatuses.has(item.status) && ["confirmed", "partially_fulfilled"].includes(item.orderStatus);
          return <article className="workspace-queue-card" id={`order-${encodeURIComponent(item.orderId)}`} key={item.id}>
            <div className="workspace-queue-head">
              <div><strong className="vendor-case-title">{item.orderReference}</strong><small>{when(item.createdAt)} · {item.mode === "pickup" ? "Παραλαβή από κατάστημα" : item.mode === "local_delivery" ? "Τοπική παράδοση" : "Αποστολή"} · ΤΚ {item.postcode}</small></div>
              <span className="vendor-merchant-status">{vendorStatusLabel(item.status)}</span>
            </div>

            <VendorLifecycle steps={lifecycle(item)} ariaLabel={`Πορεία ${item.orderReference}`} />

            {item.actions.length ? <VendorActionNotice tone="attention" title="Χρειάζεται ενέργεια από εσένα">
              Ολοκλήρωσε μόνο την επόμενη ενέργεια που έχει συμβεί πραγματικά στο κατάστημα.
            </VendorActionNotice> : finished ? <VendorActionNotice tone="positive" title="Η εργασία του καταστήματός σου ολοκληρώθηκε">
              Δεν χρειάζεται άλλη ενέργεια για αυτή την παραγγελία.
            </VendorActionNotice> : stopped ? <VendorActionNotice tone="danger" title="Η παραγγελία δεν συνεχίζεται από το κατάστημά σου" /> : <VendorActionNotice tone="waiting" title="Δεν χρειάζεται ενέργεια αυτή τη στιγμή">
              Η επόμενη εργασία θα εμφανιστεί όταν η παραγγελία προχωρήσει.
            </VendorActionNotice>}

            <div className="workspace-queue-primary">
              <span>Προϊόντα {item.merchandiseSubtotal}</span>
              <span>Παράδοση {item.deliveryCharge}</span>
            </div>
            <div className="workspace-compact-list" style={{ marginTop: 12 }}>
              {item.lines.map((line) => <div className="workspace-compact-row" key={line.id}><strong>{line.quantity}× {line.title}</strong><span>{vendorStatusLabel(line.status)}</span></div>)}
            </div>

            {mayRevealDelivery && <div className="fairness-note" style={{ marginTop: 12 }}>
              {deliveryContact ? <>
                <div className="account-card-head"><div><strong>Στοιχεία για την ενεργή τοπική παράδοση</strong><small>Εμφανίστηκαν μόνο επειδή ζητήθηκαν για την εκτέλεση αυτής της ανατεθειμένης παράδοσης. Η πρόσβαση καταγράφεται.</small></div><button type="button" className="text-button" onClick={() => hideDeliveryContact(item.id)}>Απόκρυψη</button></div>
                <p><strong>{deliveryContact.recipientName}</strong><br />{deliveryContact.line1}{deliveryContact.line2 ? ` · ${deliveryContact.line2}` : ""}<br />{deliveryContact.postcode} {deliveryContact.locality}{deliveryContact.region ? ` · ${deliveryContact.region}` : ""} · {deliveryContact.countryCode}{deliveryContact.phone ? <><br />Τηλέφωνο: {deliveryContact.phone}</> : null}</p>
                <small>Χρήση αποκλειστικά για την παράδοση της συγκεκριμένης παραγγελίας. Δεν επιτρέπεται αντιγραφή σε CRM, λίστα marketing ή άλλη ανεξάρτητη χρήση.</small>
              </> : <div className="account-card-head"><div><strong>Χρειάζεσαι τη διεύθυνση για την παράδοση;</strong><small>Δεν φορτώνεται μαζί με τη λίστα παραγγελιών. Η αποκάλυψη είναι ανά παραγγελία και καταγράφεται.</small></div><button type="button" className="button button-secondary" disabled={contactBusy === item.id} onClick={() => void revealDeliveryContact(item.id)}>{contactBusy === item.id ? "Φόρτωση…" : "Εμφάνιση στοιχείων παράδοσης"}</button></div>}
            </div>}

            <WorkspaceRecordDetails label="Τεχνικές λεπτομέρειες για υποστήριξη">
              <div className="workspace-compact-list">
                <div className="workspace-compact-row"><strong>Εσωτερική ανάθεση</strong><span className="vendor-technical-id">{item.id}</span><small className="vendor-technical-id">Order {item.orderId} · {item.orderStatus}</small></div>
              </div>
            </WorkspaceRecordDetails>
            {item.actions.length > 0 && <div className="workspace-action-bar">
              <span>Η κύρια ενέργεια προχωρά την παραγγελία στο επόμενο στάδιο.</span>
              <div className="workspace-action-buttons">
                {item.actions.map((action) => <button key={action} type="button" className={action === "reject" ? "button button-secondary" : "button"} disabled={Boolean(busy)} onClick={() => void act(item.id, action)}>{busy === `${item.id}:${action}` ? "Ενημέρωση…" : actionLabel[action] ?? vendorStatusLabel(action)}</button>)}
              </div>
            </div>}
          </article>;
        })}
      </div>}
    </section>

    <section className="shell vendor-section">
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card"><strong>Προθεσμίες</strong><p>Δες πρώτα ό,τι πλησιάζει ή έχει ξεπεράσει τη συμφωνημένη προθεσμία.</p><Link className="button button-secondary" href="/vendor/notifications">Άνοιγμα προθεσμιών</Link></article>
        <article className="workspace-queue-card"><strong>Παραλαβή με QR</strong><p>Όταν η παραγγελία είναι έτοιμη, επιβεβαίωσε την παράδοση από το QR του πελάτη.</p><Link className="button button-secondary" href="/vendor/pickup/scan">Επιβεβαίωση QR</Link></article>
      </div>
    </section>
  </>;
}
