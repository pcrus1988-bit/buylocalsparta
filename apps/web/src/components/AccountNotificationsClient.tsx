"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { customerNotificationDestination } from "../lib/customer-notification-destination";
import { CustomerHowItWorks } from "./CustomerAccountPrimitives";

type NotificationItem = Readonly<{
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  title: string;
  body: string;
  group: string;
  readAt?: number;
  createdAt: number;
}>;
type Filter = "all" | "unread" | "orders" | "advice" | "returns" | "account" | "saved";
const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const filters: readonly Readonly<{ key: Filter; label: string }>[] = [
  { key: "all", label: "Όλες" },
  { key: "unread", label: "Νέες" },
  { key: "orders", label: "Παραγγελίες" },
  { key: "advice", label: "Ask Local" },
  { key: "returns", label: "Επιστροφές" },
  { key: "account", label: "Λογαριασμός & υποστήριξη" },
  { key: "saved", label: "Αποθηκευμένα" }
];

function matchesFilter(item: NotificationItem, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return !item.readAt;
  const eventType = item.eventType.toLowerCase();
  if (filter === "orders") return ["orders", "delivery"].includes(item.group) || /^(order|payment|fulfilment|pickup|shipment)\./.test(eventType);
  if (filter === "advice") return item.group === "advice" || /^(counteroffer|ask_local)\./.test(eventType);
  if (filter === "returns") return item.group === "returns" || /^return\./.test(eventType);
  if (filter === "saved") return item.group === "saved" || /^(saved_product|saved_search)\./.test(eventType);
  return item.group === "account" || /^(account|security|auth|privacy|customer_support)\./.test(eventType);
}

export function AccountNotificationsClient({ initial, csrfToken }: { initial: readonly NotificationItem[]; csrfToken: string }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const visible = useMemo(() => items.filter((item) => matchesFilter(item, filter)), [items, filter]);

  async function markAllRead() {
    if (!unread || busy) return;
    setBusy("all");
    setError("");
    try {
      const response = await fetch("/api/account/notifications/read-all", { method: "POST", headers: { "x-csrf-token": csrfToken } });
      if (!response.ok) throw new Error("Δεν ήταν δυνατή η ενημέρωση των ειδοποιήσεων.");
      const now = Date.now();
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt: now }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η ενημέρωση των ειδοποιήσεων.");
    } finally {
      setBusy("");
    }
  }

  async function updateItem(item: NotificationItem, action: "read" | "archive") {
    if (busy) return;
    setBusy(`${action}:${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/account/notifications/${encodeURIComponent(item.id)}/${action}`, { method: "POST", headers: { "x-csrf-token": csrfToken } });
      if (!response.ok) throw new Error(action === "archive" ? "Η ειδοποίηση δεν αρχειοθετήθηκε." : "Η ειδοποίηση δεν ενημερώθηκε.");
      if (action === "archive") setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      else {
        const now = Date.now();
        setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, readAt: candidate.readAt ?? now } : candidate));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια δεν ολοκληρώθηκε.");
    } finally {
      setBusy("");
    }
  }

  return <section className="shell customer-account-page">
    <div className="customer-page-heading"><div><div className="eyebrow">Ενημερώσεις</div><h1>Ειδοποιήσεις</h1></div><div><strong>{unread} νέες</strong>{unread > 0 && <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void markAllRead()}>{busy === "all" ? "Ενημέρωση…" : "Όλα ως αναγνωσμένα"}</button>}</div></div>
    <CustomerHowItWorks><p>Οι ειδοποιήσεις συγκεντρώνουν αλλαγές από παραγγελίες, Ask Local, επιστροφές και τον λογαριασμό σου. Μπορείς να φιλτράρεις τις ενημερώσεις, να σημειώσεις μία ως αναγνωσμένη ή να την αρχειοθετήσεις όταν δεν τη χρειάζεσαι πια. Οι διαθέσιμες ενέργειες προκύπτουν από το ασφαλές πλαίσιο της ειδοποίησης, όχι από το κείμενό της.</p></CustomerHowItWorks>
    <div className="customer-filter-tabs customer-notification-filters" aria-label="Φίλτρα ειδοποιήσεων">{filters.map((item) => <button type="button" className={filter === item.key ? "is-active" : undefined} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)} key={item.key}>{item.label}</button>)}</div>
    {error && <p className="account-action-error" role="alert">{error}</p>}
    <div className="customer-account-panel" style={{marginTop:14}}>
      {visible.length ? <div className="customer-notification-list">{visible.map((item) => {
        const action = customerNotificationDestination({ eventType: item.eventType, group: item.group, payload: item.payload });
        return <article className={`customer-notification-item${item.readAt ? " is-read" : ""}`} key={item.id}>
          <span className="customer-notification-dot" aria-hidden="true" />
          <div className="customer-notification-copy"><strong>{item.title}</strong><span>{item.body}</span><small>{date(item.createdAt)}{item.readAt ? " · διαβάστηκε" : " · νέο"}</small></div>
          <div className="customer-notification-actions">
            {action && <Link className={action.priority === "primary" ? "button" : "text-link"} href={action.href}>{action.label}{action.priority === "secondary" ? " →" : ""}</Link>}
            {!item.readAt && <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void updateItem(item, "read")}>{busy === `read:${item.id}` ? "Ενημέρωση…" : "Αναγνωσμένο"}</button>}
            <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => void updateItem(item, "archive")}>{busy === `archive:${item.id}` ? "Αρχειοθέτηση…" : "Αρχειοθέτηση"}</button>
          </div>
        </article>;
      })}</div> : <div className="account-empty"><h2>{items.length ? "Δεν υπάρχουν ειδοποιήσεις σε αυτό το φίλτρο." : "Δεν υπάρχουν ειδοποιήσεις."}</h2><p>{items.length ? "Δοκίμασε άλλη κατηγορία ή επέστρεψε στην προβολή όλων." : "Όταν αλλάξει κάτι σημαντικό, θα εμφανιστεί εδώ."}</p></div>}
    </div>
  </section>;
}