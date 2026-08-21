"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CustomerHowItWorks } from "./CustomerAccountPrimitives";

type NotificationItem = Readonly<{ id: string; title: string; body: string; group: string; readAt?: number; createdAt: number }>;
const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function destination(item: NotificationItem): { href: string; label: string } | undefined {
  const text = `${item.title} ${item.body} ${item.group}`.toLocaleLowerCase("el-GR");
  if (text.includes("ask local") || text.includes("ιδιωτικ")) return { href: "/account/ask-local", label: "Άνοιγμα Ask Local" };
  if (text.includes("επιστροφ") || text.includes("refund")) return { href: "/account/orders?view=completed", label: "Δες παραγγελίες & επιστροφές" };
  if (text.includes("παραγγελ") || text.includes("pickup") || text.includes("παραλαβ")) return { href: "/account/orders", label: "Δες παραγγελίες" };
  if (text.includes("privacy") || text.includes("δεδομέν")) return { href: "/account/privacy", label: "Κέντρο ιδιωτικότητας" };
  return undefined;
}

export function AccountNotificationsClient({ initial, csrfToken }: { initial: readonly NotificationItem[]; csrfToken: string }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  async function markAllRead() {
    if (!unread || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/notifications/read-all", { method: "POST", headers: { "x-csrf-token": csrfToken } });
      if (!response.ok) throw new Error("Δεν ήταν δυνατή η ενημέρωση των ειδοποιήσεων.");
      const now = Date.now();
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt: now }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η ενημέρωση των ειδοποιήσεων.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="shell customer-account-page">
    <div className="customer-page-heading"><div><div className="eyebrow">Ενημερώσεις</div><h1>Ειδοποιήσεις</h1></div><div><strong>{unread} νέες</strong>{unread > 0 && <button className="text-button" type="button" disabled={busy} onClick={() => void markAllRead()}>{busy ? "Ενημέρωση…" : "Όλα ως αναγνωσμένα"}</button>}</div></div>
    <CustomerHowItWorks><p>Οι ειδοποιήσεις συγκεντρώνουν αλλαγές από παραγγελίες, Ask Local, επιστροφές και τον λογαριασμό σου. Όπου υπάρχει σαφής επόμενη διαδρομή, εμφανίζεται απευθείας σύνδεσμος.</p></CustomerHowItWorks>
    {error && <p className="account-action-error" role="alert">{error}</p>}
    <div className="customer-account-panel" style={{marginTop:14}}>
      {items.length ? <div className="customer-notification-list">{items.map((item) => {
        const action = destination(item);
        return <article className={`customer-notification-item${item.readAt ? " is-read" : ""}`} key={item.id}>
          <span className="customer-notification-dot" aria-hidden="true" />
          <div className="customer-notification-copy"><strong>{item.title}</strong><span>{item.body}</span><small>{date(item.createdAt)}{item.readAt ? " · διαβάστηκε" : " · νέο"}</small></div>
          {action && <Link className="text-link" href={action.href}>{action.label} →</Link>}
        </article>;
      })}</div> : <div className="account-empty"><h2>Δεν υπάρχουν ειδοποιήσεις.</h2><p>Όταν αλλάξει κάτι σημαντικό, θα εμφανιστεί εδώ.</p></div>}
    </div>
  </section>;
}
