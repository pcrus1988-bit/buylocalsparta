"use client";

import Link from "next/link";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

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

const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
const actionLabel: Record<string, string> = { accept: "Αποδοχή", reject: "Απόρριψη", ready: "Έτοιμο για παράδοση", delivered: "Παραδόθηκε" };

export function VendorOrdersClient({ initial }: { initial: Dashboard }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function act(fulfilmentId: string, action: string) {
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
      if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια απέτυχε");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε");
    } finally {
      setBusy("");
    }
  }

  const pickup = data.fulfilments.filter((item) => item.mode === "pickup").length;
  const shipping = data.fulfilments.filter((item) => item.mode !== "pickup").length;

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Χρειάζονται ενέργεια", value: data.metrics.ordersRequiringAction, tone: data.metrics.ordersRequiringAction ? "attention" : "default" },
      { label: "Ανοιχτές", value: data.metrics.openFulfilments },
      { label: "Παραλαβή από κατάστημα", value: pickup },
      { label: "Αποστολή", value: shipping }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Live orders" title="Παραγγελίες" note="Εδώ αλλάζεις μόνο το πραγματικό operational status. Οι προθεσμίες, οι αποστολές και οι επιστροφές έχουν δικά τους tabs επάνω." />
      {data.fulfilments.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ανατεθειμένες παραγγελίες αυτή τη στιγμή." /> : <div className="workspace-queue-list">
        {data.fulfilments.map((item) => <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head">
            <div><strong>{item.orderReference}</strong><small>{when(item.createdAt)} · {item.mode === "pickup" ? "Παραλαβή από κατάστημα" : "Αποστολή"} · ΤΚ {item.postcode}</small></div>
            <span className="status-pill">{item.status}</span>
          </div>
          <div className="workspace-queue-primary">
            <span>Order status: {item.orderStatus}</span>
            <span>Εμπορεύματα {item.merchandiseSubtotal}</span>
            <span>Παράδοση {item.deliveryCharge}</span>
          </div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            {item.lines.map((line) => <div className="workspace-compact-row" key={line.id}><strong>{line.quantity}× {line.title}</strong><span>{line.status}</span></div>)}
          </div>
          <WorkspaceRecordDetails label="Τεχνικές αναφορές">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Fulfilment</strong><span>{item.id}</span><small>Order {item.orderId}</small></div>
            </div>
          </WorkspaceRecordDetails>
          <div className="workspace-action-bar">
            <span>{item.actions.length ? "Επίλεξε μόνο την επόμενη ενέργεια που έχει συμβεί πραγματικά." : "Δεν υπάρχει διαθέσιμη αλλαγή status."}</span>
            <div className="workspace-action-buttons">
              {item.actions.map((action) => <button key={action} type="button" className={action === "reject" ? "button button-secondary" : "button"} disabled={Boolean(busy)} onClick={() => void act(item.id, action)}>{busy === `${item.id}:${action}` ? "Ενημέρωση…" : actionLabel[action] ?? action}</button>)}
            </div>
          </div>
        </article>)}
      </div>}
    </section>

    <section className="shell vendor-section">
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card"><strong>Προθεσμίες & SLA</strong><p>Δες τι πλησιάζει ή έχει ξεπεράσει τη συμφωνημένη προθεσμία.</p><Link className="button button-secondary" href="/vendor/notifications">Προθεσμίες</Link></article>
        <article className="workspace-queue-card"><strong>Γρήγορη παραλαβή</strong><p>Σάρωσε το QR του πελάτη όταν η παραγγελία είναι έτοιμη για handover.</p><Link className="button button-secondary" href="/vendor/pickup/scan">Σάρωση QR</Link></article>
      </div>
    </section>
  </>;
}
