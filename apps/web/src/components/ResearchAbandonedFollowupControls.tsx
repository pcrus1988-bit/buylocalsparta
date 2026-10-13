"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Counts = Readonly<{
  q27Unsubmitted: number;
  eligibleNow: number;
  minimumSinceLastAnswerHours: number;
}>;

export function ResearchAbandonedFollowupControls({
  slug, studyTitle, csrfToken
}: {
  slug: string; studyTitle: string; csrfToken: string;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [countError, setCountError] = useState("");
  const [loading, setLoading] = useState(false);
  const [batchSize, setBatchSize] = useState("100");
  const [preview, setPreview] = useState<{ subject: string; text: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const base = "/api/admin/research/surveys/" + encodeURIComponent(slug);

  const refresh = useCallback(async () => {
    setLoading(true);
    setCountError("");
    try {
      const response = await fetch(base + "/abandoned-followups", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Δεν ήταν δυνατή η φόρτωση.");
      setCounts(data as Counts);
    } catch (error) {
      setCountError(error instanceof Error ? error.message : "Τα στοιχεία δεν είναι διαθέσιμα.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function showEmailPreview() {
    setShowPreview(true);
    setPreview(null);
    setPreviewError("");
    try {
      const response = await fetch(base + "/email-preview", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ purpose: "abandoned_followup", studyTitle, companyName: "ΕΠΙΧΕΙΡΗΣΗ ΔΕΙΓΜΑΤΟΣ" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Δεν ήταν δυνατή η προεπισκόπηση.");
      setPreview(data);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Η προεπισκόπηση απέτυχε.");
    }
  }

  const n = Number(batchSize);
  const validN = Number.isSafeInteger(n) && n >= 1 && n <= 500;
  const canApprove = counts !== null && counts.eligibleNow > 0 && validN && !loading && !sending;
  const batchCap = validN ? Math.min(n, counts?.eligibleNow ?? 0) : 0;

  async function confirmSend() {
    if (confirmStep !== 2 || confirmText !== String(batchCap) || batchCap < 1) return;
    setSending(true);
    setStatus("");
    try {
      const response = await fetch(base + "/jobs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          action: "send_abandoned_followups",
          limit: batchCap,
          emailApproval: {
            studySlug: slug, studyTitle, purpose: "research_reminder",
            maxEmails: batchCap, reviewConfirmed: true, finalConfirmed: true
          }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Η παρτίδα δεν εγκρίθηκε.");
      setStatus("Η ειδική υπενθύμιση εγκρίθηκε για έως " + batchCap +
        " ενεργούς παραλήπτες και μπήκε στην ουρά. Job: " + String(data.jobId));
      setConfirmStep(0);
      setConfirmText("");
      await refresh();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Η αποστολή απέτυχε.";
      setStatus(message === "RESEARCH_EMAIL_DELIVERY_DISABLED"
        ? "Η αποστολή SES δεν είναι ενεργοποιημένη. Δεν δημιουργήθηκε παρτίδα."
        : message);
    } finally {
      setSending(false);
    }
  }

  return <section className="shell vendor-section" aria-label="Follow-up for incomplete questionnaires">
    <div className="workspace-queue-card" style={{ display: "grid", gap: 15 }}>
      <div className="workspace-action-bar">
        <span>
          <strong>Ειδική υπενθύμιση · Ξεκίνησαν αλλά δεν υπέβαλαν</strong>
          <p>Στείλτε μία ευγενική, μη εμπορική υπενθύμιση σε συμμετέχοντες που έφτασαν στην τελευταία ερώτηση Q27, αλλά δεν ολοκλήρωσαν την οριστική υποβολή. Προσωπικός σύνδεσμος για να συνεχίσουν με τις αποθηκευμένες απαντήσεις.</p>
        </span>
        <button type="button" className="button button-secondary" disabled={loading || sending} onClick={() => void refresh()}>
          {loading ? "Ανανέωση…" : "Ανανέωση παραληπτών"}
        </button>
      </div>

      <div className="workspace-action-bar">
        <span><strong>{counts ? counts.q27Unsubmitted.toLocaleString("el-GR") : "—"}</strong> αποθηκευμένη Q27 χωρίς επίσημη υποβολή</span>
        <span><strong>{counts ? counts.eligibleNow.toLocaleString("el-GR") : "—"}</strong> διαθέσιμοι για μία υπενθύμιση τώρα</span>
      </div>
      <small>Ελάχιστο διάστημα 24 ώρες από την τελευταία ερώτηση. Δεν περιλαμβάνονται όσοι δεν έφτασαν στην Q27, όσοι ολοκλήρωσαν, ανακάλεσαν ή έχουν αποκλειστεί, ούτε παραλήπτες προηγούμενης υπενθύμισης. Οι έλεγχοι επαναλαμβάνονται πριν από κάθε email.</small>
      <small>Η οριστική υποβολή και οι προαιρετικές επιλογές ενημέρωσης αποτελεσμάτων, marketing και κωδικού ευχαριστίας γίνονται μόνο από τον συμμετέχοντα. Αυτή η λειτουργία δεν τις συμπληρώνει εκ μέρους του.</small>

      <div className="workspace-action-buttons" style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12 }}>
        <button className="button button-secondary" type="button" onClick={() => void showEmailPreview()}>Προεπισκόπηση email (EL)</button>
        <label>
          <small>Μέγιστο ανά παρτίδα (1–500)</small>
          <input aria-label="Abandoned questionnaire follow-up batch size" type="number" inputMode="numeric"
            min={1} max={500} value={batchSize} onChange={(event) => setBatchSize(event.target.value)} />
        </label>
        <button className="button" type="button" disabled={!canApprove}
          onClick={() => { setStatus(""); setConfirmText(""); setConfirmStep(1); }}>
          Έλεγχος και έγκριση ειδικής υπενθύμισης
        </button>
      </div>
      {countError && <p role="alert" style={{ color: "#a33" }}>{countError}</p>}
      {status && <p role="status" className="workspace-inline-note">{status}</p>}

      {showPreview && <div role="dialog" aria-modal="true" aria-label="Προεπισκόπηση υπενθύμισης ερωτηματολογίου"
        style={{ position:"fixed", inset:0, zIndex:12000, background:"rgba(14,24,20,.72)", display:"grid", placeItems:"center", padding:14 }}>
        <div style={{ background:"#fffdf8", padding:20, borderRadius:18, maxHeight:"94vh", overflow:"auto", width:"min(820px,100%)", display:"grid", gap:12 }}>
          <div className="workspace-action-bar"><strong>Προεπισκόπηση · Χωρίς πραγματική αποστολή</strong>
            <button className="button button-secondary" type="button" onClick={() => setShowPreview(false)}>Κλείσιμο</button></div>
          {previewError && <p role="alert">{previewError}</p>}
          {preview && <>
            <strong>Θέμα: {preview.subject}</strong>
            <iframe title="Abandoned follow-up email preview" sandbox="" srcDoc={preview.html}
              style={{ width:"100%", height:"min(50vh,580px)", border:"1px solid #d6cfbf", background:"white" }}/>
            <details><summary>Απλό κείμενο</summary><pre style={{ whiteSpace:"pre-wrap", fontFamily:"inherit", overflowWrap:"anywhere" }}>{preview.text}</pre></details>
          </>}
          {!preview && !previewError && <p>Φόρτωση προεπισκόπησης…</p>}
        </div>
      </div>}

      {confirmStep !== 0 && <div role="dialog" aria-modal="true" aria-label="Έγκριση email σε εγκαταλειμμένα ερωτηματολόγια"
        style={{ position:"fixed", inset:0, zIndex:12000, background:"rgba(14,24,20,.72)", display:"grid", placeItems:"center", padding:18 }}>
        <div style={{ background:"#fffdf8", padding:24, borderRadius:18, width:"min(580px,100%)", display:"grid", gap:16 }}>
          <h3>Ειδική υπενθύμιση · Επιβεβαίωση {confirmStep}/2</h3>
          <p>Μελέτη: <strong>{studyTitle}</strong>. Μέγιστο πλήθος: <strong>{batchCap}</strong>. Μόνο ενεργοί συμμετέχοντες με αποθηκευμένη Q27 και χωρίς επίσημη υποβολή. Χωρίς marketing, δώρα ή αυτόματη συγκατάθεση.</p>
          {confirmStep === 1
            ? <p>Ελέγξτε πρώτα το κείμενο του email. Η συνέχεια απαιτεί δεύτερη, αριθμητική επιβεβαίωση. Το πλήθος παραληπτών μπορεί να μειωθεί από ελέγχους τελευταίας στιγμής.</p>
            : <label>Για την οριστική έγκριση πληκτρολογήστε <strong>{batchCap}</strong>:
                <input autoFocus aria-label="Confirm abandoned follow-up batch size" inputMode="numeric"
                  value={confirmText} onChange={e=>setConfirmText(e.target.value.replace(/[^0-9]/g,""))}/>
              </label>}
          <div className="workspace-action-buttons">
            <button className="button button-secondary" type="button" disabled={sending}
              onClick={()=>{setConfirmStep(0);setConfirmText("");}}>Ακύρωση</button>
            {confirmStep===1
              ? <button className="button" type="button" onClick={()=>setConfirmStep(2)}>Επιβεβαίωση 1</button>
              : <button className="button" type="button" disabled={sending || confirmText!==String(batchCap)}
                  onClick={()=>void confirmSend()}>{sending?"Έλεγχος…":"Επιβεβαίωση 2 · Στην ουρά"}</button>}
          </div>
        </div>
      </div>}
    </div>
  </section>;
}
