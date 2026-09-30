"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildVendorTodayIntelligence } from "../lib/vendor-today-intelligence";
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
type Product = {
  offerId: string;
  canonicalVariantId: string;
  title: string;
  onHand: number;
  reserved: number;
  blocked: number;
  safetyStock: number;
  availableToSell: number;
  updatedAt: number;
};
type Dashboard = {
  vendor: { id: string; name: string; adviser: string };
  account: { email: string; roles: ReadonlyArray<string> };
  csrfToken: string;
  metrics: { ordersRequiringAction: number; activeProducts: number; availableUnits: number; openFulfilments: number };
  products: ReadonlyArray<Product>;
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

const DAILY_ACTIONS = [
  { id: "orders", label: "Παραγγελίες", note: "Αποδοχή & προετοιμασία", href: "/daily/orders", icon: "□", keywords: "orders παραγγελίες αποδοχή picking" },
  { id: "scan", label: "Scan", note: "QR και barcode", href: "/daily/scan", icon: "⌁", keywords: "scan qr barcode σάρωση" },
  { id: "quickadd", label: "Quick Add", note: "Stock και γρήγορη καταχώρηση", href: "/daily/quickadd", icon: "+", keywords: "quick add stock απόθεμα προϊόν" },
  { id: "gift-cards", label: "Gift Cards", note: "Έκδοση και εξαργύρωση", href: "/daily/gift-cards", icon: "◇", keywords: "gift cards δωροκάρτες" },
  { id: "pickup", label: "Παραλαβές", note: "Pickup και handover", href: "/daily/pickup", icon: "↗", keywords: "pickup παραλαβή πελάτης" },
  { id: "delivery", label: "Delivery", note: "Τοπική παράδοση", href: "/daily/delivery", icon: "→", keywords: "delivery παράδοση handover" },
  { id: "ask-local", label: "Ask Local", note: "Μηνύματα πελατών", href: "/daily/ask-local", icon: "◌", keywords: "ask local messages μηνύματα πελάτες" },
  { id: "opportunities", label: "Ευκαιρίες", note: "Stock και εμπορικές ευκαιρίες", href: "/daily/opportunities", icon: "↗", keywords: "opportunities ευκαιρίες stock" },
  { id: "alerts", label: "Ειδοποιήσεις", note: "Ιστορικό και ενεργά alerts", href: "/daily/notifications", icon: "!", keywords: "notifications ειδοποιήσεις alerts sla" }
] as const;

const SECONDARY_DAILY_ACTIONS = new Set(["pickup", "delivery", "ask-local", "opportunities", "alerts"]);

const DAILY_ACTIVE_FULFILMENT_STATUSES = new Set([
  "awaiting_acceptance",
  "accepted",
  "picking",
  "packed",
  "ready_for_handover"
]);
const BRIDGE_FLAG = "kontamou-daily-push-bridge-active";

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

function friendlyEventTitle(title: string): string {
  const normalized = title.trim().toLocaleLowerCase("en");
  if (normalized === "ask_local.assigned") return "Νέο αίτημα Ask Local";
  if (normalized === "ask_local.offer_accepted") return "Προσφορά Ask Local έγινε αποδεκτή";
  if (normalized === "ask_local.offer_rejected") return "Προσφορά Ask Local δεν έγινε αποδεκτή";
  if (normalized === "ask_local.closed") return "Αίτημα Ask Local ολοκληρώθηκε";
  if (normalized.startsWith("ask_local.")) return "Ενημέρωση Ask Local";
  return title;
}

function notificationStillNeedsAction(notification: SlaNotification, statusByFulfilment: ReadonlyMap<string, string>): boolean {
  const fulfilmentId = payloadString(notification.payload, "fulfilmentId");
  if (!fulfilmentId) return !notification.readAt;
  const status = statusByFulfilment.get(fulfilmentId);
  if (!status) return !notification.readAt;
  const stage = payloadString(notification.payload, "stage");
  if (notification.eventType === "vendor.order_received" || stage === "acceptance") return status === "awaiting_acceptance";
  if (stage === "preparation" || notification.eventType.startsWith("vendor.sla_")) return ["accepted", "picking", "packed"].includes(status);
  return !notification.readAt;
}

export function VendorDailyHomeClient({
  dashboard, advice, sla, push, generatedAt
}: {
  dashboard: Dashboard;
  advice: Advice;
  sla: SlaWorkspace;
  push: PushStatus;
  generatedAt: number;
}) {
  const router = useRouter();
  const [ackBusy, setAckBusy] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [support, setSupport] = useState<BrowserSupport>("checking");
  const [permission, setPermission] = useState<NotificationPermission | "unavailable">("unavailable");
  const [bridgeActive, setBridgeActive] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [dailyQuery, setDailyQuery] = useState("");

  useEffect(() => {
    setBridgeActive(window.localStorage.getItem(BRIDGE_FLAG) === "1");
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupport(supported ? "supported" : "unsupported");
    setPermission(supported ? Notification.permission : "unavailable");

    if (!supported) return;
    const refreshPermission = () => {
      if (document.visibilityState === "visible") {
        setPermission(Notification.permission);
        setBridgeActive(window.localStorage.getItem(BRIDGE_FLAG) === "1");
      }
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

  const statusByFulfilment = useMemo(() => new Map(dashboard.fulfilments.map((item) => [item.id, item.status])), [dashboard.fulfilments]);
  const actionableSlaNotifications = useMemo(
    () => sla.notifications.filter((item) => notificationStillNeedsAction(item, statusByFulfilment)),
    [sla.notifications, statusByFulfilment]
  );
  const openAsk = advice.counteroffers.filter((item) => !["closed", "expired", "accepted", "rejected"].includes(item.status));
  const today = useMemo(() => buildVendorTodayIntelligence({
    now: generatedAt,
    products: dashboard.products,
    fulfilments: dashboard.fulfilments,
    askLocalOpen: openAsk.length,
    unacknowledgedOrders: unacknowledged.length,
    slaRequiringAction: sla.metrics.requiringAction,
    slaBreached: sla.metrics.breached,
    slaEscalated: sla.metrics.escalated
  }), [dashboard.fulfilments, dashboard.products, generatedAt, openAsk.length, sla.metrics.breached, sla.metrics.escalated, sla.metrics.requiringAction, unacknowledged.length]);
  const feed = [
    ...actionableSlaNotifications.map((item) => ({ id: `sla:${item.id}`, title: item.title, body: item.body, at: new Date(item.createdAt).getTime(), href: orderHref(item) })),
    ...advice.notifications.map((item) => ({ id: `advice:${item.id}`, title: friendlyEventTitle(item.title), body: item.body, at: item.createdAt ?? 0, href: "/daily/ask-local" }))
  ].sort((a, b) => b.at - a.at).slice(0, 2);
  const unread = actionableSlaNotifications.filter((item) => !item.readAt).length + advice.notifications.length;
  const quickActions = useMemo(() => {
    const needle = dailyQuery.trim().toLocaleLowerCase("el");
    if (needle) {
      return DAILY_ACTIONS.filter((item) =>
        `${item.label} ${item.note} ${item.keywords}`.toLocaleLowerCase("el").includes(needle)
      );
    }
    if (!toolsOpen) return [];
    return DAILY_ACTIONS.filter((item) => SECONDARY_DAILY_ACTIONS.has(item.id));
  }, [dailyQuery, toolsOpen]);

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
      if (result === "denied") throw new Error("Οι ειδοποιήσεις αποκλείστηκαν. Άνοιξε τις ρυθμίσεις ειδοποιήσεων του Daily για την εναλλακτική ενεργοποίηση Background Push.");
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
      <section className={styles.commandDock} aria-label="Αναζήτηση και εργαλεία Daily">
        <div className={styles.commandBar}>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={dailyQuery}
            onChange={(event) => setDailyQuery(event.target.value)}
            placeholder="Αναζήτηση λειτουργίας…"
            aria-label="Αναζήτηση λειτουργιών Daily"
          />
          {dailyQuery
            ? <button type="button" className={styles.clearSearch} onClick={() => setDailyQuery("")} aria-label="Καθαρισμός αναζήτησης">×</button>
            : <button type="button" className={styles.toolsToggle} aria-expanded={toolsOpen} onClick={() => setToolsOpen((current) => !current)}>
                {toolsOpen ? "Κλείσιμο" : "Εργαλεία"}
              </button>}
        </div>
        {(toolsOpen || dailyQuery.trim()) && <div className={styles.commandPanel}>
          {quickActions.map((item) => <Link href={item.href} key={item.id} className={styles.quickAction}>
            <span aria-hidden="true">{item.icon}</span>
            <div><strong>{item.label}</strong><small>{item.note}</small></div>
          </Link>)}
          {quickActions.length === 0 && <div className={styles.quickEmpty}>Δεν βρέθηκε λειτουργία. Δοκίμασε άλλη λέξη.</div>}
        </div>}
      </section>

      {support !== "checking" && permission !== "granted" && !bridgeActive && <section className={styles.permissionCard}>
        <div><span className={styles.eyebrow}>Browser permission</span><h1>Ενεργοποίησε ειδοποιήσεις</h1><p>{permission === "denied" ? "Το kontamou.site έχει μπλοκαριστεί αυτόματα από τον browser. Άνοιξε τις ρυθμίσεις ειδοποιήσεων του Daily για την εναλλακτική ενεργοποίηση Background Push." : "Νέες παραγγελίες, αλλαγές και SLA μπορούν να εμφανίζονται στο κινητό ακόμη και όταν το Daily δεν είναι ανοιχτό."}</p></div>
        <button type="button" onClick={() => void enableNotifications()} disabled={pushBusy || support !== "supported"}>
          {pushBusy ? "Ενεργοποίηση…" : support === "supported" ? permission === "denied" ? "Εναλλακτική ενεργοποίηση" : "Να επιτρέπονται" : "Δεν υποστηρίζεται"}
        </button>
      </section>}

      <section className={styles.todaySection} aria-labelledby="daily-today-title">
        <div className={styles.todayHero}>
          <div><span className={styles.eyebrow}>Today · Sparta</span><h1 id="daily-today-title">Τι χρειάζεται σήμερα</h1><p>Μία γρήγορη εικόνα από παραγγελίες, Ask Local και πραγματική κατάσταση stock.</p></div>
          <span className={styles.todayStamp}>{new Intl.DateTimeFormat("el-GR", { weekday: "short", day: "2-digit", month: "short", timeZone: "Europe/Athens" }).format(new Date(generatedAt))}</span>
        </div>
        <div className={styles.todayMetrics}>
          <Link href="/daily/orders" className={styles.todayMetric}><span>Σήμερα</span><strong>{today.metrics.ordersToday}</strong><small>{today.metrics.unitsToday} τεμ. σε νέες παραγγελίες</small></Link>
          <Link href="/daily/orders" className={styles.todayMetric}><span>24ωρο</span><strong>{today.metrics.orders24h}</strong><small>ενεργές παραγγελίες</small></Link>
          <Link href="/daily/ask-local" className={styles.todayMetric}><span>Ask Local</span><strong>{today.metrics.askLocalOpen}</strong><small>ανοιχτά αιτήματα</small></Link>
          <Link href="/daily/quickadd" className={styles.todayMetric}><span>Stock freshness</span><strong>{today.metrics.stockFreshnessPercent}%</strong><small>{today.metrics.staleStock} παλιά · {today.metrics.outOfStock} μηδενικά</small></Link>
        </div>
        <div className={styles.priorityList}>
          {today.priorities.slice(0, 4).map((priority, index) => <Link key={priority.id} href={priority.href} className={`${styles.priorityCard} ${styles[`priority_${priority.tone}`]}`}>
            <span className={styles.priorityRank}>{index + 1}</span>
            <div><strong>{priority.title}</strong><small>{priority.detail}</small></div>
            <b>{priority.count > 0 ? priority.count : "✓"}</b>
          </Link>)}
        </div>
      </section>

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

      <section className={styles.events}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Activity</span><h2>Πρόσφατη δραστηριότητα</h2></div><Link href="/daily/notifications">Όλες</Link></div>
        {feed.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν πρόσφατα συμβάντα που χρειάζονται ενέργεια.</div> : <div className={styles.eventList}>
          {feed.map((event) => <Link key={event.id} href={event.href} className={styles.event}><div><strong>{event.title}</strong><p>{event.body}</p><small>{event.at ? formatWhen(event.at) : ""}</small></div><span aria-hidden="true">›</span></Link>)}
        </div>}
      </section>

      {message && <div className={styles.message} role="status">{message}</div>}
    </div>
    <VendorDailyBottomNav active="home" unread={unread} />
  </main>;
}
