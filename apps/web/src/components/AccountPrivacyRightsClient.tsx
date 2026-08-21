"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CookieSettingsButton } from "./CookieSettingsButton";
import { CustomerHowItWorks, CustomerLifecycle, type CustomerLifecycleStage } from "./CustomerAccountPrimitives";

type PrivacyRequest = Readonly<{
  id: string;
  type: string;
  status: string;
  submittedAt: number;
  targetAt: number;
}>;

type Preferences = Readonly<{ recommendationsEnabled: boolean; recentlyViewedEnabled: boolean }>;
type Props = Readonly<{ csrfToken: string; email: string; preferences: Preferences; requests: readonly PrivacyRequest[] }>;

const REQUEST_OPTIONS = [
  { value: "access", label: "Πρόσβαση στα προσωπικά δεδομένα", help: "Ζήτησε επιβεβαίωση και αντίγραφο/περιγραφή των δεδομένων που επεξεργαζόμαστε." },
  { value: "export", label: "Εξαγωγή / φορητότητα δεδομένων", help: "Ζήτησε δομημένη εξαγωγή των δεδομένων όπου εφαρμόζεται το δικαίωμα φορητότητας." },
  { value: "correction", label: "Διόρθωση δεδομένων", help: "Εξήγησε ποια προσωπικά στοιχεία θεωρείς ανακριβή ή ελλιπή." },
  { value: "deletion", label: "Διαγραφή δεδομένων", help: "Ζήτησε διαγραφή δεδομένων που δεν χρειάζεται να διατηρούνται για νόμιμο σκοπό." },
  { value: "restriction", label: "Περιορισμός επεξεργασίας", help: "Ζήτησε να περιοριστεί συγκεκριμένη επεξεργασία όσο εξετάζεται το σχετικό δικαίωμα." },
  { value: "objection", label: "Εναντίωση σε επεξεργασία", help: "Εξήγησε σε ποια επεξεργασία που βασίζεται σε έννομο συμφέρον εναντιώνεσαι." },
  { value: "marketing_withdrawal", label: "Ανάκληση marketing", help: "Καταχώρησε αίτημα ανάκλησης marketing σε επίπεδο λογαριασμού. Τα marketing cookies μπορούν να απενεργοποιηθούν άμεσα από τις Ρυθμίσεις cookies." },
  { value: "account_closure", label: "Κλείσιμο λογαριασμού", help: "Ζήτησε κλείσιμο του λογαριασμού. Φορολογικά/λογιστικά ή άλλα υποχρεωτικά αρχεία μπορεί να παραμείνουν όπου απαιτείται." }
] as const;

const formatDate = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function privacyLifecycle(status: string): readonly CustomerLifecycleStage[] {
  const completed = status === "completed" || status === "partially_completed";
  const cancelled = status === "cancelled";
  const processing = status === "processing";
  return [
    { label: "Υποβλήθηκε", state: "done" },
    { label: "Έλεγχος", state: completed || processing || cancelled ? "done" : "current" },
    { label: "Επεξεργασία", state: completed ? "done" : cancelled ? "cancelled" : processing ? "current" : "pending" },
    { label: "Ολοκλήρωση", state: completed ? "done" : cancelled ? "cancelled" : "pending" }
  ];
}

export function AccountPrivacyRightsClient({ csrfToken, email, preferences, requests: initialRequests }: Props) {
  const [requests, setRequests] = useState<readonly PrivacyRequest[]>(initialRequests);
  const [preferenceState, setPreferenceState] = useState<Preferences>(preferences);
  const [type, setType] = useState<(typeof REQUEST_OPTIONS)[number]["value"]>("access");
  const [note, setNote] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const selected = useMemo(() => REQUEST_OPTIONS.find((item) => item.value === type)!, [type]);

  async function updatePreferences(patch: Partial<Preferences>) {
    if (preferenceBusy) return;
    const previous = preferenceState;
    const next = { ...preferenceState, ...patch };
    setPreferenceState(next);
    setPreferenceBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/account/preferences", { method: "PUT", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify(patch) });
      if (!response.ok) throw new Error("Η ρύθμιση δεν αποθηκεύτηκε.");
      setSuccess("Η επιλογή ιδιωτικότητας αποθηκεύτηκε.");
    } catch (cause) {
      setPreferenceState(previous);
      setError(cause instanceof Error ? cause.message : "Η ρύθμιση δεν αποθηκεύτηκε.");
    } finally {
      setPreferenceBusy(false);
    }
  }

  async function submit() {
    if (requestBusy) return;
    setRequestBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/account/privacy/request", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ type, note })
      });
      const payload = await response.json().catch(() => ({})) as { request?: PrivacyRequest; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error || "Το αίτημα δεν καταχωρήθηκε.");
      const item = payload.request;
      setRequests((current) => [item, ...current.filter((existing) => existing.id !== item.id)].sort((a, b) => b.submittedAt - a.submittedAt));
      setNote("");
      setSuccess("Το αίτημα καταχωρήθηκε. Μπορείς να παρακολουθείς την κατάστασή του παρακάτω.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Το αίτημα δεν καταχωρήθηκε.");
    } finally {
      setRequestBusy(false);
    }
  }

  return <>
    <section className="shell account-section-intro dashboard-section-heading" aria-labelledby="privacy-account-summary"><div><div className="eyebrow">Ιδιωτικότητα & δεδομένα</div><h2 id="privacy-account-summary">Ο έλεγχος των δεδομένων σου</h2></div><p>Συνδεδεμένος ως {email}. Οι επιλογές cookies και οι ρυθμίσεις λογαριασμού παραμένουν ξεχωριστές, ώστε κάθε σκοπός να ελέγχεται καθαρά.</p></section>

    <section className="shell account-live-grid">
      <article className="account-live-card">
        <div className="account-card-head"><div><div className="eyebrow">Προσωποποίηση</div><h2>Οι επιλογές σου</h2></div></div>
        <label className="preference-row"><span><strong>Προσωποποιημένες προτάσεις</strong><small>Χρησιμοποιούνται μόνο δικά σου αποθηκευμένα και πρόσφατα σήματα ενδιαφέροντος.</small></span><input type="checkbox" checked={preferenceState.recommendationsEnabled} disabled={preferenceBusy} onChange={(event) => void updatePreferences({ recommendationsEnabled: event.target.checked })} /></label>
        <label className="preference-row"><span><strong>Πρόσφατα προβεβλημένα</strong><small>Η απενεργοποίηση σταματά την καταγραφή για αυτή τη λειτουργία και καθαρίζει το σχετικό ιστορικό όπου επιτρέπεται άμεσα.</small></span><input type="checkbox" checked={preferenceState.recentlyViewedEnabled} disabled={preferenceBusy} onChange={(event) => void updatePreferences({ recentlyViewedEnabled: event.target.checked })} /></label>
        <CustomerHowItWorks title="Τι αλλάζει με αυτές τις επιλογές;"><p>Οι ρυθμίσεις προσωποποίησης αφορούν μόνο λειτουργίες του συνδεδεμένου λογαριασμού. Δεν αντικαθιστούν τις ρυθμίσεις cookies και δεν αλλάζουν στοιχεία που πρέπει να διατηρούνται για παραγγελίες, φορολογικές υποχρεώσεις, ασφάλεια ή νόμιμη επίλυση διαφορών.</p></CustomerHowItWorks>
      </article>

      <article className="account-live-card">
        <div className="account-card-head"><div><div className="eyebrow">Cookies</div><h2>Επιλογές browser</h2></div></div>
        <p className="account-muted">Analytics και marketing trackers παραμένουν προαιρετικά και μπορούν να ανακληθούν χωρίς αίτημα υποστήριξης.</p>
        <CookieSettingsButton className="button button-secondary privacy-button" label="Ρυθμίσεις cookies" />
        <Link className="text-link privacy-guide-link" href="/cookies">Δες την Πολιτική Cookies →</Link>
        <CustomerHowItWorks title="Γιατί είναι ξεχωριστά από τον λογαριασμό;"><p>Τα cookies λειτουργούν σε επίπεδο browser και συσκευής, ενώ οι ρυθμίσεις προσωποποίησης συνδέονται με τον λογαριασμό σου. Γι’ αυτό ελέγχονται χωριστά.</p></CustomerHowItWorks>
      </article>

      <article className="account-live-card account-wide">
        <div className="account-card-head"><div><div className="eyebrow">Δικαιώματα GDPR</div><h2>Υποβολή αιτήματος</h2></div></div>
        <div className="workspace-form-grid">
          <label><span>Τύπος αιτήματος</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}>{REQUEST_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>Σημείωση / τι χρειάζεσαι</span><textarea rows={4} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Προαιρετικά: δώσε μόνο τις πληροφορίες που χρειάζονται για να καταλάβουμε το αίτημα." /></label>
        </div>
        <p className="account-muted" id="privacy-request-help">{selected.help}</p>
        {error && <p className="account-action-error" role="alert">{error}</p>}
        {success && <p className="privacy-status" role="status">{success}</p>}
        <div className="hero-actions"><button className="button" type="button" disabled={requestBusy} onClick={() => void submit()}>{requestBusy ? "Καταχώρηση…" : "Καταχώρηση αιτήματος"}</button><Link className="button button-secondary" href="/privacy">Τι προβλέπει η Πολιτική Απορρήτου</Link></div>
        <CustomerHowItWorks title="Τι γίνεται μετά την υποβολή;"><p>Το αίτημα αποκτά ορατή κατάσταση και στόχο επεξεργασίας. Αν χρειάζεται να διατηρηθούν συγκεκριμένα στοιχεία για νόμιμο σκοπό, το αποτέλεσμα μπορεί να είναι μερική ολοκλήρωση με αιτιολόγηση διατήρησης.</p></CustomerHowItWorks>
      </article>

      <article className="account-live-card account-wide">
        <div className="account-card-head"><div><div className="eyebrow">Ιστορικό αιτημάτων</div><h2>Αιτήματα ιδιωτικότητας</h2></div><span className="count-pill">{requests.length}</span></div>
        {requests.length ? <div className="account-list">{requests.map((request) => <div className="order-row" key={request.id}>
          <div><strong>{requestLabel(request.type)}</strong><small>Υποβλήθηκε {formatDate(request.submittedAt)}</small></div>
          <div><span>Στόχος επεξεργασίας: {formatDate(request.targetAt)}</span></div>
          <div className="order-total"><strong>{requestStatus(request.status)}</strong></div>
          <div style={{gridColumn:"1/-1"}}><CustomerLifecycle label={`Πορεία αιτήματος ${requestLabel(request.type)}`} stages={privacyLifecycle(request.status)} /></div>
        </div>)}</div> : <p className="account-muted">Δεν υπάρχουν ακόμη αιτήματα ιδιωτικότητας.</p>}
      </article>
    </section>
  </>;
}

function requestLabel(type: string): string {
  return REQUEST_OPTIONS.find((item) => item.value === type)?.label ?? type;
}

function requestStatus(status: string): string {
  switch (status) {
    case "submitted": return "Υποβλήθηκε";
    case "processing": return "Σε επεξεργασία";
    case "completed": return "Ολοκληρώθηκε";
    case "partially_completed": return "Ολοκληρώθηκε με νόμιμη διατήρηση";
    case "cancelled": return "Ακυρώθηκε";
    default: return status;
  }
}
