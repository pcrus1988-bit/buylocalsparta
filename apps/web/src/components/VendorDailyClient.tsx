"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  csrfToken: string;
  conversations: ReadonlyArray<{ id: string; state: string; canonicalVariantId?: string; messages: ReadonlyArray<{ id: string; senderType: string; body: string; createdAt?: number }> }>;
  appointments: ReadonlyArray<{ id: string; status: string; channel: string; startsAt: number; canonicalVariantId?: string }>;
  counteroffers: ReadonlyArray<{ id: string; status: string; canonicalVariantId?: string; need?: unknown }>;
  privateOffers: ReadonlyArray<{ id: string; status?: string; canonicalVariantId?: string; price?: string }>;
  notifications: ReadonlyArray<{ id: string; title: string; body: string; createdAt?: number }>;
};

type SlaCase = {
  id: string;
  orderId: string;
  fulfilmentId: string;
  stage: "acceptance" | "preparation";
  state: "open" | "breached" | "escalated" | "resolved";
  fulfilmentStatus: string;
  dueAt: string;
  escalationAt: string;
  agreementCode?: string;
  agreementVersion?: number;
  policy: Record<string, unknown>;
};

type SlaWorkspace = {
  metrics: { requiringAction: number; breached: number; escalated: number; unread: number };
  cases: ReadonlyArray<SlaCase>;
  notifications: ReadonlyArray<{ id: string; eventType: string; title: string; body: string; createdAt: string; readAt?: string }>;
};

type Tab = "orders" | "ask" | "alerts";

const actionLabel: Record<string, string> = {
  accept: "Αποδοχή",
  reject: "Δεν μπορώ",
  ready: "Έτοιμο για παραλαβή",
  delivered: "Παραδόθηκε"
};

const date = (value: number | string) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function requestNeed(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["description", "query", "need", "title", "message"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return "Αίτημα πελάτη";
}

function slaRemaining(slaCase: SlaCase, now: number): string {
  if (slaCase.state === "escalated") return "Κλιμάκωση";
  if (slaCase.state === "breached") return "Εκτός SLA";
  const remaining = new Date(slaCase.dueAt).getTime() - now;
  if (remaining <= 0) return "Η προθεσμία έληξε";
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  if (minutes < 60) return `${minutes} λ. απομένουν`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}ω ${rest}λ απομένουν` : `${hours}ω απομένουν`;
}

function slaTone(slaCase: SlaCase, now: number): "normal" | "warning" | "breach" {
  if (slaCase.state === "breached" || slaCase.state === "escalated") return "breach";
  const remaining = new Date(slaCase.dueAt).getTime() - now;
  const openedAt = typeof slaCase.policy.openedAt === "string" ? new Date(slaCase.policy.openedAt).getTime() : undefined;
  if (remaining <= 30 * 60_000) return "warning";
  if (openedAt && remaining <= Math.max(30 * 60_000, (new Date(slaCase.dueAt).getTime() - openedAt) * .2)) return "warning";
  return "normal";
}

function urgency(item: Fulfilment, slaCase: SlaCase | undefined, now: number): number {
  if (slaCase?.state === "escalated") return 0;
  if (slaCase?.state === "breached" || (slaCase && new Date(slaCase.dueAt).getTime() <= now)) return 1;
  if (slaCase && new Date(slaCase.dueAt).getTime() - now <= 30 * 60_000) return 2;
  if (item.actions.includes("accept") || item.actions.includes("reject")) return 3;
  if (item.actions.includes("ready")) return 4;
  if (item.actions.length > 0) return 5;
  return 6;
}

export function VendorDailyClient({ dashboard, advice, sla }: { dashboard: Dashboard; advice: Advice; sla: SlaWorkspace }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("orders");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const slaByFulfilment = useMemo(() => {
    const map = new Map<string, SlaCase>();
    for (const item of sla.cases) {
      if (item.state === "resolved") continue;
      const current = map.get(item.fulfilmentId);
      if (!current || new Date(item.dueAt).getTime() < new Date(current.dueAt).getTime()) map.set(item.fulfilmentId, item);
    }
    return map;
  }, [sla.cases]);

  const fulfilments = useMemo(
    () => [...dashboard.fulfilments].sort((a, b) => urgency(a, slaByFulfilment.get(a.id), now) - urgency(b, slaByFulfilment.get(b.id), now) || a.createdAt - b.createdAt),
    [dashboard.fulfilments, slaByFulfilment, now]
  );
  const openAsk = advice.counteroffers.filter((item) => !["closed", "expired", "accepted", "rejected"].includes(item.status));
  const unreadLike = advice.notifications.length + sla.metrics.unread;
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
        <p>{sla.metrics.escalated || sla.metrics.breached ? `${sla.metrics.escalated + sla.metrics.breached} παραγγελίες είναι εκτός συμφωνημένου SLA.` : "Παραγγελίες, Ask Local και παραλαβές χωρίς το πλήρες backoffice."}</p>
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
      <div className={styles.sectionHead}><div><span>Orders</span><h2>Παραγγελίες</h2></div><small>Ό,τι πλησιάζει ή ξεπερνά το SLA εμφανίζεται πρώτο.</small></div>
      {fulfilments.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν ενεργές παραγγελίες αυτή τη στιγμή.</div> : <div className={styles.cards}>
        {fulfilments.map((item) => {
          const slaCase = slaByFulfilment.get(item.id);
          const tone = slaCase ? slaTone(slaCase, now) : undefined;
          return <article className={`${styles.card} ${item.actions.length ? styles.actionCard : ""}`} key={item.id}>
            <div className={styles.cardTop}>
              <div><strong>{item.orderId}</strong><span>{date(item.createdAt)} · {item.mode === "pickup" ? "Παραλαβή" : item.mode}</span></div>
              <span className={styles.status}>{item.status}</span>
            </div>
            {slaCase && <div className={`${styles.slaStrip} ${tone === "breach" ? styles.slaBreach : tone === "warning" ? styles.slaWarning : ""}`}>
              <div><strong>{slaCase.stage === "acceptance" ? "SLA αποδοχής" : "SLA προετοιμασίας"}</strong><span>{slaCase.agreementCode ? `Συμφωνία ${slaCase.agreementCode}` : "Ενεργή συμφωνία vendor"}</span></div>
              <div className={styles.slaClock}><strong>{slaRemaining(slaCase, now)}</strong><span>έως {date(slaCase.dueAt)}</span></div>
            </div>}
            <div className={styles.lines}>{item.lines.map((line) => <div key={line.id}><strong>{line.quantity}×</strong><span>{line.title}</span></div>)}</div>
            <div className={styles.orderMeta}><span>Εμπορεύματα {item.merchandiseSubtotal}</span>{item.deliveryCharge && <span>Παράδοση {item.deliveryCharge}</span>}</div>
            {item.actions.length > 0 && <div className={styles.actions}>{item.actions.map((action) => <button key={action} type="button" className={action === "reject" ? styles.secondaryAction : styles.primaryAction} disabled={Boolean(busy)} onClick={() => void fulfilmentAction(item, action)}>{busy === `${item.id}:${action}` ? "Ενημέρωση…" : actionLabel[action] ?? action}</button>)}</div>}
          </article>;
        })}
      </div>}
    </section>}

    {tab === "ask" && <section className={styles.content}>
      <div className={styles.sectionHead}><div><span>Ask Local</span><h2>Αιτήματα πελατών</h2></div><small>Μόνο τα αιτήματα που έχουν ανατεθεί στο κατάστημά σου.</small></div>
      {openAsk.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν ανοιχτά Ask Local αιτήματα.</div> : <div className={styles.cards}>{openAsk.map((request) => <article className={styles.card} key={request.id}>
        <div className={styles.cardTop}><div><strong>{request.canonicalVariantId ?? "Γενικό αίτημα"}</strong><span>{requestNeed(request.need)}</span></div><span className={styles.status}>{request.status}</span></div>
      </article>)}</div>}
      <Link className={styles.fullWidthLink} href="/daily/ask-local">Άνοιγμα Ask Local & μηνυμάτων</Link>
    </section>}

    {tab === "alerts" && <section className={styles.content}>
      <div className={styles.sectionHead}><div><span>Alerts</span><h2>Πρόσφατες ειδοποιήσεις</h2></div><small>Λειτουργικές ενημερώσεις και SLA του καταστήματός σου.</small></div>
      {sla.notifications.length > 0 && <div className={styles.cards}>{sla.notifications.map((notification) => <article className={styles.alertCard} key={`sla-${notification.id}`}><strong>{notification.title}</strong><p>{notification.body}</p><small>{date(notification.createdAt)}</small></article>)}</div>}
      {advice.notifications.length > 0 && <div className={styles.cards} style={{ marginTop: sla.notifications.length ? 12 : 0 }}>{advice.notifications.map((notification) => <article className={styles.alertCard} key={notification.id}><strong>{notification.title}</strong><p>{notification.body}</p>{notification.createdAt && <small>{date(notification.createdAt)}</small>}</article>)}</div>}
      {sla.notifications.length === 0 && advice.notifications.length === 0 && <div className={styles.empty}>Δεν υπάρχουν πρόσφατες ειδοποιήσεις.</div>}
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
