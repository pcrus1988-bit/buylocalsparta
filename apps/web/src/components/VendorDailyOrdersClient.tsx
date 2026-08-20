"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VendorDailyBottomNav } from "./VendorDailyBottomNav";
import styles from "./VendorDailyOrdersClient.module.css";

type Fulfilment = {
  id: string;
  orderId: string;
  orderReference: string;
  orderStatus: string;
  status: string;
  mode: string;
  postcode: string;
  createdAt: number;
  merchandiseSubtotal: string;
  deliveryCharge: string;
  lines: ReadonlyArray<{ id: string; title: string; quantity: number; status: string }>;
  actions: ReadonlyArray<string>;
};
type Dashboard = {
  vendor: { id: string; name: string; adviser: string };
  account: { email: string; roles: ReadonlyArray<string> };
  csrfToken: string;
  fulfilments: ReadonlyArray<Fulfilment>;
};
type SlaNotification = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
};
type SlaCase = {
  id: string;
  orderId: string;
  fulfilmentId: string;
  stage: "acceptance" | "preparation";
  state: "open" | "breached" | "escalated" | "resolved";
  dueAt: string;
};
type SlaWorkspace = {
  metrics: { requiringAction: number; breached: number; escalated: number; unread: number };
  cases: ReadonlyArray<SlaCase>;
  notifications: ReadonlyArray<SlaNotification>;
};
type Category = "new" | "processing" | "ready";

const DAILY_ACTIVE_FULFILMENT_STATUSES = new Set([
  "awaiting_acceptance",
  "accepted",
  "picking",
  "packed",
  "ready_for_handover"
]);

const formatWhen = (value: string | number) => new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens"
}).format(new Date(value));

const actionLabel: Record<string, string> = {
  accept: "Αποδοχή & έναρξη",
  reject: "Απόρριψη",
  ready: "Έτοιμο για παραλαβή",
  delivered: "Παραδόθηκε"
};

function payloadString(payload: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function categoryOf(item: Fulfilment): Category {
  if (item.status === "awaiting_acceptance") return "new";
  if (item.mode === "pickup" && item.status === "ready_for_handover") return "ready";
  return "processing";
}

export function VendorDailyOrdersClient({ dashboard, sla }: { dashboard: Dashboard; sla: SlaWorkspace }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("category");
  const requestedOrder = searchParams.get("order");
  const [selected, setSelected] = useState<Category>(
    requested === "processing" || requested === "ready" || requested === "new" ? requested : "new"
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const orderReceived = sla.notifications.filter((item) => item.eventType === "vendor.order_received");
  const received = useMemo(() => new Set(
    orderReceived.map((item) => payloadString(item.payload, "fulfilmentId")).filter(Boolean) as string[]
  ), [orderReceived]);
  const acknowledged = useMemo(() => new Set(
    orderReceived.filter((item) => item.readAt).map((item) => payloadString(item.payload, "fulfilmentId")).filter(Boolean) as string[]
  ), [orderReceived]);

  const activeOrders = dashboard.fulfilments.filter((item) => {
    if (!DAILY_ACTIVE_FULFILMENT_STATUSES.has(item.status)) return false;
    if (item.status !== "awaiting_acceptance") return true;
    if (!received.has(item.id)) return true; // existing order created before acknowledgement workflow
    return acknowledged.has(item.id);
  });

  const groups = useMemo(() => ({
    new: activeOrders.filter((item) => categoryOf(item) === "new"),
    processing: activeOrders.filter((item) => categoryOf(item) === "processing"),
    ready: activeOrders.filter((item) => categoryOf(item) === "ready")
  }), [activeOrders]);

  const slaByFulfilment = useMemo(() => new Map(
    sla.cases.filter((item) => item.state !== "resolved").map((item) => [item.fulfilmentId, item])
  ), [sla.cases]);

  const list = groups[selected];

  async function act(item: Fulfilment, action: string) {
    const key = `${item.id}:${action}`;
    setBusy(key); setError("");
    try {
      const response = await fetch("/api/daily/fulfilments/action", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": dashboard.csrfToken },
        body: JSON.stringify({ fulfilmentId: item.id, action })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η ενημέρωση απέτυχε.");
      router.refresh();
      if (action === "accept") setSelected("processing");
      if (action === "ready") setSelected("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενημέρωση απέτυχε.");
    } finally { setBusy(""); }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/daily" className={styles.brand}><span>KONTA MOY</span><strong>Daily · Orders</strong></Link>
      <div><strong>{dashboard.vendor.name}</strong></div>
    </header>

    <div className={styles.shell}>
      <section className={styles.summary}>
        <span className={styles.eyebrow}>Live order board</span>
        <h1>Παραγγελίες</h1>
        <p>Οι νέες παραγγελίες εμφανίζονται εδώ μόνο αφού επιβεβαιώσεις ότι είδες την ειδοποίηση.</p>
      </section>

      <section className={styles.categoryGrid} aria-label="Κατηγορίες παραγγελιών">
        <button type="button" className={`${styles.category} ${styles.red} ${selected === "new" ? styles.selected : ""}`} onClick={() => setSelected("new")}>
          <span>Νέες</span><strong>{groups.new.length}</strong><small>προς αποδοχή</small>
        </button>
        <button type="button" className={`${styles.category} ${styles.amber} ${selected === "processing" ? styles.selected : ""}`} onClick={() => setSelected("processing")}>
          <span>Σε επεξεργασία</span><strong>{groups.processing.length}</strong><small>ετοιμάζονται τώρα</small>
        </button>
        <button type="button" className={`${styles.category} ${styles.green} ${selected === "ready" ? styles.selected : ""}`} onClick={() => setSelected("ready")}>
          <span>Έτοιμες</span><strong>{groups.ready.length}</strong><small>για παραλαβή</small>
        </button>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}

      <section className={styles.listSection}>
        <div className={styles.listHead}><h2>{selected === "new" ? "Νέες παραγγελίες" : selected === "processing" ? "Σε επεξεργασία" : "Έτοιμες για παραλαβή"}</h2><span>{list.length}</span></div>
        {list.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν παραγγελίες σε αυτή την κατηγορία.</div> : <div className={styles.list}>
          {list.map((item) => {
            const slaCase = slaByFulfilment.get(item.id);
            const highlighted = requestedOrder === item.orderId;
            return <article id={`order-${item.orderId}`} key={item.id} className={`${styles.orderCard} ${styles[selected]} ${highlighted ? styles.highlight : ""}`}>
              <div className={styles.orderHead}>
                <div><span>{item.mode === "pickup" ? "Παραλαβή από κατάστημα" : item.mode}</span><strong>{item.orderReference}</strong><small>{formatWhen(item.createdAt)}</small></div>
                <b>{selected === "new" ? "ΝΕΑ" : selected === "processing" ? "ΣΕ ΕΞΕΛΙΞΗ" : "ΕΤΟΙΜΗ"}</b>
              </div>
              {slaCase && <div className={`${styles.sla} ${slaCase.state === "breached" || slaCase.state === "escalated" ? styles.slaDanger : ""}`}>
                <span>{slaCase.stage === "acceptance" ? "SLA αποδοχής" : "SLA προετοιμασίας"}</span><strong>{formatWhen(slaCase.dueAt)}</strong>
              </div>}
              <div className={styles.lines}>{item.lines.map((line) => <div key={line.id}><strong>{line.quantity}×</strong><span>{line.title}</span></div>)}</div>
              <div className={styles.meta}><span>{item.merchandiseSubtotal}</span>{item.deliveryCharge && <span>Παράδοση {item.deliveryCharge}</span>}</div>
              {selected === "ready" ? <Link href="/daily/scan" className={styles.scanButton}>Σάρωση QR παραλαβής</Link> :
                item.actions.length > 0 ? <div className={styles.actions}>{item.actions.map((action) => <button key={action} type="button" disabled={Boolean(busy)}
                  className={action === "reject" ? styles.secondary : styles.primary} onClick={() => void act(item, action)}>
                  {busy === `${item.id}:${action}` ? "Ενημέρωση…" : actionLabel[action] ?? action}
                </button>)}</div> : <div className={styles.noAction}>Δεν απαιτείται χειροκίνητη αλλαγή κατάστασης αυτή τη στιγμή.</div>}
            </article>;
          })}
        </div>}
      </section>
    </div>

    <VendorDailyBottomNav active="orders" unread={sla.metrics.unread} />
  </main>;
}
