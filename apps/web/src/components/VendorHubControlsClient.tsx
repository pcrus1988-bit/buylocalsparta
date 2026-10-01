"use client";

import { useMemo, useState } from "react";
import {
  WorkspaceEmptyState,
  WorkspaceHowItWorks,
  WorkspaceMetricStrip,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge
} from "./WorkspacePagePrimitives";
import type { VendorHubControlsWorkspace, VendorHubSeoSource } from "../lib/vendor-hub-controls-service";

const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));

function dateTimeLocal(ms: number) {
  const date = new Date(ms);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function planPrice(plan: VendorHubControlsWorkspace["subscription"]["plans"][number]) {
  if (plan.monthlyPriceMinor !== undefined) return `${euro(plan.monthlyPriceMinor)} / μήνα`;
  if (plan.annualPriceMinor !== undefined) return `${euro(plan.annualPriceMinor)} / έτος`;
  if (plan.termPriceMinor !== undefined) return `${euro(plan.termPriceMinor)} / ${plan.termMonths ?? "—"} μήνες`;
  return "Χωρίς σταθερή συνδρομή";
}

export type VendorHubControlSection = "delivery" | "seo" | "promotions" | "aade" | "subscription";

export function VendorHubControlsClient({ initial, sections }: { initial: VendorHubControlsWorkspace; sections?: readonly VendorHubControlSection[] }) {
  const [workspace, setWorkspace] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const visibleSections = useMemo(() => new Set<VendorHubControlSection>(sections ?? ["delivery", "seo", "promotions", "aade", "subscription"]), [sections]);
  const show = (section: VendorHubControlSection) => visibleSections.has(section);

  const [deliveryActive, setDeliveryActive] = useState(initial.localDelivery.active);
  const [deliveryPrefixes, setDeliveryPrefixes] = useState(initial.localDelivery.postcodePrefixes.join(", "));

  const [seo, setSeo] = useState<Record<"el" | "en", VendorHubSeoSource>>({
    el: { ...initial.seo.el },
    en: { ...initial.seo.en }
  });

  const [promotion, setPromotion] = useState({
    offerId: initial.promotions.offers[0]?.offerId ?? "",
    name: "",
    price: "",
    startsAt: dateTimeLocal(Date.now() + 60 * 60 * 1000),
    endsAt: dateTimeLocal(Date.now() + 25 * 60 * 60 * 1000),
    reason: ""
  });

  const [aade, setAade] = useState({
    documentId: initial.aade.documents[0]?.id ?? "",
    action: "review",
    note: ""
  });

  const [subscription, setSubscription] = useState({
    planCode: initial.subscription.plans[0]?.code ?? "",
    note: ""
  });

  const pendingPromotion = workspace.promotions.requests.filter((item) => item.status === "pending").length;
  const pendingAade = workspace.aade.requests.filter((item) => item.status === "pending").length;
  const pendingSubscription = workspace.subscription.requests.filter((item) => item.status === "pending").length;

  const selectedOffer = useMemo(
    () => workspace.promotions.offers.find((item) => item.offerId === promotion.offerId),
    [workspace.promotions.offers, promotion.offerId]
  );

  async function call(key: string, url: string, method: "POST" | "PUT", body: unknown, done: string) {
    setBusy(key);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json", "x-csrf-token": workspace.csrfToken },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as VendorHubControlsWorkspace & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αλλαγή δεν αποθηκεύτηκε.");
      setWorkspace(payload);
      setSuccess(done);
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αλλαγή δεν αποθηκεύτηκε.");
      return undefined;
    } finally {
      setBusy("");
    }
  }

  function updateSeo(locale: "el" | "en", field: keyof Omit<VendorHubSeoSource, "locale">, value: string) {
    setSeo((current) => ({ ...current, [locale]: { ...current[locale], [field]: value } }));
  }

  async function saveSeo(locale: "el" | "en") {
    const value = seo[locale];
    const payload = await call(`seo:${locale}`, "/api/vendor/hub/seo", "PUT", value, locale === "el" ? "Τα ελληνικά στοιχεία εμφάνισης αποθηκεύτηκαν." : "Τα αγγλικά στοιχεία εμφάνισης αποθηκεύτηκαν.");
    if (payload) setSeo((current) => ({ ...current, [locale]: { ...payload.seo[locale] } }));
  }

  async function submitPromotion() {
    const price = Number(promotion.price.replace(",", "."));
    if (!Number.isFinite(price)) {
      setError("Συμπλήρωσε έγκυρη τιμή προσφοράς.");
      return;
    }
    const payload = await call("promotion", "/api/vendor/hub/promotions", "POST", {
      offerId: promotion.offerId,
      name: promotion.name,
      promotionalPriceMinor: Math.round(price * 100),
      startsAt: new Date(promotion.startsAt).toISOString(),
      endsAt: new Date(promotion.endsAt).toISOString(),
      reason: promotion.reason
    }, "Το αίτημα προσφοράς καταχωρίστηκε για έλεγχο.");
    if (payload) setPromotion((current) => ({ ...current, name: "", price: "", reason: "" }));
  }

  async function submitAade() {
    const payload = await call("aade", "/api/vendor/hub/aade", "POST", aade, "Το αίτημα AADE καταχωρίστηκε.");
    if (payload) setAade((current) => ({ ...current, note: "" }));
  }

  async function submitSubscription() {
    const payload = await call("subscription", "/api/vendor/hub/subscription", "POST", subscription, "Το αίτημα αλλαγής πλάνου καταχωρίστηκε.");
    if (payload) setSubscription((current) => ({ ...current, note: "" }));
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert"><strong>Δεν αποθηκεύτηκε.</strong> {error}</div>}
    {success && <div className="shell workspace-page-callout is-positive" role="status"><strong>Ολοκληρώθηκε.</strong> {success}</div>}

    {!sections && <section className="shell vendor-section">
      <WorkspaceMetricStrip items={[
        { label: "HUB", value: workspace.hubId ?? workspace.marketId },
        { label: "Τοπική παράδοση", value: workspace.localDelivery.active ? "Ενεργή" : "Ανενεργή", tone: workspace.localDelivery.active ? "positive" : "default" },
        { label: "Αιτήματα προσφορών", value: pendingPromotion, tone: pendingPromotion ? "attention" : "default" },
        { label: "AADE σε αναμονή", value: pendingAade, tone: pendingAade ? "attention" : "default" },
        { label: "Αλλαγή πλάνου", value: pendingSubscription, tone: pendingSubscription ? "attention" : "default" }
      ]} />
    </section>}

    {show("delivery") && <section className="shell vendor-section" id="local-delivery">
      <WorkspaceSectionHeading eyebrow="Παραδόσεις" title="Περιοχή τοπικής παράδοσης" note="Η ρύθμιση είναι δική σου και υπερισχύει της γενικής κάλυψης HUB για το κατάστημά σου. Η τιμολόγηση μεταφοράς παραμένει στους κανόνες του HUB." />
      <WorkspaceHowItWorks>
        <p><strong>Ταχυδρομικοί κώδικες:</strong> βάλε ολόκληρο ΤΚ ή πρόθεμα, π.χ. 24100 ή 241.</p>
        <p><strong>Απενεργοποίηση:</strong> σταματά τη δική σου ζώνη τοπικής παράδοσης χωρίς να διαγράφει τη ρύθμιση.</p>
        <p><strong>Ολοκλήρωση αγοράς:</strong> η κάλυψη συνδυάζεται με τη δυνατότητα παράδοσης που έχεις ορίσει για κάθε προϊόν στον κατάλογο.</p>
      </WorkspaceHowItWorks>
      <div className="workspace-tool-panel" style={{ padding: "1rem" }}>
        <label className="workspace-form-field">
          <span>Κάλυψη ΤΚ / προθέματα</span>
          <input value={deliveryPrefixes} onChange={(event) => setDeliveryPrefixes(event.target.value)} placeholder="24100, 241, 24200" />
        </label>
        <label className="workspace-form-field">
          <span>Κατάσταση</span>
          <select value={deliveryActive ? "active" : "inactive"} onChange={(event) => setDeliveryActive(event.target.value === "active")}>
            <option value="active">Ενεργή τοπική παράδοση</option>
            <option value="inactive">Ανενεργή</option>
          </select>
        </label>
        <div className="workspace-form-actions">
          <button className="button" type="button" disabled={Boolean(busy)} onClick={() => void call("delivery", "/api/vendor/hub/local-delivery", "PUT", {
            active: deliveryActive,
            postcodePrefixes: deliveryPrefixes.split(",").map((item) => item.trim()).filter(Boolean)
          }, "Η κάλυψη τοπικής παράδοσης ενημερώθηκε.")}>{busy === "delivery" ? "Αποθήκευση…" : "Αποθήκευση κάλυψης"}</button>
        </div>
      </div>
    </section>}

    {show("seo") && <section className="vendor-section section-tint" id="seo"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Αναζήτηση" title="Πώς παρουσιάζεται το κατάστημά σου στη Google" note="Εσύ γράφεις τα κείμενα της επιχείρησής σου. Το ΚΟΝΤΑ ΜΟΥ διαχειρίζεται τις τεχνικές ρυθμίσεις και την ευρετηρίαση." />
      {(["el","en"] as const).map((locale) => <details className="workspace-tool-panel" open={locale === "el"} key={locale}>
        <summary><span><strong>{locale === "el" ? "Ελληνικά" : "Αγγλικά"}</strong><small>Κείμενα προφίλ και αναζήτησης</small></span></summary>
        <div className="workspace-tool-body">
          <div className="workspace-form-field"><label htmlFor={`short-${locale}`}>Σύντομη περιγραφή</label><textarea id={`short-${locale}`} value={seo[locale].shortDescription} onChange={(event) => updateSeo(locale, "shortDescription", event.target.value)} /></div>
          <div className="workspace-form-field"><label htmlFor={`story-${locale}`}>Ιστορία / παρουσίαση</label><textarea id={`story-${locale}`} value={seo[locale].story} onChange={(event) => updateSeo(locale, "story", event.target.value)} /></div>
          <div className="workspace-form-field"><label htmlFor={`expertise-${locale}`}>Εξειδίκευση</label><textarea id={`expertise-${locale}`} value={seo[locale].expertise} onChange={(event) => updateSeo(locale, "expertise", event.target.value)} /></div>
          <div className="workspace-form-field"><label htmlFor={`seo-title-${locale}`}>Τίτλος για Google</label><input id={`seo-title-${locale}`} value={seo[locale].seoTitle} onChange={(event) => updateSeo(locale, "seoTitle", event.target.value)} /></div>
          <div className="workspace-form-field"><label htmlFor={`seo-description-${locale}`}>Περιγραφή για Google</label><textarea id={`seo-description-${locale}`} value={seo[locale].seoDescription} onChange={(event) => updateSeo(locale, "seoDescription", event.target.value)} /></div>
          <div className="workspace-form-actions"><button className="button" type="button" disabled={Boolean(busy)} onClick={() => void saveSeo(locale)}>{busy === `seo:${locale}` ? "Αποθήκευση…" : "Αποθήκευση"}</button></div>
        </div>
      </details>)}
    </div></section>}

    {show("promotions") && <section className="shell vendor-section" id="promotions">
      <WorkspaceSectionHeading eyebrow="Προσφορές" title="Προσφορές & εκπτώσεις" note="Δηλώνεις τη δική σου εμπορική πρόταση. Η τελική δημόσια προωθητική τιμή ενεργοποιείται μόνο αφού περάσει τους ελέγχους της πλατφόρμας και τους νομικούς ελέγχους τιμής." />
      <WorkspaceHowItWorks>
        <p><strong>Δεν αλλάζει άμεσα η δημόσια τιμή.</strong> Το αίτημα κρατά καταγραφή της τρέχουσας τιμής και περνά έλεγχο πριν εφαρμοστεί.</p>
        <p><strong>Ιστορικό τιμών:</strong> παραμένει κεντρικό ώστε οι ανακοινώσεις έκπτωσης να είναι ελέγξιμες.</p>
      </WorkspaceHowItWorks>
      {workspace.promotions.offers.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ενεργές προσφορές προϊόντων." body="Μόλις υπάρχουν εγκεκριμένα προϊόντα, θα μπορείς να προτείνεις προώθηση." /> : <div className="workspace-tool-panel" style={{ padding: "1rem" }}>
        <label className="workspace-form-field"><span>Προϊόν</span><select value={promotion.offerId} onChange={(event) => setPromotion((current) => ({ ...current, offerId: event.target.value }))}>{workspace.promotions.offers.map((offer) => <option key={offer.offerId} value={offer.offerId}>{offer.title} · {euro(offer.priceMinor)}</option>)}</select></label>
        {selectedOffer && <p className="workspace-page-muted">Τρέχουσα τιμή: <strong>{euro(selectedOffer.priceMinor)}</strong></p>}
        <label className="workspace-form-field"><span>Όνομα προώθησης</span><input value={promotion.name} onChange={(event) => setPromotion((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="workspace-form-field"><span>Προτεινόμενη τιμή (€)</span><input type="number" min="0" step="0.01" value={promotion.price} onChange={(event) => setPromotion((current) => ({ ...current, price: event.target.value }))} /></label>
        <label className="workspace-form-field"><span>Έναρξη</span><input type="datetime-local" value={promotion.startsAt} onChange={(event) => setPromotion((current) => ({ ...current, startsAt: event.target.value }))} /></label>
        <label className="workspace-form-field"><span>Λήξη</span><input type="datetime-local" value={promotion.endsAt} onChange={(event) => setPromotion((current) => ({ ...current, endsAt: event.target.value }))} /></label>
        <label className="workspace-form-field"><span>Λόγος / σημείωση</span><textarea value={promotion.reason} onChange={(event) => setPromotion((current) => ({ ...current, reason: event.target.value }))} /></label>
        <div className="workspace-form-actions"><button className="button" type="button" disabled={Boolean(busy)} onClick={() => void submitPromotion()}>{busy === "promotion" ? "Υποβολή…" : "Υποβολή προώθησης"}</button></div>
      </div>}
      {workspace.promotions.requests.length > 0 && <div className="workspace-queue-list">{workspace.promotions.requests.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.name}</strong><small>{item.title} · {when(item.createdAt)}</small></div><WorkspaceStatusBadge status={item.status} /></div>
        <div className="workspace-queue-primary"><span>{euro(item.currentPriceMinor)} → {euro(item.promotionalPriceMinor)}</span><span>{when(item.startsAt)} — {when(item.endsAt)}</span></div>
        {item.reviewNote && <p className="workspace-queue-summary">{item.reviewNote}</p>}
      </article>)}</div>}
    </section>}

    {show("aade") && <section className="vendor-section section-tint" id="aade"><div className="shell">
      <WorkspaceSectionHeading eyebrow="AADE" title="myDATA & φορολογικά αιτήματα" note="Βλέπεις μόνο τα φορολογικά έγγραφα της επιχείρησής σου. Επανάληψη ή συμφωνία δεν εκτελείται αυτόματα: το αίτημα μπαίνει στην ασφαλή φορολογική ροή." />
      {workspace.aade.documents.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν φορολογικά έγγραφα του καταστήματος." body="Όταν δημιουργηθούν σχετικά παραστατικά, η κατάσταση AADE θα εμφανίζεται εδώ." /> : <>
        <div className="workspace-tool-panel" style={{ padding: "1rem" }}>
          <label className="workspace-form-field"><span>Παραστατικό</span><select value={aade.documentId} onChange={(event) => setAade((current) => ({ ...current, documentId: event.target.value }))}>{workspace.aade.documents.map((document) => <option value={document.id} key={document.id}>{document.documentNumber ?? document.id} · {document.transmissionStatus} · {euro(document.grossMinor)}</option>)}</select></label>
          <label className="workspace-form-field"><span>Ενέργεια</span><select value={aade.action} onChange={(event) => setAade((current) => ({ ...current, action: event.target.value }))}><option value="review">Έλεγχος</option><option value="reconcile">Συμφωνία με AADE</option><option value="retry">Ασφαλής επανάληψη μετά από έλεγχο</option></select></label>
          <label className="workspace-form-field"><span>Σημείωση</span><textarea value={aade.note} onChange={(event) => setAade((current) => ({ ...current, note: event.target.value }))} /></label>
          <div className="workspace-form-actions"><button className="button" type="button" disabled={Boolean(busy)} onClick={() => void submitAade()}>{busy === "aade" ? "Υποβολή…" : "Υποβολή αιτήματος"}</button></div>
        </div>
        <div className="workspace-queue-list">{workspace.aade.documents.slice(0, 20).map((document) => <article className="workspace-queue-card" key={document.id}>
          <div className="workspace-queue-head"><div><strong>{document.documentNumber ?? document.id}</strong><small>{document.type} · {when(document.createdAt)}</small></div><WorkspaceStatusBadge status={document.transmissionStatus} /></div>
          <div className="workspace-queue-primary"><span>{euro(document.grossMinor)}</span>{document.aadeMark && <span>MARK {document.aadeMark}</span>}{document.qrUrl && <a href={document.qrUrl} target="_blank" rel="noreferrer">AADE QR ↗</a>}</div>
          {document.lastError && <p className="workspace-queue-summary">{document.lastError}</p>}
        </article>)}</div>
      </>}
      {workspace.aade.requests.length > 0 && <details className="workspace-tool-panel"><summary><span><strong>Ιστορικό αιτημάτων AADE</strong><small>{workspace.aade.requests.length} εγγραφές</small></span></summary><div className="workspace-tool-body workspace-compact-list">{workspace.aade.requests.map((item) => <div className="workspace-compact-row" key={item.id}><strong>{item.action} · {item.documentId}</strong><WorkspaceStatusBadge status={item.status} /><small>{when(item.createdAt)}{item.resolutionNote ? ` · ${item.resolutionNote}` : ""}</small></div>)}</div></details>}
    </div></section>}

    {show("subscription") && <section className="shell vendor-section" id="subscription">
      <WorkspaceSectionHeading eyebrow="Πλάνο" title="Πλάνο συνεργασίας" note="Η επιλογή πλάνου γίνεται από εσένα, αλλά αλλαγές που επηρεάζουν εμπορική συμφωνία ή χρέωση ενεργοποιούνται μόνο μετά τον συμβατικό έλεγχο." />
      {workspace.subscription.current ? <WorkspaceMetricStrip items={[
        { label: "Τρέχον πλάνο", value: workspace.subscription.current.planName },
        { label: "Κατάσταση", value: workspace.subscription.current.status },
        { label: "Έναρξη", value: when(workspace.subscription.current.startsAt) }
      ]} /> : <WorkspaceEmptyState title="Δεν υπάρχει ενεργή συνδρομή στο HUB." body="Μπορείς να ζητήσεις διαθέσιμο πλάνο μόλις έχει ρυθμιστεί για το συγκεκριμένο HUB." />}
      {workspace.subscription.plans.length > 0 && <div className="workspace-tool-panel" style={{ padding: "1rem" }}>
        <label className="workspace-form-field"><span>Νέο πλάνο</span><select value={subscription.planCode} onChange={(event) => setSubscription((current) => ({ ...current, planCode: event.target.value }))}>{workspace.subscription.plans.map((plan) => <option value={plan.code} key={plan.code}>{plan.name} · {planPrice(plan)} · {(plan.salesFeeBps / 100).toFixed(2)}% προμήθεια</option>)}</select></label>
        <label className="workspace-form-field"><span>Σημείωση</span><textarea value={subscription.note} onChange={(event) => setSubscription((current) => ({ ...current, note: event.target.value }))} /></label>
        <div className="workspace-form-actions"><button className="button" type="button" disabled={Boolean(busy) || !subscription.planCode || pendingSubscription > 0} onClick={() => void submitSubscription()}>{pendingSubscription > 0 ? "Υπάρχει αίτημα σε αναμονή" : busy === "subscription" ? "Υποβολή…" : "Αίτημα αλλαγής πλάνου"}</button></div>
      </div>}
      {workspace.subscription.requests.length > 0 && <div className="workspace-queue-list">{workspace.subscription.requests.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.planName}</strong><small>{when(item.createdAt)}</small></div><WorkspaceStatusBadge status={item.status} /></div>
        {item.note && <p className="workspace-queue-summary">{item.note}</p>}
        {item.resolutionNote && <p className="workspace-queue-summary"><strong>Απάντηση:</strong> {item.resolutionNote}</p>}
      </article>)}</div>}
    </section>}
  </>;
}
