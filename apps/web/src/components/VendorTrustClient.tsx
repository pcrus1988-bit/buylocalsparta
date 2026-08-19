"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Workspace = {
  csrfToken: string;
  mediaUploadMode: "direct" | "development_memory" | "gated";
  products: readonly { id: string; title: string }[];
  assets: readonly { id: string; canonicalVariantId?: string; filename: string; kind: string; byteSize: number; scanStatus: string; rightsStatus: string; moderationStatus: string; rejectionReason?: string; createdAt: number }[];
  documents: readonly { id: string; canonicalVariantId: string; type: string; issuer?: string; identifier?: string; mediaAssetId?: string; status: string; validTo?: number; rejectionReason?: string; createdAt: number }[];
};

const STATUS_LABELS: Record<string, string> = {
  clean: "ΟΚ",
  approved: "Εγκεκριμένο",
  verified: "Επαληθευμένο",
  pending: "Σε αναμονή",
  pending_review: "Σε αναμονή ελέγχου",
  queued: "Σε αναμονή",
  scanning: "Έλεγχος σε εξέλιξη",
  submitted: "Υποβλήθηκε",
  uploaded: "Ανέβηκε",
  declared: "Δηλώθηκε",
  rejected: "Απορρίφθηκε",
  blocked: "Μπλοκαρισμένο",
  failed: "Αποτυχία ελέγχου",
  expired: "Έληξε",
  draft: "Πρόχειρο",
  quarantined: "Σε απομόνωση"
};

function statusLabel(value: string) {
  return STATUS_LABELS[value] ?? value.replaceAll("_", " ");
}

function mediaKindLabel(kind: string) {
  if (kind === "image") return "Φωτογραφία";
  if (kind === "video") return "Βίντεο";
  if (kind === "document") return "Έγγραφο PDF";
  return kind;
}

function mediaIsRejected(asset: Workspace["assets"][number]) {
  return Boolean(asset.rejectionReason) || [asset.scanStatus, asset.rightsStatus, asset.moderationStatus].includes("rejected");
}

function mediaIsApproved(asset: Workspace["assets"][number]) {
  return asset.scanStatus === "clean" && asset.rightsStatus === "approved" && asset.moderationStatus === "approved";
}

function mediaOverallStatus(asset: Workspace["assets"][number]) {
  if (mediaIsRejected(asset)) return "Χρειάζεται διόρθωση";
  if (mediaIsApproved(asset)) return "Εγκεκριμένο";
  return "Σε έλεγχο";
}

export function VendorTrustClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mediaRejected = initial.assets.filter(mediaIsRejected).length;
  const mediaPending = initial.assets.filter((asset) => !mediaIsRejected(asset) && !mediaIsApproved(asset)).length;
  const docsPending = initial.documents.filter((document) => !["verified", "approved", "rejected", "expired"].includes(document.status)).length;
  const docsVerified = initial.documents.filter((document) => ["verified", "approved"].includes(document.status)).length;
  const docsNeedCorrection = initial.documents.filter((document) => ["rejected", "expired"].includes(document.status)).length;
  const pendingSubmissions = mediaPending + docsPending;
  const needsCorrection = mediaRejected + docsNeedCorrection;
  const hasProducts = initial.products.length > 0;

  function productTitle(id?: string) {
    if (!id) return "Χωρίς αντιστοίχιση προϊόντος";
    return initial.products.find((product) => product.id === id)?.title ?? "Προϊόν";
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      if (initial.mediaUploadMode === "gated") throw new Error("Το ανέβασμα αρχείων είναι προσωρινά απενεργοποιημένο από την πλατφόρμα. Δεν χρειάζεται να κάνεις κάποια ρύθμιση στο κατάστημά σου.");
      if (initial.mediaUploadMode === "development_memory") {
        const response = await fetch("/api/vendor/media", { method: "POST", headers: { "x-csrf-token": initial.csrfToken }, body: form });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        router.refresh();
        return;
      }
      const file = form.get("file");
      if (!(file instanceof File) || file.size <= 0) throw new Error("Επίλεξε ένα αρχείο για ανέβασμα.");
      const intentResponse = await fetch("/api/vendor/media/intents", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify({ canonicalVariantId: form.get("canonicalVariantId"), kind: form.get("kind"), filename: file.name, contentType: file.type, byteSize: file.size, altText: form.get("altText"), rightsOwner: form.get("rightsOwner") }) });
      const intent = await intentResponse.json();
      if (!intentResponse.ok) throw new Error(intent.error);
      if (file.size > Number(intent.maxBytes)) throw new Error("Το αρχείο είναι μεγαλύτερο από το επιτρεπόμενο όριο.");
      const put = await fetch(String(intent.uploadUrl), { method: "PUT", headers: intent.headers as Record<string, string>, body: file });
      if (!put.ok) throw new Error("Η αποστολή του αρχείου απέτυχε. Δοκίμασε ξανά.");
      const complete = await fetch("/api/vendor/media/complete", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify({ intentId: intent.intentId }) });
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.error);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Το ανέβασμα απέτυχε.");
    } finally { setBusy(false); }
  }

  async function compliance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/vendor/compliance", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify({ canonicalVariantId: form.get("product"), type: form.get("type"), issuer: form.get("issuer"), identifier: form.get("identifier"), mediaAssetId: form.get("asset") || undefined }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αποστολή του εγγράφου απέτυχε.");
    } finally { setBusy(false); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Αρχεία που έχεις στείλει", value: initial.assets.length },
      { label: "Υποβολές σε έλεγχο", value: pendingSubmissions, tone: pendingSubmissions ? "attention" : "default" },
      { label: "Χρειάζονται διόρθωση", value: needsCorrection, tone: needsCorrection ? "attention" : "default" },
      { label: "Εγκεκριμένα έγγραφα", value: docsVerified, tone: docsVerified ? "positive" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Πώς λειτουργεί" title="Τι κάνεις σε αυτή τη σελίδα" note="Χρησιμοποίησέ την όταν θέλεις να δώσεις στην πλατφόρμα υλικό ή έγγραφα που αποδεικνύουν ότι ένα προϊόν μπορεί να παρουσιαστεί σωστά και με ασφάλεια." />
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>1. Φωτογραφίες, βίντεο και PDF</strong><small>Για την παρουσίαση ή τεκμηρίωση ενός προϊόντος.</small></div></div>
          <p className="workspace-queue-summary">Διάλεξε το προϊόν, τον τύπο αρχείου και δήλωσε ποιος σου δίνει το δικαίωμα να το χρησιμοποιήσεις. Μετά το ανέβασμα, η πλατφόρμα κάνει τους απαραίτητους ελέγχους πριν το αρχείο χρησιμοποιηθεί δημόσια.</p>
        </article>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>2. Πιστοποιητικά και δηλώσεις</strong><small>Μόνο όταν υπάρχει σχετικό έγγραφο ή ζητείται για το προϊόν.</small></div></div>
          <p className="workspace-queue-summary">Για ένα πιστοποιητικό, ανέβασε πρώτα το PDF ως αρχείο και έπειτα καταχώρισε εδώ τον τύπο του εγγράφου, τον εκδότη και — αν υπάρχει — τον αριθμό του. Σύνδεσε το PDF ώστε να μπορεί να επαληθευτεί.</p>
        </article>
      </div>
      <div className="workspace-inline-note"><strong>Δεν χρειάζεται να ανεβάζεις πιστοποιητικό για κάθε προϊόν.</strong> Αν δεν υπάρχει σχετικό έγγραφο και η πλατφόρμα δεν σου έχει ζητήσει κάτι, δεν κάνεις καμία ενέργεια σε αυτό το μέρος.</div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Νέα υποβολή" title="Στείλε υλικό ή έγγραφο για έλεγχο" note="Τα δύο βήματα είναι ξεχωριστά. Για ένα πιστοποιητικό σε PDF: πρώτα ανέβασε το PDF αριστερά και μετά καταχώρισέ το ως έγγραφο δεξιά." />
      {!hasProducts && <WorkspaceEmptyState eyebrow="Πρώτα ο κατάλογος" title="Δεν υπάρχουν ακόμη προϊόντα διαθέσιμα για τεκμηρίωση." body="Πρόσθεσε ή αντιστοίχισε πρώτα τα προϊόντα σου στον κατάλογο. Μετά θα εμφανίζονται εδώ για επιλογή." />}
      {hasProducts && <div className="workspace-dual-grid">
        <details className="workspace-tool-panel" open>
          <summary><span><strong>1. Ανέβασε αρχείο</strong><small>{initial.mediaUploadMode === "gated" ? "Προσωρινά μη διαθέσιμο" : "Έτοιμο για ανέβασμα"}</small></span></summary>
          <div className="workspace-tool-body">
            {initial.mediaUploadMode === "gated" && <div className="workspace-inline-note">Η ασφαλής αποστολή αρχείων είναι προσωρινά απενεργοποιημένη από την πλατφόρμα. Δεν χρειάζεται να αλλάξεις κάποια ρύθμιση στο κατάστημά σου.</div>}
            <form onSubmit={upload}>
              <div className="workspace-form-grid">
                <div className="workspace-form-field span-2"><label htmlFor="trust-product">Προϊόν</label><select id="trust-product" name="canonicalVariantId" required>{initial.products.map((product) => <option value={product.id} key={product.id}>{product.title}</option>)}</select><small>Το αρχείο θα συνδεθεί με αυτό το προϊόν.</small></div>
                <div className="workspace-form-field"><label htmlFor="trust-kind">Τύπος αρχείου</label><select id="trust-kind" name="kind" required><option value="image">Φωτογραφία</option><option value="video">Βίντεο</option><option value="document">Έγγραφο PDF</option></select></div>
                <div className="workspace-form-field"><label htmlFor="trust-rights">Ποιος έχει τα δικαιώματα χρήσης;</label><input id="trust-rights" name="rightsOwner" placeholder="π.χ. Το κατάστημά μου / Κατασκευαστής" required /><small>Αν είναι δική σου φωτογραφία, γράψε «Το κατάστημά μου». Αν την έδωσε κατασκευαστής ή προμηθευτής, γράψε το όνομά του.</small></div>
                <div className="workspace-form-field span-2"><label htmlFor="trust-alt">Σύντομη περιγραφή εικόνας <span aria-hidden="true">·</span> προαιρετικό</label><input id="trust-alt" name="altText" placeholder="π.χ. Μπλε σχολική τσάντα, μπροστινή όψη" /><small>Χρησιμοποιείται για προσβασιμότητα και βοηθά να καταλαβαίνουμε τι δείχνει η εικόνα.</small></div>
                <div className="workspace-form-field span-2"><label htmlFor="trust-file">Επίλεξε αρχείο</label><input id="trust-file" name="file" type="file" required /></div>
              </div>
              <div className="workspace-form-actions"><button className="button" disabled={busy || initial.mediaUploadMode === "gated"}>{busy ? "Ανέβασμα…" : "Ανέβασμα για έλεγχο"}</button></div>
            </form>
          </div>
        </details>

        <details className="workspace-tool-panel" open>
          <summary><span><strong>2. Καταχώρισε πιστοποιητικό / έγγραφο</strong><small>Μόνο αν υπάρχει ή σου έχει ζητηθεί.</small></span></summary>
          <div className="workspace-tool-body"><form onSubmit={compliance}>
            <div className="workspace-form-grid">
              <div className="workspace-form-field span-2"><label htmlFor="compliance-product">Προϊόν</label><select id="compliance-product" name="product" required>{initial.products.map((product) => <option value={product.id} key={product.id}>{product.title}</option>)}</select></div>
              <div className="workspace-form-field"><label htmlFor="compliance-type">Τύπος εγγράφου</label><input id="compliance-type" name="type" list="compliance-types" placeholder="π.χ. Δήλωση συμμόρφωσης" required /><datalist id="compliance-types"><option value="Δήλωση συμμόρφωσης (DoC)" /><option value="Πιστοποιητικό CE" /><option value="Δελτίο δεδομένων ασφαλείας (SDS)" /><option value="Εγγύηση κατασκευαστή" /><option value="Άλλο" /></datalist></div>
              <div className="workspace-form-field"><label htmlFor="compliance-issuer">Εκδότης / κατασκευαστής</label><input id="compliance-issuer" name="issuer" placeholder="π.χ. όνομα κατασκευαστή" /></div>
              <div className="workspace-form-field"><label htmlFor="compliance-identifier">Αριθμός ή κωδικός εγγράφου</label><input id="compliance-identifier" name="identifier" placeholder="αν υπάρχει" /></div>
              <div className="workspace-form-field"><label htmlFor="compliance-asset">Σύνδεσε το PDF</label><select id="compliance-asset" name="asset"><option value="">Χωρίς συνδεδεμένο PDF</option>{initial.assets.filter((asset) => asset.kind === "document").map((asset) => <option value={asset.id} key={asset.id}>{asset.filename}</option>)}</select><small>Αν το PDF δεν εμφανίζεται, ανέβασέ το πρώτα από το βήμα 1 ως «Έγγραφο PDF».</small></div>
            </div>
            <div className="workspace-form-actions"><button className="button" disabled={busy}>{busy ? "Αποστολή…" : "Αποστολή για επαλήθευση"}</button></div>
          </form></div>
        </details>
      </div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Κατάσταση αρχείων" title="Φωτογραφίες, βίντεο & PDF που έχεις στείλει" note="«Σε έλεγχο» σημαίνει ότι δεν χρειάζεται να κάνεις κάτι. Αν εμφανιστεί «Χρειάζεται διόρθωση», διάβασε την αιτία κάτω από το αρχείο και ανέβασε διορθωμένη έκδοση." />
      {initial.assets.length === 0 ? <WorkspaceEmptyState title="Δεν έχεις στείλει ακόμη αρχεία." body="Όταν ανεβάσεις φωτογραφία, βίντεο ή PDF, η πορεία του ελέγχου θα εμφανίζεται εδώ." /> : <div className="workspace-queue-list">{initial.assets.map((asset) => <article className="workspace-queue-card" key={asset.id}>
        <div className="workspace-queue-head"><div><strong>{asset.filename}</strong><small>{mediaKindLabel(asset.kind)} · {productTitle(asset.canonicalVariantId)} · {(asset.byteSize / 1024).toFixed(1)} KB</small></div><span className="status-pill">{mediaOverallStatus(asset)}</span></div>
        <div className="workspace-queue-primary"><span>Ασφάλεια αρχείου: {statusLabel(asset.scanStatus)}</span><span>Δικαιώματα χρήσης: {statusLabel(asset.rightsStatus)}</span><span>Έλεγχος περιεχομένου: {statusLabel(asset.moderationStatus)}</span></div>
        {asset.rejectionReason && <p className="workspace-queue-summary"><strong>Τι χρειάζεται διόρθωση:</strong> {asset.rejectionReason}</p>}
        <WorkspaceRecordDetails label="Τεχνικές πληροφορίες"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Κωδικός αρχείου</strong><span>{asset.id}</span></div><div className="workspace-compact-row"><strong>Κωδικός προϊόντος</strong><span>{asset.canonicalVariantId ?? "—"}</span></div><div className="workspace-compact-row"><strong>Ανέβηκε</strong><span>{new Date(asset.createdAt).toLocaleString("el-GR")}</span></div></div></WorkspaceRecordDetails>
      </article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Κατάσταση εγγράφων" title="Πιστοποιητικά & δηλώσεις" note="Εδώ βλέπεις αν ένα έγγραφο περιμένει επαλήθευση, έχει εγκριθεί, έχει απορριφθεί ή έχει λήξει." />
      {initial.documents.length === 0 ? <WorkspaceEmptyState title="Δεν έχεις καταχωρίσει πιστοποιητικά ή άλλα έγγραφα." body="Αν κάποιο προϊόν χρειάζεται σχετικό έγγραφο, η καταχώριση και η πορεία ελέγχου του θα εμφανιστούν εδώ." /> : <div className="workspace-queue-list">{initial.documents.map((document) => <article className="workspace-queue-card" key={document.id}>
        <div className="workspace-queue-head"><div><strong>{productTitle(document.canonicalVariantId)}</strong><small>{document.type}{document.issuer ? ` · ${document.issuer}` : ""}</small></div><span className="status-pill">{statusLabel(document.status)}</span></div>
        {document.validTo && <p className="workspace-queue-summary">Ισχύει έως: {new Date(document.validTo).toLocaleDateString("el-GR")}</p>}
        {document.rejectionReason && <p className="workspace-queue-summary"><strong>Τι χρειάζεται διόρθωση:</strong> {document.rejectionReason}</p>}
        <WorkspaceRecordDetails label="Τεχνικές πληροφορίες"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Κωδικός εγγράφου</strong><span>{document.id}</span></div><div className="workspace-compact-row"><strong>Κωδικός προϊόντος</strong><span>{document.canonicalVariantId}</span></div><div className="workspace-compact-row"><strong>Αριθμός / αναφορά</strong><span>{document.identifier ?? "—"}</span></div>{document.mediaAssetId && <div className="workspace-compact-row"><strong>Συνδεδεμένο αρχείο</strong><span>{document.mediaAssetId}</span></div>}</div></WorkspaceRecordDetails>
      </article>)}</div>}
    </section>
  </>;
}
