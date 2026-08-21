"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { VendorActionNotice, VendorLifecycle, type VendorLifecycleStep, vendorStatusLabel } from "./VendorLifecycle";
import { WorkspaceEmptyState, WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Shipment = { id: string; fulfilmentId: string; orderId: string; orderNumber: string; status: string; providerCreationState: string; trackingNumber?: string; providerReferenceNumber?: string; parcelIds: readonly string[]; destinationLockerId?: string; destinationLabel?: string; canCreate: boolean; canHandover: boolean; manualReview: boolean; error?: string };
type Workspace = { csrfToken: string; configured: boolean; shipments: readonly Shipment[] };

function shippingLifecycle(shipment: Shipment): readonly VendorLifecycleStep[] {
  const labels = ["Παραγγελία", "Ετικέτα", "Παράδοση στον courier", "Σε μεταφορά", "Παραδόθηκε"];
  const status = shipment.status.toLowerCase();
  if (["delivered", "completed"].includes(status)) return labels.map((label) => ({ label, tone: "done" as const }));
  let current = 1;
  let tone: VendorLifecycleStep["tone"] = "waiting";
  if (shipment.canCreate) { current = 1; tone = "attention"; }
  else if (shipment.canHandover) { current = 2; tone = "attention"; }
  else if (["in_transit", "shipped"].includes(status)) { current = 3; tone = "waiting"; }
  else if (shipment.providerCreationState === "confirmed") { current = 2; tone = "waiting"; }
  if (shipment.manualReview) tone = "attention";
  return labels.map((label, index) => ({ label, tone: index < current ? "done" : index === current ? tone : "future" }));
}

export function VendorShippingClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const toCreate = initial.shipments.filter((item) => item.canCreate).length;
  const toHandover = initial.shipments.filter((item) => item.canHandover).length;
  const inTransit = initial.shipments.filter((item) => ["in_transit", "shipped"].includes(item.status)).length;
  const manualReview = initial.shipments.filter((item) => item.manualReview).length;

  async function act(endpoint: string, body: Record<string, string>, key: string) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Δεν μπορέσαμε να ενημερώσουμε την αποστολή.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν μπορέσαμε να ενημερώσουμε την αποστολή.");
    } finally { setBusy(""); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert"><strong>Η αποστολή δεν άλλαξε κατάσταση.</strong> {error}</div>}
    <WorkspaceMetricStrip items={[
      { label: "Αποστολές", value: initial.shipments.length },
      { label: "Χρειάζονται ετικέτα", value: toCreate, tone: toCreate ? "attention" : "default" },
      { label: "Έτοιμες για courier", value: toHandover, tone: toHandover ? "attention" : "default" },
      { label: "Σε μεταφορά", value: inTransit, tone: inTransit ? "positive" : manualReview ? "attention" : "default", hint: manualReview ? `${manualReview} χρειάζονται έλεγχο` : undefined }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Αποστολές" title="Από το κατάστημά σου μέχρι τον πελάτη" note="Η σελίδα δείχνει ποιο βήμα είναι δικό σου και πότε απλώς περιμένουμε ενημέρωση από την BOX NOW." />
      <WorkspaceHowItWorks className="vendor-page-help">
        <p><strong>1. Δημιούργησε την ετικέτα</strong> όταν εμφανιστεί το σχετικό κουμπί.</p>
        <p><strong>2. Εκτύπωσε και τοποθέτησέ την</strong> στο σωστό δέμα.</p>
        <p><strong>3. Επιβεβαίωσε την παράδοση στον courier</strong> μόνο όταν το δέμα έχει πραγματικά φύγει από το κατάστημα.</p>
        <p>Μετά την παράδοση στον courier, η πορεία ενημερώνεται από την BOX NOW και δεν χρειάζεται χειροκίνητη αλλαγή.</p>
      </WorkspaceHowItWorks>
      {!initial.configured && <VendorActionNotice tone="waiting" title="Η αποστολή μέσω BOX NOW δεν είναι ακόμη έτοιμη για το κατάστημά σου">Το ΚΟΝΤΑ ΜΟΥ πρέπει πρώτα να ολοκληρώσει τη ρύθμιση σημείου αποστολής. Δεν χρειάζεται να αλλάξεις κάποια ρύθμιση.</VendorActionNotice>}
      {initial.shipments.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν αποστολές αυτή τη στιγμή." body="Νέες παραγγελίες για αποστολή θα εμφανιστούν εδώ αυτόματα." /> : <div className="workspace-queue-list">{initial.shipments.map((shipment) => {
        const needsAction = shipment.canCreate || shipment.canHandover;
        const completed = ["delivered", "completed"].includes(shipment.status.toLowerCase());
        return <article className="workspace-queue-card" key={shipment.id}>
          <div className="workspace-queue-head"><div><strong className="vendor-case-title">{shipment.orderNumber}</strong><small>{shipment.destinationLabel ?? (shipment.destinationLockerId ? `BOX NOW locker ${shipment.destinationLockerId}` : "Το σημείο παράδοσης δεν έχει ακόμη οριστεί")}</small></div><span className="vendor-merchant-status">{vendorStatusLabel(shipment.status)}</span></div>
          <VendorLifecycle steps={shippingLifecycle(shipment)} ariaLabel={`Πορεία αποστολής ${shipment.orderNumber}`} />
          {shipment.manualReview ? <VendorActionNotice tone="danger" title="Η δημιουργία αποστολής χρειάζεται επανέλεγχο">Δεν δημιουργούμε δεύτερη αποστολή. Χρησιμοποίησε την ενέργεια παρακάτω ώστε το σύστημα να ελέγξει πρώτα την υπάρχουσα προσπάθεια.</VendorActionNotice>
            : needsAction ? <VendorActionNotice tone="attention" title="Χρειάζεται ενέργεια από εσένα" />
              : completed ? <VendorActionNotice tone="positive" title="Η αποστολή ολοκληρώθηκε" />
                : <VendorActionNotice tone="waiting" title="Περιμένουμε ενημέρωση από την BOX NOW">Δεν χρειάζεται να αλλάξεις κατάσταση χειροκίνητα.</VendorActionNotice>}
          <div className="workspace-queue-primary">{shipment.trackingNumber && <span>Tracking {shipment.trackingNumber}</span>}</div>
          {shipment.error && <p className="workspace-queue-summary">{shipment.error}</p>}
          <div className="workspace-action-bar"><span>{shipment.canCreate ? "Ξεκίνα δημιουργώντας την ετικέτα της αποστολής." : shipment.canHandover ? "Επιβεβαίωσε μόνο όταν ο courier έχει παραλάβει το δέμα." : "Δεν υπάρχει ενέργεια από το κατάστημα αυτή τη στιγμή."}</span><div className="workspace-action-buttons">
            {shipment.canCreate && <button className="button" disabled={busy === shipment.fulfilmentId || !initial.configured} onClick={() => void act("/api/vendor/shipping/create", { fulfilmentId: shipment.fulfilmentId }, shipment.fulfilmentId)}>{busy === shipment.fulfilmentId ? "Έλεγχος…" : shipment.manualReview ? "Έλεγχος υπάρχουσας αποστολής" : "Δημιουργία ετικέτας"}</button>}
            {shipment.id && !shipment.id.startsWith("pending:") && shipment.providerCreationState === "confirmed" && <a className="button button-secondary" href={`/api/vendor/shipping/label?shipmentId=${encodeURIComponent(shipment.id)}`} target="_blank" rel="noreferrer">Άνοιγμα / εκτύπωση ετικέτας</a>}
            {shipment.canHandover && <button className="button" disabled={busy === shipment.id} onClick={() => void act("/api/vendor/shipping/handover", { shipmentId: shipment.id }, shipment.id)}>{busy === shipment.id ? "Ενημέρωση…" : "Παραδόθηκε στον courier"}</button>}
          </div></div>
          <WorkspaceRecordDetails label="Τεχνικές λεπτομέρειες για υποστήριξη">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Fulfilment</strong><span className="vendor-technical-id">{shipment.fulfilmentId}</span><small className="vendor-technical-id">Order {shipment.orderId}</small></div>
              <div className="workspace-compact-row"><strong>BOX NOW state</strong><span>{shipment.providerCreationState}</span></div>
              {shipment.providerReferenceNumber && <div className="workspace-compact-row"><strong>Provider reference</strong><span className="vendor-technical-id">{shipment.providerReferenceNumber}</span></div>}
              {shipment.parcelIds.length > 0 && <div className="workspace-compact-row"><strong>Parcel IDs</strong><span className="vendor-technical-id">{shipment.parcelIds.join(" · ")}</span></div>}
            </div>
          </WorkspaceRecordDetails>
        </article>;
      })}</div>}
    </section>
  </>;
}
