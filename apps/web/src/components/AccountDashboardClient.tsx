"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Dashboard = {
  account: { userId: string; email: string };
  csrfToken: string;
  savedProducts: ReadonlyArray<{ canonicalVariantId: string; title?: string; price?: string; available?: boolean; unavailable?: boolean }>;
  savedSearches: ReadonlyArray<{ id: string; name: string; alertsEnabled: boolean; lastObservedCount: number }>;
  notifications: ReadonlyArray<{ id: string; title: string; body: string; group: string; readAt?: number; createdAt: number }>;
  unreadNotifications: number;
  recentlyViewed: ReadonlyArray<{ canonicalVariantId: string; title: string; price: string; viewedAt: number }>;
  preferences: { recommendationsEnabled: boolean; recentlyViewedEnabled: boolean };
  recommendations: ReadonlyArray<{ canonicalVariantId: string; title: string; price: string; explanation: string }>;
  privacyRequests: ReadonlyArray<{ id: string; type: string; status: string; submittedAt: number }>;
  retention: ReadonlyArray<{ category: string; retained: boolean; reason: string }>;
  orders: ReadonlyArray<{ id: string; status: string; total: string; createdAt: number; fulfilmentMode: string; lines: ReadonlyArray<{ id: string; title: string; quantity: number; status: string }> }>;
};

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function AccountDashboardClient({ initial }: { initial: Dashboard }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState("");

  async function refresh() {
    const response = await fetch("/api/account/session", { cache: "no-store" });
    if (response.ok) setData(await response.json() as Dashboard);
  }

  async function mutate(key: string, url: string, options: RequestInit = {}) {
    setBusy(key);
    try {
      const headers = new Headers(options.headers);
      headers.set("x-csrf-token", data.csrfToken);
      const response = await fetch(url, { ...options, method: options.method ?? "POST", headers });
      if (!response.ok) throw new Error("Η ενέργεια δεν ολοκληρώθηκε");
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    setBusy("logout");
    try {
      await fetch("/api/account/logout", { method: "POST", headers: { "x-csrf-token": data.csrfToken } });
      router.replace("/");
      router.refresh();
    } finally { setBusy(""); }
  }

  async function updatePreferences(patch: Partial<Dashboard["preferences"]>) {
    await mutate("preferences", "/api/account/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
  }

  return <>
    <section className="shell account-toolbar">
      <div><span className="eyebrow">Signed in</span><strong>{data.account.email}</strong></div>
      <button className="button button-secondary" type="button" onClick={logout} disabled={busy === "logout"}>Αποσύνδεση</button>
    </section>

    <section className="shell account-live-grid">
      <article className="account-live-card account-wide">
        <div className="account-card-head"><div><div className="eyebrow">Orders</div><h2>Παραγγελίες</h2></div><span className="count-pill">{data.orders.length}</span></div>
        {data.orders.length ? <div className="account-list">{data.orders.map((order) => <div className="order-row" key={order.id}><div><a href={`/account/orders/${order.id}`}><strong>{order.id}</strong></a><small>{date(order.createdAt)} · {order.fulfilmentMode}</small></div><div className="order-lines">{order.lines.map((line) => <span key={line.id}>{line.quantity}× {line.title}</span>)}</div><div className="order-total"><strong>{order.total}</strong><span>{order.status}</span></div></div>)}</div> : <div className="account-empty"><p>Δεν έχεις ακόμη παραγγελίες συνδεδεμένες με αυτόν τον λογαριασμό.</p><a href="/shop" className="text-link">Ξεκίνα από την αγορά →</a></div>}
      </article>

      <article className="account-live-card">
        <div className="account-card-head"><div><div className="eyebrow">Saved items</div><h2>Αποθηκευμένα</h2></div><span className="count-pill">{data.savedProducts.length}</span></div>
        {data.savedProducts.length ? <div className="mini-list">{data.savedProducts.map((product) => <div key={product.canonicalVariantId}><a href={`/product/${product.canonicalVariantId}`}><strong>{product.title ?? product.canonicalVariantId}</strong></a><span>{product.price ?? ""} · {product.available ? "διαθέσιμο" : "μη διαθέσιμο"}</span><button type="button" onClick={() => mutate(`remove-${product.canonicalVariantId}`, `/api/account/saved-products/${encodeURIComponent(product.canonicalVariantId)}`, { method: "DELETE" })}>Αφαίρεση</button></div>)}</div> : <p className="account-muted">Αποθήκευσε προϊόντα από τη σελίδα τους για να τα βρεις εδώ.</p>}
      </article>

      <article className="account-live-card">
        <div className="account-card-head"><div><div className="eyebrow">Notifications</div><h2>Ειδοποιήσεις</h2></div><span className="count-pill">{data.unreadNotifications} νέα</span></div>
        <div className="mini-list notification-list">{data.notifications.slice(0, 6).map((item) => <div key={item.id} className={item.readAt ? "is-read" : ""}><strong>{item.title}</strong><span>{item.body}</span><small>{date(item.createdAt)}</small></div>)}</div>
        {data.unreadNotifications > 0 && <button className="text-button" type="button" disabled={busy === "notifications"} onClick={() => mutate("notifications", "/api/account/notifications/read-all")}>Σήμανση όλων ως αναγνωσμένα</button>}
      </article>

      <article className="account-live-card">
        <div className="account-card-head"><div><div className="eyebrow">Saved searches</div><h2>Οι αναζητήσεις μου</h2></div><span className="count-pill">{data.savedSearches.length}</span></div>
        {data.savedSearches.length ? <div className="mini-list">{data.savedSearches.map((search) => <div key={search.id}><strong>{search.name}</strong><span>{search.lastObservedCount} τρέχοντα αποτελέσματα · alerts {search.alertsEnabled ? "on" : "off"}</span></div>)}</div> : <p className="account-muted">Κάνε μια αναζήτηση στο marketplace και πάτησε «Αποθήκευση αναζήτησης».</p>}
      </article>

      <article className="account-live-card">
        <div className="account-card-head"><div><div className="eyebrow">For you</div><h2>Προτάσεις</h2></div></div>
        {data.recommendations.length ? <div className="mini-list">{data.recommendations.map((item) => <div key={item.canonicalVariantId}><a href={`/product/${item.canonicalVariantId}`}><strong>{item.title}</strong></a><span>{item.price}</span><small>{item.explanation}</small></div>)}</div> : <p className="account-muted">Οι προτάσεις εμφανίζονται αφού αποθηκεύσεις ή δεις προϊόντα, και μόνο όταν το personalization είναι ενεργό.</p>}
      </article>

      <article className="account-live-card">
        <div className="account-card-head"><div><div className="eyebrow">Privacy controls</div><h2>Ιδιωτικότητα</h2></div></div>
        <label className="preference-row"><span><strong>Προσωποποιημένες προτάσεις</strong><small>Χρησιμοποιεί μόνο δικά σου saved/recent signals.</small></span><input type="checkbox" checked={data.preferences.recommendationsEnabled} onChange={(event) => void updatePreferences({ recommendationsEnabled: event.target.checked })} /></label>
        <label className="preference-row"><span><strong>Πρόσφατα προβεβλημένα</strong><small>Απενεργοποίηση διαγράφει το πρόσφατο ιστορικό.</small></span><input type="checkbox" checked={data.preferences.recentlyViewedEnabled} onChange={(event) => void updatePreferences({ recentlyViewedEnabled: event.target.checked })} /></label>
        <button className="button button-secondary privacy-button" type="button" disabled={busy === "privacy"} onClick={() => mutate("privacy", "/api/account/privacy/export")}>Αίτημα εξαγωγής δεδομένων</button>
        {data.privacyRequests.length > 0 && <small className="privacy-status">Τελευταίο αίτημα: {data.privacyRequests[0].status} · {date(data.privacyRequests[0].submittedAt)}</small>}
      </article>

      <article className="account-live-card account-wide">
        <div className="account-card-head"><div><div className="eyebrow">Recently viewed</div><h2>Πρόσφατα προϊόντα</h2></div><span className="count-pill">{data.recentlyViewed.length}</span></div>
        {data.recentlyViewed.length ? <div className="recent-grid">{data.recentlyViewed.slice(0, 8).map((item) => <a href={`/product/${item.canonicalVariantId}`} key={item.canonicalVariantId}><strong>{item.title}</strong><span>{item.price}</span><small>{date(item.viewedAt)}</small></a>)}</div> : <p className="account-muted">Δεν υπάρχει πρόσφατο ιστορικό ή η λειτουργία είναι απενεργοποιημένη.</p>}
      </article>
    </section>
  </>;
}
