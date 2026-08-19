"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./VendorDailyClient.module.css";

type Fulfilment = {
  id: string;
  orderId: string;
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
  vendor: { id: string; name: string; adviser: string };
  account: { email: string; roles: readonly string[] };
  csrfToken: string;
  metrics: { ordersRequiringAction: number; activeProducts: number; availableUnits: number; openFulfilments: number };
  fulfilments: readonly Fulfilment[];
};

type Advice = {
  csrfToken: string;
  conversations: readonly Array<{ id: string; state: string; canonicalVariantId?: string; messages: readonly Array<{ id: string; senderType: string; body: string; createdAt?: number }> }>;
  appointments: readonly Array<{ id: string; status: string; channel: string; startsAt: number; canonicalVariantId?: string }>;
  counteroffers: readonly Array<{ id: string; status: string; canonicalVariantId?: string; need?: string }>;
  privateOffers: readonly Array<{ id: string; status?: string; canonicalVariantId?: string; price?: string }>;
  notifications: readonly Array<{ id: string; title: string; body: string; createdAt?: number }>;
};

type Tab = "orders" | "ask" | "alerts";

const actionLabel: Record<string, string> = {
  accept: "Αποδοχή",
  reject: "Δεν μπορώ",
  ready: "Έτοιμο για παραλαβή",
  delivered: "Παραδόθηκε"
};

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function urgency(item: Fulfilment): number {
  if (item.actions.includes("accept") || item.actions.includes("reject")) return 0;
  if (item.actions.includes("ready")) return 1;
  if (item.actions.length > 0) return 2;
  return 3;
}

export function VendorDailyClient({ dashboard, advice }: { dashboard: Dashboard; advice: Advice }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("orders");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const fulfilments = useMemo(() => [...dashboard.fulfilments].sort((a, b) => urgency(a) - urgency(b) || a.createdAt - b.createdAt), [dashboard.fulfilments]);
  const openAsk = advice.counteroffers.filter((item) => !["closed", "expired", "accepted", "rejected"].includes(item.status));
  const unreadLike = advice.notifications.length;
  const attention = dashboard.metrics.ordersRequiringAction + openAsk.length;

  async function fulfilmentAction(item: Fulfilment, action: string) {
    const key = `${item.id}:${action}`;
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/vendor/fulfilments/action", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": dashboard.csrfToken },
        body: JSON.stringify({ fulfilmentId: item.id, action })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια απέτυχε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε");
    } finally {
      setBusy("");
    }
  }

  return <main className={styles.daily}>
    <header className={styles.header}>
      <div>
        <span className={styles.brand}>KONTA MOY</span>
        <strong className={styles.dailyMark}>Daily</strong>
      </div>
      <div className={styles.shop}>
        <strong>{dashboard.vendor.name}</strong>
        <span>{dashboard.account.email}</span>
      </div>
    </header>

    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>Σήμερα</span>
        <h1>{attention > 0 ? `${attention} ενέργειες χρειάζονται προσοχή` : "Όλα είναι υπό έλεγχο"}</h1>
        <p>Παραγγελίες, Ask Local και παραλαβές χωρίς το πλήρες backoffice.</p>
      </div>
      <Link href="/daily/scan" className={styles.scanHero} aria-label="Σάρωση QR παραλαβής">
        <span aria-hidden="true">▣</span>
        Σάρωση QR
      </Link>
    </section>

    <section className={styles.metrics} aria-label="Daily overview">
      <button type="button" onClick={() => setTab("orders")}><span>Παραγγελίες</span><strong>{dashboard.metrics.ordersRequiringAction}</strong></button>
      <button type="button" onClick={() => setTab("ask")}><span>Ask Local</span><strong>{openAsk.length}</strong></button>
      <button type="button" onClick={() => setTab("alerts")}><span>Ειδοποιήσεις</span><strong>{unreadLike}</strong></button>
    </section>

    {error && <div className={styles.error} role="alert">{error}</div>}

    {tab === "orders" && <section className={styles.content}>
      <div className={styles.sectionHead}><div><span>Orders</span><h2>Παραγγελίες</h2></div><small>Ό,τι χρειάζεται ενέργεια εμφανίζεται πρώτο.</small></div>
      {fulfilments.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν ενεργές παραγγελίες αυτή τη στιγμή.</div> : <div className={styles.cards}>
        {fulfilments.map((item) => <article className={`${styles.card} ${item.actions.length ? styles.actionCard : ""}`} key={item.id}>
          <div className={styles.cardTop}>
            <div><strong>{item.orderId}</strong><span>{date(item.createdAt)} · {item.mode === "pickup" ? "Παραλαβή" : item.mode}</span></div>
            <span className={styles.status}>{item.status}</span>
          </div>
          <div className={styles.lines}>{item.lines.map((line) => <div key={line.id}><strong>{line.quantity}×</strong><span>{line.title}</span></div>)}</div>
          <div className={styles.orderMeta}><span>Εμπορεύματα {item.merchandiseSubtotal}</span>{item.deliveryCharge && <span>Παράδοση {item.deliveryCharge}</span>}</div>
          {item.actions.length > 0 && <div className={styles.actions}>{item.actions.map((action) => <button key={action} type="button" className={action === "reject" ? styles.secondaryAction : styles.primaryAction} disabled={Boolean(busy)} onClick={() => void fulfilmentAction(item, action)}>{busy === `${item.id}:${action}` ? "Ενημέρωση…" : actionLabel[action] ?? action}</button>)}</div>}
        </article>)}
      </div>}
    </section>}

    {tab === "ask" && <section className={styles.content}>
      <div className={styles.sectionHead}><div><span>Ask Local</span><h2>Αιτήματα πελατών</h2></div><small>Μόνο τα αιτήματα που έχουν ανατεθεί στο κατάστημά σου.</small></div>
      {openAsk.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν ανοιχτά Ask Local αιτήματα.</div> : <div className={styles.cards}>{openAsk.map((request) => <article className={styles.card} key={request.id}>
        <div className={styles.cardTop}><div><strong>{request.canonicalVariantId ?? "Γενικό αίτημα"}</strong><span>{request.need ?? "Αίτημα πελάτη"}</span></div><span className={styles.status}>{request.status}</span></div>
      </article>)}</div>}
      <Link className={styles.fullWidthLink} href="/daily/ask-local">Άνοιγμα Ask Local & μηνυμάτων</Link>
    </section>}

    {tab === "alerts" && <section className={styles.content}>
      <div className={styles.sectionHead}><div><span>Alerts</span><h2>Πρόσφατες ειδοποιήσεις</h2></div><small>Λειτουργικές ενημερώσεις του καταστήματός σου.</small></div>
      {advice.notifications.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν πρόσφατες ειδοποιήσεις.</div> : <div className={styles.cards}>{advice.notifications.map((notification) => <article className={styles.alertCard} key={notification.id}><strong>{notification.title}</strong><p>{notification.body}</p>{notification.createdAt && <small>{date(notification.createdAt)}</small>}</article>)}</div>}
      <Link className={styles.fullWidthLink} href="/daily/notifications">Ρύθμιση ειδοποιήσεων κινητού</Link>
    </section>}

    <nav className={styles.bottomNav} aria-label="KONTA MOY Daily">
      <button type="button" className={tab === "orders" ? styles.active : ""} onClick={() => setTab("orders")}><span aria-hidden="true">▤</span>Orders</button>
      <button type="button" className={tab === "ask" ? styles.active : ""} onClick={() => setTab("ask")}><span aria-hidden="true">◌</span>Ask Local</button>
      <Link href="/daily/scan" className={styles.scanNav}><span aria-hidden="true">▣</span>Scan</Link>
      <button type="button" className={tab === "alerts" ? styles.active : ""} onClick={() => setTab("alerts")}><span aria-hidden="true">●</span>Alerts</button>
    </nav>
  </main>;
}
