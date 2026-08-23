"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VendorReviewView } from "../lib/vendor-reviews-runtime";
import { WorkspaceEmptyState, WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

const statusLabels: Record<VendorReviewView["status"], string> = {
  pending: "Σε moderation",
  published: "Δημοσιευμένη",
  hidden: "Κρυμμένη",
  rejected: "Απορρίφθηκε"
};
const sourceLabels = { verified_order: "Επαληθευμένη αγορά", verified_advice: "Επαληθευμένη συμβουλή" } as const;
const reportLabels: Record<string, string> = { open: "Ανοιχτή αναφορά", under_review: "Σε έλεγχο", resolved: "Επιλύθηκε", rejected: "Απορρίφθηκε" };
const stars = (rating: number) => `${"★".repeat(Math.max(0, Math.min(5, rating)))}${"☆".repeat(Math.max(0, 5-rating))}`;
const when = (value?: number) => value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)) : "";

export function VendorReviewsClient({ csrfToken, initial }: { csrfToken: string; initial: readonly VendorReviewView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const published = initial.filter((item) => item.status === "published").length;
  const pending = initial.filter((item) => item.status === "pending").length;
  const needingResponse = initial.filter((item) => item.status === "published" && !item.response).length;

  async function call(key: string, url: string, body: Record<string, unknown>) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν μπορέσαμε να ολοκληρώσουμε την ενέργεια.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν μπορέσαμε να ολοκληρώσουμε την ενέργεια.");
    } finally {
      setBusy("");
    }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert"><strong>Η ενέργεια δεν ολοκληρώθηκε.</strong> {error}</div>}
    <WorkspaceMetricStrip items={[
      { label: "Σύνολο", value: initial.length },
      { label: "Δημοσιευμένες", value: published, tone: published ? "positive" : "default" },
      { label: "Σε moderation", value: pending },
      { label: "Χωρίς απάντηση", value: needingResponse, tone: needingResponse ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Εμπιστοσύνη" title="Αξιολογήσεις πελατών" note="Βλέπεις μόνο αξιολογήσεις που συνδέονται με πραγματική εμπειρία του δικού σου καταστήματος. Δεν εμφανίζονται στοιχεία ταυτότητας ή επικοινωνίας πελάτη." />
      <WorkspaceHowItWorks>
        <p><strong>Απάντηση:</strong> μπορείς να απαντήσεις δημόσια μόνο όταν η αξιολόγηση έχει δημοσιευθεί.</p>
        <p><strong>Αναφορά:</strong> χρησιμοποίησέ την για σαφή λόγο moderation — όχι επειδή η βαθμολογία είναι χαμηλή.</p>
        <p><strong>Δίκαιη ανάθεση:</strong> οι αξιολογήσεις είναι trust evidence και δεν αλλάζουν τη σειρά Fair Vendor Assignment.</p>
      </WorkspaceHowItWorks>
      {initial.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη αξιολογήσεις για το κατάστημά σου." body="Όταν πελάτης αξιολογήσει επαληθευμένη αγορά ή συμβουλή, θα εμφανιστεί εδώ." /> : <div className="workspace-queue-list">{initial.map((review) => {
        const actionable = review.status === "published";
        const reportOpen = review.reportStatus === "open" || review.reportStatus === "under_review";
        return <article className="workspace-queue-card" key={review.id}>
          <div className="workspace-queue-head"><div><strong><Link href={`/product/${encodeURIComponent(review.productId)}`}>{review.productTitle}</Link></strong><small>{sourceLabels[review.interactionType]} · {when(review.createdAt)}</small></div><span className="vendor-merchant-status">{statusLabels[review.status]}</span></div>
          <p aria-label={`${review.rating} από 5 αστέρια`} style={{ fontSize: "1.25rem", letterSpacing: ".08em", margin: 0 }}>{stars(review.rating)}</p>
          {review.body ? <p className="workspace-queue-summary">{review.body}</p> : <p className="workspace-queue-summary">Ο πελάτης άφησε μόνο βαθμολογία.</p>}
          {review.response && <div className="workspace-inline-note"><strong>Η δημόσια απάντησή σου</strong><br />{review.response}{review.responseUpdatedAt ? <small> · {when(review.responseUpdatedAt)}</small> : null}</div>}
          {review.reportStatus && <div className="workspace-inline-note"><strong>Αναφορά:</strong> {reportLabels[review.reportStatus] ?? review.reportStatus}</div>}
          {!actionable ? <div className="workspace-inline-note">Δεν επιτρέπεται δημόσια απάντηση ή αναφορά πριν ολοκληρωθεί το moderation.</div> : <div className="workspace-dual-grid">
            <form className="workspace-tool-panel" onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void call(`response:${review.id}`, "/api/vendor/reviews/response", { reviewId: review.id, body: String(data.get("body") ?? "") });
            }}>
              <div className="workspace-tool-body">
                <strong>{review.response ? "Ενημέρωση απάντησης" : "Δημόσια απάντηση"}</strong>
                <textarea name="body" defaultValue={review.response ?? ""} maxLength={2000} rows={3} required placeholder="Απάντησε ψύχραιμα και χρήσιμα στην εμπειρία που περιγράφεται." />
                <button className="button" disabled={Boolean(busy)}>{busy === `response:${review.id}` ? "Αποθήκευση…" : review.response ? "Ενημέρωση" : "Δημοσίευση απάντησης"}</button>
              </div>
            </form>
            <form className="workspace-tool-panel" onSubmit={(event) => {
              event.preventDefault();
              if (reportOpen) return;
              const data = new FormData(event.currentTarget);
              void call(`report:${review.id}`, "/api/vendor/reviews/report", { reviewId: review.id, reason: String(data.get("reason") ?? "other"), details: String(data.get("details") ?? "") });
            }}>
              <div className="workspace-tool-body">
                <strong>Αναφορά για moderation</strong>
                <select name="reason" defaultValue="other" disabled={reportOpen}><option value="not_genuine">Δεν φαίνεται γνήσια</option><option value="abusive">Υβριστικό / καταχρηστικό</option><option value="personal_data">Προσωπικά δεδομένα</option><option value="conflict_of_interest">Σύγκρουση συμφερόντων</option><option value="other">Άλλος σαφής λόγος</option></select>
                <textarea name="details" minLength={10} maxLength={2000} rows={3} required disabled={reportOpen} placeholder="Εξήγησε συγκεκριμένα τι πρέπει να ελέγξει το moderation." />
                <button className="button button-secondary" disabled={Boolean(busy) || reportOpen}>{reportOpen ? "Υπάρχει ενεργή αναφορά" : busy === `report:${review.id}` ? "Αποστολή…" : "Αποστολή αναφοράς"}</button>
              </div>
            </form>
          </div>}
        </article>;
      })}</div>}
    </section>
  </>;
}
