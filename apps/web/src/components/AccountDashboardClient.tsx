"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccountSectionNavigation } from "./AccountSectionNavigation";
import { WorkspaceQuickLinks } from "./WorkspaceQuickLinks";
import { productPublicPath } from "../lib/product-url";

type Dashboard = {
  account: { userId: string; email: string };
  csrfToken: string;
  savedProducts: ReadonlyArray<{ canonicalVariantId: string; slug?: string; title?: string; price?: string; available?: boolean; unavailable?: boolean }>;
  savedSearches: ReadonlyArray<{ id: string; name: string; alertsEnabled: boolean; lastObservedCount: number }>;
  notifications: ReadonlyArray<{ id: string; title: string; body: string; group: string; readAt?: number; createdAt: number }>;
  unreadNotifications: number;
  recentlyViewed: ReadonlyArray<{ canonicalVariantId: string; slug: string; title: string; price: string; viewedAt: number }>;
  preferences: { recommendationsEnabled: boolean; recentlyViewedEnabled: boolean };
  recommendations: ReadonlyArray<{ canonicalVariantId: string; slug: string; title: string; price: string; explanation: string }>;
  privacyRequests: ReadonlyArray<{ id: string; type: string; status: string; submittedAt: number }>;
  retention: ReadonlyArray<{ category: string; retained: boolean; reason: string }>;
  orders: ReadonlyArray<{ id: string; referenceNumber: string; status: string; total: string; createdAt: number; fulfilmentMode: string; lines: ReadonlyArray<{ id: string; title: string; quantity: number; status: string }> }>;
};

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function AccountDashboardClient({ initial }: { initial: Dashboard }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/account/session", { cache: "no-store" });
    if (response.ok) setData(await response.json() as Dashboard);
  }

  async function mutate(key: string, url: string, options: RequestInit = {}) {
    setBusy(key);
    setError("");
    try {
      const headers = new Headers(options.headers);
      headers.set("x-csrf-token", data.csrfToken);
      const response = await fetch(url, { ...options, method: options.method ?? "POST", headers });
      if (!response.ok) throw new Error("Η ενέργεια δεν ολοκληρώθηκε");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια δεν ολοκληρώθηκε");
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
    } finally {
      setBusy("");
    }
  }

  async function updatePreferences(patch: Partial<Dashboard["preferences"]>) {
    await mutate("preferences", "/api/account/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
  }

  return <>
    <section className="shell account-toolbar dashboard-toolbar-refined">
      <div className="account-identity"><span className="account-avatar" aria-hidden="true">{data.account.email.slice(0, 1).toUpperCase()}</span><span><small>Συνδεδεμένος ως</small><strong>{data.account.email}</strong></span></div>
      <button className="button button-secondary" type="button" onClick={logout} disabled={busy === "logout"}>Αποσύνδεση</button>
    </section>

    <AccountSectionNavigation />

    {error && <div className="shell account-action-error" role="alert"><strong>Η ενέργεια δεν ολοκληρώθηκε.</strong><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Κλείσιμο μηνύματος">×</button></div>}

    <section className="shell account-snapshot dashboard-kpis-refined" id="overview" aria-label="Σύνοψη λογαριασμού">
      <div><span>Παραγγελίες</span><strong>{data.orders.length}</strong></div>
      <div className={data.unreadNotifications ? "needs-attention" : undefined}><span>Νέες ειδοποιήσεις</span><strong>{data.unreadNotifications}</strong></div>
      <div><span>Αποθηκευμένα</span><strong>{data.savedProducts.length}</strong></div>
      <div><span>Αναζητήσεις</span><strong>{data.savedSearches.length}</strong></div>
    </section>

    <WorkspaceQuickLinks
      density="compact"
      eyebrow="Γρήγορες διαδρομές"
      title="Συνέχισε άμεσα."
      links={[
        { kicker: "Αγορά", label: "Ask Local", description: "Ιδιωτικό αίτημα σε τοπικό κατάστημα.", href: "/ask-local" },
        { kicker: "Υποστήριξη", label: "Επιστροφές", description: "Διαδικασία και διαθέσιμες λύσεις.", href: "/returns-refunds" },
        { kicker: "Παραγγελία", label: "Παράδοση", description: "Pickup, local delivery και shipping.", href: "/delivery-pickup" },
        { kicker: "Έλεγχος", label: "Ιδιωτικότητα", description: "Ρυθμίσεις και εξαγωγή δεδομένων.", href: "/privacy-controls" }
      ]}
    />

    <section className="shell account-section-intro dashboard-section-heading" aria-labelledby="account-activity-title"><div><div className="eyebrow">Δραστηριότητα</div><h2 id="account-activity-title">Ο λογαριασμός σου</h2></div><p>Αγορές, αποθηκευμένα και ρυθμίσεις.</p></section>

    <section className="shell account-live-grid">
      <article className="account-live-card account-wide account-callout" id="ask-local">
        <div className="account-card-head"><div><div className="eyebrow">Ask Local</div><h2>Ιδιωτικά αιτήματα</h2></div><Link className="text-link" href="/ask-local">Άνοιγμα →</Link></div>
        <p className="account-muted">Ζήτησε συμβουλή ή προσφορά από τοπικό κατάστημα.</p>
      </article>

      <article className="account-live-card account-wide" id="orders">
        <div className="account-card-head"><div><div className="eyebrow">Αγορές</div><h2>Παραγγελίες</h2></div><span className="count-pill">{data.orders.length}</span></div>
        {data.orders.length ? <div className="account-list">{data.orders.map((order) => <div className="order-row" key={order.id}><div><Link href={`/account/orders/${order.id}`}><strong>{order.referenceNumber}</strong></Link><small>{date(order.createdAt)} · {order.fulfilmentMode}</small></div><div className="order-lines">{order.lines.map((line) => <span key={line.id}>{line.quantity}× {line.title}</span>)}</div><div className="order-total"><strong>{order.total}</strong><span>{order.status}</span></div></div>)}</div> : <div className="account-empty"><p>Δεν υπάρχουν ακόμη παραγγελίες.</p><Link href="/shop" className="text-link">Ανακάλυψε προϊόντα →</Link></div>}
      </article>

      <article className="account-live-card" id="saved">
        <div className="account-card-head"><div><div className="eyebrow">Για αργότερα</div><h2>Αποθηκευμένα</h2></div><span className="count-pill">{data.savedProducts.length}</span></div>
        {data.savedProducts.length ? <div className="mini-list">{data.savedProducts.map((product) => <div key={product.canonicalVariantId}><Link href={productPublicPath({ id: product.canonicalVariantId, slug: product.slug })}><strong>{product.title ?? product.canonicalVariantId}</strong></Link><span>{product.price ?? ""} · {product.available ? "διαθέσιμο" : "μη διαθέσιμο"}</span><button type="button" onClick={() => void mutate(`remove-${product.canonicalVariantId}`, `/api/account/saved-products/${encodeURIComponent(product.canonicalVariantId)}`, { method: "DELETE" })}>Αφαίρεση</button></div>)}</div> : <p className="account-muted">Δεν έχεις αποθηκεύσει προϊόντα.</p>}
      </article>

      <article className="account-live-card" id="notifications">
        <div className="account-card-head"><div><div className="eyebrow">Updates</div><h2>Ειδοποιήσεις</h2></div><span className="count-pill">{data.unreadNotifications} νέα</span></div>
        {data.notifications.length ? <div className="mini-list notification-list">{data.notifications.slice(0, 6).map((item) => <div key={item.id} className={item.readAt ? "is-read" : ""}><strong>{item.title}</strong><span>{item.body}</span><small>{date(item.createdAt)}</small></div>)}</div> : <p className="account-muted">Δεν υπάρχουν ειδοποιήσεις.</p>}
        {data.unreadNotifications > 0 && <button className="text-button" type="button" disabled={busy === "notifications"} onClick={() => void mutate("notifications", "/api/account/notifications/read-all")}>Όλα ως αναγνωσμένα</button>}
      </article>

      <article className="account-live-card" id="searches">
        <div className="account-card-head"><div><div className="eyebrow">Discovery</div><h2>Αναζητήσεις</h2></div><span className="count-pill">{data.savedSearches.length}</span></div>
        {data.savedSearches.length ? <div className="mini-list">{data.savedSearches.map((search) => <div key={search.id}><strong>{search.name}</strong><span>{search.lastObservedCount} αποτελέσματα · alerts {search.alertsEnabled ? "on" : "off"}</span></div>)}</div> : <p className="account-muted">Δεν έχεις αποθηκευμένες αναζητήσεις.</p>}
      </article>

      <article className="account-live-card" id="recommendations">
        <div className="account-card-head"><div><div className="eyebrow">Για εσένα</div><h2>Προτάσεις</h2></div></div>
        {data.recommendations.length ? <div className="mini-list">{data.recommendations.map((item) => <div key={item.canonicalVariantId}><Link href={productPublicPath({ id: item.canonicalVariantId, slug: item.slug })}><strong>{item.title}</strong></Link><span>{item.price}</span><small>{item.explanation}</small></div>)}</div> : <p className="account-muted">Οι προτάσεις εμφανίζονται όταν η προσωποποίηση είναι ενεργή.</p>}
      </article>

      <article className="account-live-card" id="privacy">
        <div className="account-card-head"><div><div className="eyebrow">Ρυθμίσεις</div><h2>Ιδιωτικότητα</h2></div></div>
        <label className="preference-row"><span><strong>Προσωποποιημένες προτάσεις</strong><small>Χρήση μόνο δικών σου signals.</small></span><input type="checkbox" checked={data.preferences.recommendationsEnabled} onChange={(event) => void updatePreferences({ recommendationsEnabled: event.target.checked })} /></label>
        <label className="preference-row"><span><strong>Πρόσφατα προβεβλημένα</strong><small>Απενεργοποίηση καθαρίζει το ιστορικό.</small></span><input type="checkbox" checked={data.preferences.recentlyViewedEnabled} onChange={(event) => void updatePreferences({ recentlyViewedEnabled: event.target.checked })} /></label>
        <button className="button button-secondary privacy-button" type="button" disabled={busy === "privacy"} onClick={() => void mutate("privacy", "/api/account/privacy/export")}>Εξαγωγή δεδομένων</button>
        {data.privacyRequests.length > 0 && <small className="privacy-status">Τελευταίο αίτημα: {data.privacyRequests[0].status} · {date(data.privacyRequests[0].submittedAt)}</small>}
        <Link className="text-link privacy-guide-link" href="/privacy-controls">Περισσότερα →</Link>
      </article>

      <article className="account-live-card account-wide" id="recent">
        <div className="account-card-head"><div><div className="eyebrow">Ιστορικό</div><h2>Πρόσφατα προϊόντα</h2></div><span className="count-pill">{data.recentlyViewed.length}</span></div>
        {data.recentlyViewed.length ? <div className="recent-grid">{data.recentlyViewed.slice(0, 8).map((item) => <Link href={productPublicPath({ id: item.canonicalVariantId, slug: item.slug })} key={item.canonicalVariantId}><strong>{item.title}</strong><span>{item.price}</span><small>{date(item.viewedAt)}</small></Link>)}</div> : <p className="account-muted">Δεν υπάρχει πρόσφατο ιστορικό.</p>}
      </article>
    </section>
  </>;
}
