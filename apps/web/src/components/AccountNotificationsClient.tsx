"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CustomerHowItWorks } from "./CustomerAccountPrimitives";

type NotificationItem = Readonly<{ id: string; title: string; body: string; group: string; payload?: Record<string, unknown>; readAt?: number; createdAt: number }>;
type Filter = "all" | "unread" | "orders" | "ask-local" | "returns" | "account";
const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function destination(item: NotificationItem): { href: string; label: string } | undefined {
  const orderId = typeof item.payload?.orderId === "string" ? item.payload.orderId : undefined;
  if (orderId) return { href: `/account/orders/${encodeURIComponent(orderId)}`, label: "Άνοιγμα παραγγελίας" };
  const text = `${item.title} ${item.body} ${item.group}`.toLocaleLowerCase("el-GR");
  if (text.includes("ask local") || text.includes("ιδιωτικ") || item.group === "advice") return { href: "/account/ask-local", label: "Άνοιγμα Ask Local" };
  if (text.includes("επιστροφ") || text.includes("refund") || item.group === "returns") return { href: "/account/orders?view=completed", label: "Δες παραγγελίες & επιστροφές" };
  if (text.includes("παραγγελ") || text.includes("pickup") || text.includes("παραλαβ") || item.group === "orders" || item.group === "delivery") return { href: "/account/orders", label: "Δες παραγγελίες" };
  if (text.includes("privacy") || text.includes("δεδομέν") || item.group === "account") return { href: "/account/privacy", label: "Κέντρο ιδιωτικότητας" };
  if (item.group === "saved") return { href: "/account/saved", label: "Δες αποθηκευμένα" };
  return undefined;
}

function matchesFilter(item: NotificationItem, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return !item.readAt;
  if (filter === "orders") return item.group === "orders" || item.group === "delivery";
  if (filter === "ask-local") return item.group === "advice" || `${item.title} ${item.body}`.toLocaleLowerCase("el-GR").includes("ask local");
  if (filter === "returns") return item.group === "returns";
  return item.group === "account";
}

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "all", label: "Όλες" },
  { id: "unread", label: "Νέες" },
  { id: "orders", label: "Παραγγελίες" },
  { id: "ask-local", label: "Ask Local" },
  { id: "returns", label: "Επιστροφές" },
  { id: "account", label: "Λογαριασμός" }
];

export function AccountNotificationsClient({ initial, csrfToken }: { initial: readonly NotificationItem[]; csrfToken: string }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const visible = useMemo(() => items.filter((item) => matchesFilter(item, filter)), [items, filter]);

  async function markAllRead() {
    if (!unread || busy) return;
    setBusy("all-read");
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/account/notifications/read-all", { method: "POST", headers: { "x-csrf-token": csrfToken } });
      if (!response.ok) throw new Error("Δεν ήταν δυνατή η ενημέρωση των ειδοποιήσεων.");
      const now = Date.now();
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt: now }));
      setStatus("Όλες οι ειδοποιήσεις σημειώθηκαν ως αναγνωσμένες.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η ενημέρωση των ειδοποιήσεων.");
    } finally {
      setBusy("");
    }
  }

  async function notificationAction(item: NotificationItem, action: "read" | "archive") {
    const key = `${action}:${item.id}`;
    setBusy(key);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/account/notifications/${encodeURIComponent(item.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατή η ενημέρωση της ειδοποίησης.");
      if (action === "archive") {
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        setStatus("Η ειδοποίηση αρχειοθετήθηκε.");
      } else {
        const now = Date.now();
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: entry.readAt ?? now } : entry));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η ενημέρωση της ειδοποίησης.");
    } finally {
      setBusy("");
    }
  }

  return <section className="shell customer-account-page">
    <div className="customer-page-heading"><div><div className="eyebrow">Ενημερώσεις</div><h1>Ειδοποιήσεις</h1></div><div><strong>{unread} νέες</strong>{unread > 0 && <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void markAllRead()}>{busy === "all-read" ? "Ενημέρωση…" : "Όλα ως αναγνωσμένα"}</button>}</div></div>
    <CustomerHowItWorks><p>Οι ειδοποιήσεις συγκεντρώνουν αλλαγές από παραγγελίες, Ask Local, επιστροφές και τον λογαριασμό σου. Μπορείς να σημειώσεις μία ενημέρωση ως διαβασμένη ή να την αρχειοθετήσεις όταν δεν τη χρειάζεσαι πλέον.</p></CustomerHowItWorks>
    <div className="customer-filter-tabs customer-notification-filters" role="group" aria-label="Φίλτρα ειδοποιήσεων">{FILTERS.map((entry) => <button type="button" key={entry.id} className={filter === entry.id ? "is-active" : undefined} onClick={() => setFilter(entry.id)}>{entry.label}</button>)}</div>
    {error && <p className="account-action-error" role="alert">{error}</p>}
    {status && <p className="privacy-status" role="status">{status}</p>}
    <div className="customer-account-panel" style={{marginTop:14}}>
      {visible.length ? <div className="customer-notification-list">{visible.map((item) => {
        const action = destination(item);
        return <article className={`customer-notification-item${item.readAt ? " is-read" : ""}`} key={item.id}>
          <span className="customer-notification-dot" aria-hidden="true" />
          <div className="customer-notification-copy"><strong>{item.title}</strong><span>{item.body}</span><small>{date(item.createdAt)}{item.readAt ? " · διαβάστηκε" : " · νέο"}</small><div className="customer-notification-actions">{!item.readAt && <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void notificationAction(item, "read")}>{busy === `read:${item.id}` ? "Ενημέρωση…" : "Ως διαβασμένο"}</button>}<button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void notificationAction(item, "archive")}>{busy === `archive:${item.id}` ? "Αρχειοθέτηση…" : "Αρχειοθέτηση"}</button></div></div>
          {action && <Link className="text-link" href={action.href}>{action.label} →</Link>}
        </article>;
      })}</div> : <div className="account-empty"><h2>{items.length ? "Δεν υπάρχουν ειδοποιήσεις σε αυτό το φίλτρο." : "Δεν υπάρχουν ειδοποιήσεις."}</h2><p>{items.length ? "Διάλεξε διαφορετική κατηγορία για να δεις τις υπόλοιπες ενημερώσεις." : "Όταν αλλάξει κάτι σημαντικό, θα εμφανιστεί εδώ."}</p></div>}
    </div>
  </section>;
}
