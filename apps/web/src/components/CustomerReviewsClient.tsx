"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CustomerReviewCandidate, CustomerReviewView } from "../lib/customer-reviews-runtime";

const sourceLabels = { order_line: "Επαληθευμένη αγορά", appointment: "Ολοκληρωμένο ραντεβού", conversation: "Επαληθευμένη συμβουλή" } as const;
const statusLabels: Record<CustomerReviewView["status"], string> = {
  pending: "Σε έλεγχο",
  published: "Δημοσιευμένη",
  hidden: "Κρυμμένη από τη δημόσια προβολή",
  rejected: "Δεν εγκρίθηκε"
};

const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
const stars = (rating: number) => `${"★".repeat(Math.max(0, Math.min(5, rating)))}${"☆".repeat(Math.max(0, 5 - rating))}`;

export function CustomerReviewsClient({ csrfToken, candidates, reviews }: {
  csrfToken: string;
  candidates: readonly CustomerReviewCandidate[];
  reviews: readonly CustomerReviewView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function submit(candidate: CustomerReviewCandidate, form: HTMLFormElement) {
    setBusy(candidate.sourceId);
    setError("");
    try {
      const data = new FormData(form);
      const response = await fetch("/api/account/reviews", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          sourceKind: candidate.sourceKind,
          sourceId: candidate.sourceId,
          rating: Number(data.get("rating")),
          body: String(data.get("body") ?? "")
        })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν μπορέσαμε να αποθηκεύσουμε την αξιολόγηση.");
      form.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν μπορέσαμε να αποθηκεύσουμε την αξιολόγηση.");
    } finally {
      setBusy("");
    }
  }

  return <>
    {error && <div className="shell form-error" role="alert"><strong>Η αξιολόγηση δεν αποθηκεύτηκε.</strong> {error}</div>}

    <section className="shell customer-account-page">
      <div className="customer-page-heading">
        <div><div className="eyebrow">Διαθέσιμες αξιολογήσεις</div><h2>Μίλησε μόνο για εμπειρία που έγινε πραγματικά</h2></div>
        <p>Το ΚΟΝΤΑ ΜΟΥ επιτρέπει αξιολόγηση μόνο μετά από παραδομένη αγορά, ολοκληρωμένο ραντεβού ή πραγματική αμφίδρομη συμβουλή. Δεν μπορείς να επιλέξεις άλλο κατάστημα ή προϊόν από αυτό της επαληθευμένης εμπειρίας.</p>
      </div>
      {candidates.length === 0 ? <div className="empty-state"><h2>Δεν υπάρχει νέα επαληθευμένη εμπειρία για αξιολόγηση.</h2><p>Όταν ολοκληρωθεί αγορά ή συμβουλή, θα εμφανιστεί εδώ αυτόματα.</p></div> : <div className="workspace-queue-list">{candidates.map((candidate) => <article className="workspace-queue-card" key={`${candidate.sourceKind}:${candidate.sourceId}`}>
        <div className="workspace-queue-head"><div><strong>{candidate.productTitle}</strong><small>{candidate.vendorName} · {sourceLabels[candidate.sourceKind]} · {when(candidate.sourceAt)}</small></div><span className="vendor-merchant-status">Επαληθευμένο</span></div>
        <form className="customer-preferences-form" onSubmit={(event) => { event.preventDefault(); void submit(candidate, event.currentTarget); }}>
          <label><span>Βαθμολογία</span><select name="rating" defaultValue="5" required><option value="5">5 — Εξαιρετική εμπειρία</option><option value="4">4 — Πολύ καλή</option><option value="3">3 — Καλή / ουδέτερη</option><option value="2">2 — Κάτω από τις προσδοκίες</option><option value="1">1 — Κακή εμπειρία</option></select></label>
          <label><span>Σχόλιο <small>(προαιρετικό, έως 2.000 χαρακτήρες)</small></span><textarea name="body" maxLength={2000} rows={4} placeholder="Τι θα βοηθούσε έναν άλλο πελάτη να γνωρίζει;" /></label>
          <div className="workspace-inline-note">Η αξιολόγηση μπαίνει πρώτα σε έλεγχο. Δεν επηρεάζει τον αλγόριθμο δίκαιης ανάθεσης καταστημάτων.</div>
          <button className="button" disabled={Boolean(busy)}>{busy === candidate.sourceId ? "Αποθήκευση…" : "Υποβολή αξιολόγησης"}</button>
        </form>
      </article>)}</div>}
    </section>

    <section className="shell customer-account-page" style={{ paddingBottom: 56 }}>
      <div className="customer-page-heading"><div><div className="eyebrow">Οι αξιολογήσεις μου</div><h2>Κατάσταση & απαντήσεις καταστημάτων</h2></div><p>Βλέπεις την πραγματική κατάσταση moderation. Μόνο οι δημοσιευμένες αξιολογήσεις εμφανίζονται δημόσια.</p></div>
      {reviews.length === 0 ? <div className="empty-state"><h2>Δεν έχεις υποβάλει ακόμη αξιολόγηση.</h2></div> : <div className="workspace-queue-list">{reviews.map((review) => <article className="workspace-queue-card" key={review.id}>
        <div className="workspace-queue-head"><div><strong><Link href={`/product/${encodeURIComponent(review.productId)}`}>{review.productTitle}</Link></strong><small>{review.vendorName} · {sourceLabels[review.sourceKind]}</small></div><span className="vendor-merchant-status">{statusLabels[review.status]}</span></div>
        <p aria-label={`${review.rating} από 5 αστέρια`} style={{ fontSize: "1.25rem", letterSpacing: ".08em", margin: 0 }}>{stars(review.rating)}</p>
        {review.body && <p className="workspace-queue-summary">{review.body}</p>}
        {review.vendorResponse && <div className="workspace-inline-note"><strong>Απάντηση καταστήματος</strong><br />{review.vendorResponse}</div>}
        <small>{when(review.createdAt)}</small>
      </article>)}</div>}
    </section>
  </>;
}
