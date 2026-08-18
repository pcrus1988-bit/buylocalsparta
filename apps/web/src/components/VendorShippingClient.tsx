"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Shipment = { id: string; fulfilmentId: string; orderId: string; orderNumber: string; status: string; providerCreationState: string; trackingNumber?: string; providerReferenceNumber?: string; parcelIds: readonly string[]; destinationLockerId?: string; destinationLabel?: string; canCreate: boolean; canHandover: boolean; manualReview: boolean; error?: string };
type Workspace = { csrfToken: string; configured: boolean; shipments: readonly Shipment[] };

export function VendorShippingClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const toCreate = initial.shipments.filter((item) => item.canCreate).length;
  const toHandover = initial.shipments.filter((item) => item.canHandover).length;
  const confirmed = initial.shipments.filter((item) => item.providerCreationState === "confirmed").length;
  const manualReview = initial.shipments.filter((item) => item.manualReview).length;

  async function act(endpoint: string, body: Record<string, string>, key: string) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια αποστολής απέτυχε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια αποστολής απέτυχε");
    } finally { setBusy(""); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}
    <WorkspaceMetricStrip items={[
      { label: "Shipments", value: initial.shipments.length },
      { label: "Create label", value: toCreate, tone: toCreate ? "attention" : "default" },
      { label: "Handover", value: toHandover, tone: toHandover ? "attention" : "default" },
      { label: "Confirmed", value: confirmed, tone: confirmed ? "positive" : manualReview ? "attention" : "default", hint: manualReview ? `${manualReview} manual review` : "provider confirmed" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Carrier workflow" title="Αποστολές" note="Create label → PDF → handover. Delivery status έρχεται από τον carrier." />
      {!initial.configured && <div className="workspace-inline-note">Το κατάστημα δεν έχει ακόμη BOX NOW origin mapping. Η δημιουργία label παραμένει απενεργοποιημένη μέχρι να ολοκληρωθεί η αντιστοίχιση.</div>}
      {initial.shipments.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν shipping fulfilments." body="Νέες ανατεθειμένες αποστολές θα εμφανιστούν εδώ όταν υπάρχει carrier-enabled fulfilment." /> : <div className="workspace-queue-list">{initial.shipments.map((shipment) => <article className="workspace-queue-card" key={shipment.id}>
        <div className="workspace-queue-head"><div><strong>{shipment.orderNumber}</strong><small>{shipment.destinationLabel ?? shipment.destinationLockerId ?? "Locker not selected"}</small></div><span className="status-pill">{shipment.status}</span></div>
        <div className="workspace-queue-primary"><span>BOX NOW {shipment.providerCreationState}</span>{shipment.trackingNumber && <span>{shipment.trackingNumber}</span>}{shipment.manualReview && <span>Manual review</span>}</div>
        {shipment.error && <p className="workspace-queue-summary">{shipment.error}</p>}
        <WorkspaceRecordDetails label="Tracking, references & technical IDs">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Fulfilment</strong><span>{shipment.fulfilmentId}</span><small>Order {shipment.orderId}</small></div>
            {shipment.providerReferenceNumber && <div className="workspace-compact-row"><strong>Provider reference</strong><span>{shipment.providerReferenceNumber}</span></div>}
            {shipment.parcelIds.length > 0 && <div className="workspace-compact-row"><strong>Parcel IDs</strong><span>{shipment.parcelIds.join(" · ")}</span></div>}
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>{shipment.manualReview ? "Χρειάζεται reconciliation πριν συνεχίσεις." : "Χρησιμοποίησε μόνο την επόμενη διαθέσιμη carrier ενέργεια."}</span><div className="workspace-action-buttons">
          {shipment.canCreate && <button className="button" disabled={busy === shipment.fulfilmentId || !initial.configured} onClick={() => void act("/api/vendor/shipping/create", { fulfilmentId: shipment.fulfilmentId }, shipment.fulfilmentId)}>{shipment.manualReview ? "Reconcile BOX NOW" : "Create label"}</button>}
          {shipment.id && !shipment.id.startsWith("pending:") && shipment.providerCreationState === "confirmed" && <a className="button button-secondary" href={`/api/vendor/shipping/label?shipmentId=${encodeURIComponent(shipment.id)}`} target="_blank" rel="noreferrer">PDF label</a>}
          {shipment.canHandover && <button className="button button-secondary" disabled={busy === shipment.id} onClick={() => void act("/api/vendor/shipping/handover", { shipmentId: shipment.id }, shipment.id)}>Handed to carrier</button>}
        </div></div>
      </article>)}</div>}
    </section>
  </>;
}
