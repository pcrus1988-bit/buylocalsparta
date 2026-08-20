"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { VendorDailyBottomNav } from "./VendorDailyBottomNav";
import styles from "./VendorDailyHomeClient.module.css";

type Fulfilment = {
  id: string;
  orderId: string;
  orderReference: string;
  orderStatus: string;
  status: string;
  mode: string;
  createdAt: number;
  lines: ReadonlyArray<{ id: string; title: string; quantity: number; status: string }>;
  actions: ReadonlyArray<string>;
};
type Dashboard = {
  vendor: { id: string; name: string; adviser: string };
  account: { email: string; roles: ReadonlyArray<string> };
  csrfToken: string;
  metrics: { ordersRequiringAction: number; activeProducts: number; availableUnits: number; openFulfilments: number };
  fulfilments: ReadonlyArray<Fulfilment>;
};
type Advice = {
  counteroffers: ReadonlyArray<{ id: string; status: string; canonicalVariantId?: string; need?: unknown }>;
  notifications: ReadonlyArray<{ id: string; title: string; body: string; createdAt?: number }>;
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
type SlaWorkspace = {
  metrics: { requiringAction: number; breached: number; escalated: number; unread: number };
  notifications: ReadonlyArray<SlaNotification>;
};
type PushStatus = { configured: boolean; publicKey?: string; devices: number };

type BrowserSupport = "checking" | "supported" | "unsupported";

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

function applicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return buffer;
}

function payloadString(payload: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function orderHref(notification: SlaNotification): string {
  const orderId = payloadString(notification.payload, "orderId");
  return orderId ? `/daily/orders?order=${encodeURIComponent(orderId)}` : "/daily/orders";
}

export function VendorDailyHomeClient({
  dashboard, advice, sla, push
}: {
  dashboard: Dashboard;
  advice: Advice;
  sla: SlaWorkspace;
  push: PushStatus;
}) {
  const router = useRouter();
  const [ackBusy, setAckBusy] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [support, setSupport] = useState<BrowserSupport>("checking");
  const [permission, setPermission] = useState<NotificationPermission | "unavailable">("unavailable");

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupport(supported ? "supported" : "unsupported");
    setPermission(supported ? Notification.permission : "unavailable");

    if (!supported) return;
    const refreshPermission = () => {
      if (document.visibilityState === "visible") setPermission(Notification.permission);
    };
    document.addEventListener("visibilitychange", refreshPermission);
    window.addEventListener("focus", refreshPermission);
    return () => {
      document.removeEventListener("visibilitychange", refreshPermission);
      window.removeEventListener("focus", refreshPermission);
    };
  }, []);

  const orderReceived = useMemo(
    () => sla.notifications.filter((item) => item.eventType === "vendor.order_received"),
    [sla.notifications]
  );
  const unacknowledged = orderReceived.filter((item) => !item.readAt);
  const acknowledgedFulfilments = useMemo(() => new Set(
    orderReceived.filter((item) => item.readAt).map((item) => payloadString(item.payload, "fulfilmentId")).filter(Boolean) as string[]
  ), [orderReceived]);
  const receivedFulfilments = useMemo(() => new Set(
    orderReceived.map((item) => payloadString(item.payload, "fulfilmentId")).filter(Boolean) as string[]
  ), [orderReceived]);

  const visibleOrders = dashboard.fulfilments.filter((item) => {
    if (!DAILY_ACTIVE_FULFILMENT_STATUSES.has(item.status)) return false;
    if (item.status !== "awaiting_acceptance") return true;
    if (!receivedFulfilments.has(item.id)) return true; // legacy/backfill safety
    return acknowledgedFulfilments.has(item.id);
  });
  const newCount = visibleOrders.filter((item) => item.status === "awaiting_acceptance").length;
  const readyCount = visibleOrders.filter((item) => item.mode === "pickup" && item.status === "ready_for_handover").length;
  const processingCount = visibleOrders.filter((item) =>
    item.status !== "awaiting_acceptance" && !(item.mode === "pickup" && item.status === "ready_for_handover")
  ).length;

  const openAsk = advice.counteroffers.filter((item) => !["closed", "expired", "accepted", "rejected"].includes(item.status));
  const feed = [
    ...sla.notifications.filter((item) => !item.readAt).map((item) => ({ id: `sla:${item.id}`, title: item.title, body: item.body, at: new Date(item.createdAt).getTime(), href: orderHref(item) })),
    ...advice.notifications.map((item) => ({ id: `advice:${item.id}`, title: item.title, body: item.body, at: item.createdAt ?? 0, href: "/daily/ask-local" }))
  ].sort((a, b) => b.at - a.at).slice(0, 3);
  const unread = sla.metrics.unread + advice.notifications.length;

  async function acknowledge(notification: SlaNotification) {
    setAckBusy(notification.id);
    setMessage("");
    try {
      const response = await fetch("/api/daily/notifications/acknowledge", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": dashboard.csrfToken },
        body: JSON.stringify({ notificationId: notification.id })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η επιβεβαίωση απέτυχε.");
      router.push(orderHref(notification));
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Η επιβεβαίωση απέτυχε.");
    } finally {
      setAckBusy("");
    }
  }

  async function enableNotifications() {
    if (support !== "supported") return;
    if (Notification.permission === "denied") {
      router.push("/daily/notifications/settings");
      return;
    }
    setPushBusy(true);
    setMessage("");
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "denied") throw new Error("Οι ειδοποιήσεις αποκλείστηκαν. Άνοιξε τις ρυθμίσεις ειδοποιήσεων του Daily για οδηγίες επανενεργοποίησης.");
      if (result !== "granted") throw new Error("Δεν δόθηκε άδεια για ειδοποιήσεις.");
      if (!push.configured || !push.publicKey) {
        setMessage("Ο browser επέτρεψε τις ειδοποιήσεις, αλλά το server Web Push δεν είναι ακόμη διαθέσιμο.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/daily-sw.js", { scope: "/daily/" });
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(push.publicKey)
        });
      }
      const json = subscription.toJSON();
      const response = await fetch("/api/daily/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": dashboard.csrfToken },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth }
        })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η εγγραφή ειδοποιήσεων απέτυχε.");
      setMessage("Οι ειδοποιήσεις του KONTA MOY Daily ενεργοποιήθηκαν σε αυτή τη συσκευή.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η ενεργοποίηση ειδοποιήσεων.");
    } finally {
      setPushBusy(false);
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/daily" className={styles.brand}><span>KONTA MOY</span><strong>Daily</strong></Link>
      <div className={styles.vendor}><strong>{dashboard.vendor.name}</strong><span>{dashboard.account.email}</span></div>
    </header>

    <div className={styles.shell}>
      {support !== "checking" && permission !== "granted" && <section className={styles.permissionCard}>
        <div><span className={styles.eyebrow}>Browser permission</span><h1>Ενεργοποίησε ειδοποιήσεις</h1><p>{permission === "denied" ? "Το kontamou.site είναι αποκλεισμένο από τον browser. Άλλαξε την άδεια σε «Επιτρέπεται» και το Daily θα επανελέγξει αυτόματα τη συσκευή." : "Νέες παραγγελίες, αλλαγές και SLA μπορούν να εμφανίζονται στο κινητό ακόμη και όταν το Daily δεν είναι ανοιχτό."}</p></div>
        <button type="button" onClick={() => void enableNotifications()} disabled={pushBusy || support !== "supported"}>
          {pushBusy ? "Ενεργοποίηση…" : support === "supported" ? permission === "denied" ? "Οδηγίες ρυθμίσεων" : "Να επιτρέπονται" : "Δεν υποστηρίζεται"}
        </button>
      </section>}

      {unacknowledged.length > 0 && <section className={styles.inbox}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Χρειάζεται επιβεβαίωση</span><h2>Νέες παραγγελίες</h2></div><b>{unacknowledged.length}</b></div>
        <div className={styles.inboxList}>
          {unacknowledged.map((notification) => <article key={notification.id} className={styles.newOrderCard}>
            <div><span className={styles.liveDot}>ΝΕΑ</span><strong>{payloadString(notification.payload, "orderReference") ?? payloadString(notification.payload, "orderId") ?? notification.title}</strong><p>{notification.body}</p><small>{formatWhen(notification.createdAt)}</small></div>
            <button type="button" disabled={Boolean(ackBusy)} onClick={() => void acknowledge(notification)}>
              {ackBusy === notification.id ? "Επιβεβαίωση…" : "Έλαβα γνώση"}
            </button>
          </article>)}
        </div>
      </section>}

      <section className={styles.ordersSection}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Orders</span><h2>Παραγγελίες</h2></div><Link href="/daily/orders">Όλες</Link></div>
        <div className={styles.trafficGrid}>
          <Link href="/daily/orders?category=new" className={`${styles.trafficCard} ${styles.red}`}><span>Νέες</span><strong>{newCount}</strong><small>προς αποδοχή</small></Link>
          <Link href="/daily/orders?category=processing" className={`${styles.trafficCard} ${styles.amber}`}><span>Σε επεξεργασία</span><strong>{processingCount}</strong><small>ετοιμάζονται</small></Link>
          <Link href="/daily/orders?category=ready" className={`${styles.trafficCard} ${styles.green}`}><span>Έτοιμες</span><strong>{readyCount}</strong><small>για παραλαβή</small></Link>
        </div>
      </section>

      {openAsk.length > 0 && <Link href="/daily/ask-local" className={styles.askCard}>
        <div><span className={styles.eyebrow}>Ask Local</span><strong>{openAsk.length} ανοιχτά αιτήματα</strong><small>Άνοιγμα μηνυμάτων και αιτημάτων πελατών</small></div><span aria-hidden="true">›</span>
      </Link>}

      <section className={styles.events}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Alerts</span><h2>Τελευταία συμβάντα</h2></div><Link href="/daily/notifications">Ιστορικό</Link></div>
        {feed.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν πρόσφατα συμβάντα που χρειάζονται ενέργεια.</div> : <div className={styles.eventList}>
          {feed.map((event) => <Link key={event.id} href={event.href} className={styles.event}><div><strong>{event.title}</strong><p>{event.body}</p><small>{event.at ? formatWhen(event.at) : ""}</small></div><span aria-hidden="true">›</span></Link>)}
        </div>}
      </section>

      {message && <div className={styles.message} role="status">{message}</div>}
    </div>
    <VendorDailyBottomNav unread={unread} />
  </main>;
}
