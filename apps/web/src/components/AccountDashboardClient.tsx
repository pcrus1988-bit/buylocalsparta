"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CustomerActionCard, CustomerHowItWorks, CustomerLifecycle, customerOrderLifecycle } from "./CustomerAccountPrimitives";
import styles from "./CustomerAccountExperience.module.css";
import { productPublicPath } from "../lib/product-url";

type Dashboard = {
  account: { email: string };
  csrfToken: string;
  savedProducts: ReadonlyArray<{ canonicalVariantId: string; slug?: string; title?: string; price?: string; available?: boolean; unavailable?: boolean }>;
  savedSearches: ReadonlyArray<{ id: string; name: string; alertsEnabled: boolean; lastObservedCount: number }>;
  notifications: ReadonlyArray<{ id: string; title: string; body: string; group: string; readAt?: number; createdAt: number }>;
  unreadNotifications: number;
  recentlyViewed: ReadonlyArray<{ canonicalVariantId: string; slug?: string; title: string; price: string; viewedAt: number }>;
  preferences: { recommendationsEnabled: boolean; recentlyViewedEnabled: boolean };
  recommendations: ReadonlyArray<{ canonicalVariantId: string; slug?: string; title: string; price: string; explanation: string }>;
  privacyRequests: ReadonlyArray<{ id: string; type: string; status: string; submittedAt: number }>;
  retention: ReadonlyArray<{ category: string; retained: boolean; reason: string }>;
  orders: ReadonlyArray<{ id: string; referenceNumber: string; status: string; total: string; createdAt: number; fulfilmentMode: string; lines: ReadonlyArray<{ id: string; title: string; quantity: number; status: string }> }>;
};

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const completedOrder = (status: string) => /ολοκληρώ|παραλήφθηκε|ακυρ|επιστράφηκαν τα χρήματα/i.test(status);
const orderNeedsAction = (order: Dashboard["orders"][number]) => /αναμονή πληρωμής|χρειάζεται ενέργεια|έτοιμη για παραλαβή|πρόβλημα/i.test(order.status);
const orderAttentionBody = (status: string) => status.includes("Αναμονή πληρωμής")
  ? "Η παραγγελία έχει δημιουργηθεί, αλλά χρειάζεται να ολοκληρώσεις την ασφαλή πληρωμή πριν προχωρήσει στο κατάστημα."
  : status.includes("Έτοιμη για παραλαβή")
    ? "Η παραγγελία είναι έτοιμη. Άνοιξέ την για να δεις τον ασφαλή κωδικό ή QR παραλαβής."
    : "Η παραγγελία χρειάζεται έλεγχο ή ενέργεια από εσένα.";
const orderAttentionAction = (status: string) => status.includes("Αναμονή πληρωμής") ? "Συνέχιση πληρωμής" : "Άνοιγμα παραγγελίας";
const modeLabel = (mode: string) => mode === "pickup" ? "Παραλαβή από κατάστημα" : mode === "shipping" ? "Αποστολή" : mode === "local_delivery" ? "Τοπική παράδοση" : mode;

export function AccountDashboardClient({ initial }: { initial: Dashboard }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmHistoryClear, setConfirmHistoryClear] = useState(false);
  const [historyStatus, setHistoryStatus] = useState("");

  const activeOrders = useMemo(() => data.orders.filter((order) => !completedOrder(order.status)), [data.orders]);
  const attentionOrders = useMemo(() => activeOrders.filter(orderNeedsAction), [activeOrders]);
  const latestActiveOrder = activeOrders[0];
  const attentionCount = attentionOrders.length + (data.unreadNotifications > 0 ? 1 : 0);

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

  async function clearRecentHistory() {
    if (busy) return;
    setBusy("recent-history");
    setError("");
    setHistoryStatus("");
    try {
      const response = await fetch("/api/account/recently-viewed", { method: "DELETE", headers: { "x-csrf-token": data.csrfToken } });
      const payload = await response.json() as { removed?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατός ο καθαρισμός του ιστορικού.");
      setData((current) => ({ ...current, recentlyViewed: [] }));
      setConfirmHistoryClear(false);
      setHistoryStatus(payload.removed ? `Καθαρίστηκαν ${payload.removed} πρόσφατες προβολές. Η μελλοντική καταγραφή παραμένει ενεργή.` : "Το ιστορικό ήταν ήδη κενό. Η μελλοντική καταγραφή παραμένει όπως την έχεις ορίσει.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατός ο καθαρισμός του ιστορικού.");
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
    setHistoryStatus("");
    setConfirmHistoryClear(false);
    await mutate("preferences", "/api/account/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
  }

  return <div className={styles.dashboardRoot}>
    <section className="shell account-toolbar dashboard-toolbar-refined">
      <div className="account-identity"><span className="account-avatar" aria-hidden="true">{data.account.email.slice(0, 1).toUpperCase()}</span><span><small>Συνδεδεμένος ως</small><strong>{data.account.email}</strong></span></div>
      <button className="button button-secondary" type="button" onClick={logout} disabled={busy === "logout"}>Αποσύνδεση</button>
    </section>

    {error && <div className="shell account-action-error" role="alert"><strong>Η ενέργεια δεν ολοκληρώθηκε.</strong><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Κλείσιμο μηνύματος">×</button></div>}

    <section className={`shell ${styles.priorityGrid}`} aria-label="Βασικές ενέργειες πελάτη">
      <article className={`${styles.priorityCard} ${styles.trackerCard}`} id="order-tracking">
        <div className={styles.priorityHead}>
          <div>
            <span className={styles.priorityKicker}>Live order tracking</span>
            <h2>{latestActiveOrder ? latestActiveOrder.referenceNumber : "Οι παραγγελίες σου"}</h2>
          </div>
          {latestActiveOrder && <span className={styles.priorityStatus}>{latestActiveOrder.status}</span>}
        </div>
        {latestActiveOrder ? <>
          <div className={styles.orderMeta}>
            <span>{date(latestActiveOrder.createdAt)}</span>
            <span>{modeLabel(latestActiveOrder.fulfilmentMode)}</span>
            <strong>{latestActiveOrder.total}</strong>
          </div>
          <CustomerLifecycle label={`Ζωντανή πορεία ${latestActiveOrder.referenceNumber}`} stages={customerOrderLifecycle(latestActiveOrder.status, latestActiveOrder.fulfilmentMode)} />
          <div className={styles.priorityActions}>
            <Link className={styles.primaryPriorityAction} href={`/account/orders/${latestActiveOrder.id}`}>Παρακολούθηση παραγγελίας</Link>
            <Link className={styles.secondaryPriorityAction} href="/account/orders">Όλες οι παραγγελίες</Link>
          </div>
        </> : <div className={styles.emptyTracker}>
          <p>Μόλις κάνεις μια παραγγελία, η τρέχουσα κατάσταση και το επόμενο βήμα θα εμφανίζονται εδώ — χωρίς να χρειάζεται να ψάχνεις.</p>
          <div className={styles.priorityActions}><Link className={styles.primaryPriorityAction} href="/shop">Ανακάλυψε προϊόντα</Link></div>
        </div>}
      </article>

      <article className={`${styles.priorityCard} ${styles.askLocalCard}`} id="ask-local">
        <div>
          <span className={styles.priorityKicker}>Ask Local</span>
          <div className={styles.priorityHead}><h2>Δεν το βρίσκεις; Ζήτησέ το.</h2></div>
          <p className={styles.askLocalCopy}>Πες μας τι ψάχνεις. Το αίτημα δρομολογείται ιδιωτικά στην κατάλληλη τοπική επιχείρηση, ώστε να μη χρειάζεται να τηλεφωνείς ή να ψάχνεις παντού.</p>
        </div>
        <div className={styles.priorityActions}>
          <Link className={styles.primaryPriorityAction} href="/account/ask-local">Άνοιγμα Ask Local</Link>
          <Link className={styles.secondaryPriorityAction} href="/businesses">Τοπικές επιχειρήσεις</Link>
        </div>
      </article>
    </section>

    <section className="shell customer-overview-attention" id="overview" aria-labelledby="customer-attention-title">
      <div className="customer-overview-attention-head"><div><div className="eyebrow">Τώρα</div><h2 id="customer-attention-title">{attentionCount ? "Χρειάζεται κάτι από εσένα" : "Όλα κυλούν κανονικά"}</h2></div><p>{attentionCount ? "Εδώ εμφανίζονται μόνο όσα χρειάζονται δική σου ενέργεια. Τα υπόλοιπα συνεχίζουν από κατάστημα, πλατφόρμα ή μεταφορέα." : "Δεν υπάρχει κάποια ενέργεια που να περιμένει από εσένα αυτή τη στιγμή."}</p></div>
      <div className="customer-action-stack">
        {attentionOrders.slice(0, 3).map((order) => <CustomerActionCard key={order.id} tone="action" title={`${order.referenceNumber} · ${order.status}`} body={orderAttentionBody(order.status)} href={`/account/orders/${order.id}`} action={orderAttentionAction(order.status)} />)}
        {data.unreadNotifications > 0 && <CustomerActionCard tone="action" title={`${data.unreadNotifications} ${data.unreadNotifications === 1 ? "νέα ειδοποίηση" : "νέες ειδοποιήσεις"}`} body="Δες τι άλλαξε στις παραγγελίες, τα αιτήματα και τον λογαριασμό σου." href="/account/notifications" action="Δες ειδοποιήσεις" />}
        {attentionCount === 0 && <CustomerActionCard tone="success" title="Δεν χρειάζεται ενέργεια αυτή τη στιγμή" body="Θα σε ενημερώσουμε όταν αλλάξει κάτι ή όταν χρειάζεται απόφαση από εσένα." />}
      </div>
    </section>

    <section className="shell customer-kpi-links account-snapshot dashboard-kpis-refined" aria-label="Σύνοψη λογαριασμού">
      <Link className={attentionOrders.length ? "customer-kpi-link needs-attention" : "customer-kpi-link"} href="/account/orders"><span>Ενεργές παραγγελίες</span><strong>{activeOrders.length}</strong><small>{attentionOrders.length ? `${attentionOrders.length} χρειάζονται προσοχή` : "Καμία ενέργεια τώρα"}</small></Link>
      <Link className={data.unreadNotifications ? "customer-kpi-link needs-attention" : "customer-kpi-link"} href="/account/notifications"><span>Νέες ειδοποιήσεις</span><strong>{data.unreadNotifications}</strong><small>Όλες οι αλλαγές σε ένα σημείο</small></Link>
      <Link className="customer-kpi-link" href="/account/saved"><span>Wishlist</span><strong>{data.savedProducts.length}</strong><small>{data.savedSearches.length} αποθηκευμένες αναζητήσεις</small></Link>
      <Link className="customer-kpi-link" href="/account/profile"><span>Προφίλ & διευθύνσεις</span><strong>→</strong><small>Παράδοση, τιμολόγηση και στοιχεία</small></Link>
    </section>

    <section className="shell account-section-intro dashboard-section-heading" aria-labelledby="account-activity-title"><div><div className="eyebrow">Σε εξέλιξη</div><h2 id="account-activity-title">Οι αγορές και οι ενημερώσεις σου</h2></div><p>Τα σημαντικά μένουν ανοιχτά. Ιστορικό, προτιμήσεις και προτάσεις είναι διαθέσιμα πιο κάτω όταν τα χρειάζεσαι.</p></section>

    <section className="shell account-live-grid">
      <article className="account-live-card account-wide" id="orders">
        <div className="account-card-head"><div><div className="eyebrow">Αγορές</div><h2>Ενεργές παραγγελίες</h2></div><Link className="text-link" href="/account/orders">Όλες οι παραγγελίες →</Link></div>
        {activeOrders.length ? <div className="account-list">{activeOrders.slice(0, 3).map((order) => <div className="order-row" key={order.id}><div><Link href={`/account/orders/${order.id}`}><strong>{order.referenceNumber}</strong></Link><small>{date(order.createdAt)} · {modeLabel(order.fulfilmentMode)}</small></div><div className="order-lines">{order.lines.slice(0, 3).map((line) => <span key={line.id}>{line.quantity}× {line.title}</span>)}</div><div className="order-total"><strong>{order.total}</strong><span>{order.status}</span></div><div style={{ gridColumn: "1/-1" }}><CustomerLifecycle label={`Πορεία ${order.referenceNumber}`} stages={customerOrderLifecycle(order.status, order.fulfilmentMode)} /></div></div>)}</div> : <div className="account-empty"><p>Δεν υπάρχουν ενεργές παραγγελίες.</p><Link href="/shop" className="text-link">Ανακάλυψε προϊόντα →</Link></div>}
      </article>

      <article className="account-live-card" id="notifications">
        <div className="account-card-head"><div><div className="eyebrow">Ενημερώσεις</div><h2>Ειδοποιήσεις</h2></div><span className="count-pill">{data.unreadNotifications} νέα</span></div>
        {data.notifications.length ? <div className="mini-list notification-list">{data.notifications.slice(0, 4).map((item) => <div key={item.id} className={item.readAt ? "is-read" : ""}><strong>{item.title}</strong><span>{item.body}</span><small>{date(item.createdAt)}</small></div>)}</div> : <p className="account-muted">Δεν υπάρχουν ειδοποιήσεις.</p>}
        <div className="hero-actions"><Link className="text-link" href="/account/notifications">Κέντρο ειδοποιήσεων →</Link>{data.unreadNotifications > 0 && <button className="text-button" type="button" disabled={busy === "notifications"} onClick={() => void mutate("notifications", "/api/account/notifications/read-all")}>Όλα ως αναγνωσμένα</button>}</div>
      </article>

      <article className="account-live-card" id="saved">
        <div className="account-card-head"><div><div className="eyebrow">Για αργότερα</div><h2>Wishlist</h2></div><span className="count-pill">{data.savedProducts.length}</span></div>
        {data.savedProducts.length ? <div className="mini-list">{data.savedProducts.slice(0, 4).map((product) => <div key={product.canonicalVariantId}><Link href={productPublicPath({ id: product.canonicalVariantId, slug: product.slug })}><strong>{product.title ?? product.canonicalVariantId}</strong></Link><span>{product.price ?? ""} · {product.available ? "διαθέσιμο" : "μη διαθέσιμο"}</span><button type="button" onClick={() => void mutate(`remove-${product.canonicalVariantId}`, `/api/account/saved-products/${encodeURIComponent(product.canonicalVariantId)}`, { method: "DELETE" })}>Αφαίρεση</button></div>)}</div> : <p className="account-muted">Δεν έχεις αποθηκεύσει προϊόντα.</p>}
        <Link className="text-link" href="/account/saved">Διαχείριση wishlist →</Link>
      </article>

      <details className={styles.secondaryDetails}>
        <summary className={styles.secondarySummary}><div><span>Περισσότερα</span><strong>Ιστορικό, προτιμήσεις & προτάσεις</strong></div></summary>
        <div className={styles.secondaryContent}>
          <article className="account-live-card" id="searches">
            <div className="account-card-head"><div><div className="eyebrow">Αναζήτηση</div><h2>Αποθηκευμένες αναζητήσεις</h2></div><span className="count-pill">{data.savedSearches.length}</span></div>
            {data.savedSearches.length ? <div className="mini-list">{data.savedSearches.slice(0, 4).map((search) => <div key={search.id}><strong>{search.name}</strong><span>{search.lastObservedCount} αποτελέσματα · ειδοποιήσεις {search.alertsEnabled ? "ενεργές" : "ανενεργές"}</span></div>)}</div> : <p className="account-muted">Δεν έχεις αποθηκευμένες αναζητήσεις.</p>}
          </article>

          <article className="account-live-card" id="privacy">
            <div className="account-card-head"><div><div className="eyebrow">Έλεγχος</div><h2>Ιδιωτικότητα</h2></div><Link className="text-link" href="/account/privacy">Κέντρο ιδιωτικότητας →</Link></div>
            <label className="preference-row"><span><strong>Προσωποποιημένες προτάσεις</strong><small>Χρήση μόνο δικών σου σημάτων ενδιαφέροντος.</small></span><input type="checkbox" checked={data.preferences.recommendationsEnabled} onChange={(event) => void updatePreferences({ recommendationsEnabled: event.target.checked })} /></label>
            <label className="preference-row"><span><strong>Πρόσφατα προβεβλημένα</strong><small>Η απενεργοποίηση σταματά τη μελλοντική καταγραφή και καθαρίζει το σχετικό ιστορικό.</small></span><input type="checkbox" checked={data.preferences.recentlyViewedEnabled} onChange={(event) => void updatePreferences({ recentlyViewedEnabled: event.target.checked })} /></label>
            <p className="customer-history-privacy-note">Θέλεις να κρατήσεις τη λειτουργία ενεργή αλλά να διαγράψεις μόνο όσα έχουν ήδη καταγραφεί; Χρησιμοποίησε τον καθαρισμό ιστορικού στα «Πρόσφατα προϊόντα».</p>
            {data.privacyRequests.length > 0 && <small className="privacy-status">Τελευταίο αίτημα: {data.privacyRequests[0].status} · {date(data.privacyRequests[0].submittedAt)}</small>}
          </article>

          <article className="account-live-card" id="recommendations">
            <div className="account-card-head"><div><div className="eyebrow">Για εσένα</div><h2>Προτάσεις</h2></div></div>
            {data.recommendations.length ? <div className="mini-list">{data.recommendations.slice(0, 4).map((item) => <div key={item.canonicalVariantId}><Link href={productPublicPath({ id: item.canonicalVariantId, slug: item.slug })}><strong>{item.title}</strong></Link><span>{item.price}</span><small>{item.explanation}</small></div>)}</div> : <p className="account-muted">Οι προτάσεις εμφανίζονται όταν η προσωποποίηση είναι ενεργή.</p>}
          </article>

          <article className="account-live-card account-wide" id="recent">
            <div className="account-card-head customer-history-card-head"><div><div className="eyebrow">Ιστορικό</div><h2>Πρόσφατα προϊόντα</h2></div><div className="customer-history-head-actions"><span className="count-pill">{data.recentlyViewed.length}</span>{data.recentlyViewed.length > 0 && !confirmHistoryClear && <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => { setConfirmHistoryClear(true); setHistoryStatus(""); }}>Καθαρισμός ιστορικού</button>}</div></div>
            {confirmHistoryClear && <div className="customer-history-confirm" role="group" aria-label="Επιβεβαίωση καθαρισμού ιστορικού"><span>Να διαγραφούν όλες οι πρόσφατες προβολές; Η λειτουργία θα παραμείνει {data.preferences.recentlyViewedEnabled ? "ενεργή" : "ανενεργή"}.</span><div><button className="button" type="button" disabled={Boolean(busy)} onClick={() => void clearRecentHistory()}>{busy === "recent-history" ? "Καθαρισμός…" : "Ναι, καθαρισμός"}</button><button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => setConfirmHistoryClear(false)}>Άκυρο</button></div></div>}
            {historyStatus && <p className="customer-history-status" role="status">{historyStatus}</p>}
            {data.recentlyViewed.length ? <div className="recent-grid">{data.recentlyViewed.slice(0, 8).map((item) => <Link href={productPublicPath({ id: item.canonicalVariantId, slug: item.slug })} key={item.canonicalVariantId}><strong>{item.title}</strong><span>{item.price}</span><small>{date(item.viewedAt)}</small></Link>)}</div> : <p className="account-muted">{data.preferences.recentlyViewedEnabled ? "Δεν υπάρχει πρόσφατο ιστορικό. Νέες προβολές μπορούν να καταγραφούν ξανά όσο η λειτουργία παραμένει ενεργή." : "Η καταγραφή πρόσφατων προβολών είναι απενεργοποιημένη."}</p>}
            <CustomerHowItWorks title="Καθαρισμός ή απενεργοποίηση;"><p><strong>Καθαρισμός ιστορικού:</strong> διαγράφει μόνο τις προβολές που έχουν ήδη αποθηκευτεί και δεν αλλάζει την επιλογή σου για μελλοντική καταγραφή. <strong>Απενεργοποίηση:</strong> καθαρίζει το ιστορικό και σταματά την καταγραφή νέων προβολών μέχρι να την ενεργοποιήσεις ξανά.</p></CustomerHowItWorks>
          </article>
        </div>
      </details>
    </section>

    <section className={`shell account-live-card account-wide ${styles.helpCard}`} aria-label="Βοήθεια λογαριασμού">
      <div className="account-card-head"><div><div className="eyebrow">Χρειάζεσαι εξήγηση;</div><h2>Οδηγοί για τις βασικές ροές</h2></div></div>
      <div className="hero-actions"><Link className="text-link" href="/returns-refunds">Επιστροφές & επιστροφή χρημάτων →</Link><Link className="text-link" href="/delivery-pickup">Παράδοση & παραλαβή →</Link><Link className="text-link" href="/privacy-controls">Έλεγχοι ιδιωτικότητας →</Link><Link className="text-link" href="/ask-local">Δημόσια σελίδα Ask Local →</Link></div>
    </section>
  </div>;
}
