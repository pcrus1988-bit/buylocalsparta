"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_SUBJECT = "Πρόσκληση συμμετοχής στη μελέτη «Ελληνικό Λιανεμπόριο 2026»";
const DEFAULT_BODY = `Καλησπέρα,

Το KONTA MOY διεξάγει τη μελέτη «{{study_title}}» για την πραγματικότητα των μικρών και μεσαίων εμπορικών επιχειρήσεων στην ψηφιακή εποχή.

Η επιχείρησή σας επιλέχθηκε από το προκαθορισμένο πλαίσιο πληθυσμού της μελέτης. Η συμμετοχή είναι προαιρετική. Ο προσωπικός σύνδεσμος χρησιμοποιείται μόνο για να συνδέσει μία απάντηση με τη μονάδα του επιλεγμένου δείγματος και να αποτρέψει διπλές συμμετοχές. Στο ερωτηματολόγιο δεν χρειάζεται να εισαγάγετε ΑΦΜ, email ή επωνυμία.

{{survey_url}}

Η μεθοδολογία, ο σκοπός και ο τρόπος επεξεργασίας των δεδομένων είναι διαθέσιμα εδώ:
{{methodology_url}}

Η συμμετοχή ή μη συμμετοχή σας δεν επηρεάζει οποιαδήποτε εμπορική σχέση με το KONTA MOY. Οι επιλογές για ενημέρωση αποτελεσμάτων, κωδικό ευχαριστίας ή εμπορική επικοινωνία είναι ξεχωριστές από τη συγκατάθεση συμμετοχής στην έρευνα.`;

type Busy = "template" | "send" | "rewards" | "analysis" | "release" | "results" | null;

export function ResearchStudyFieldworkControls({
  slug,
  csrfToken,
  studyStatus,
  recruitmentTemplateVersion,
  activeContacts,
  completed,
  rewardEligible,
  rewardIssued,
  rewardDeliveryFailed,
  pendingQualityReviews,
  succeededAnalysisRuns,
  latestReleaseVersion,
  latestReleasePublishedAt,
  resultsNotificationSent,
  resultsNotificationFailed,
  queuedJobs,
  runningJobs
}: {
  slug: string;
  csrfToken: string;
  studyStatus: string;
  recruitmentTemplateVersion?: string;
  activeContacts: number;
  completed: number;
  rewardEligible: number;
  rewardIssued: number;
  rewardDeliveryFailed: number;
  pendingQualityReviews: number;
  succeededAnalysisRuns: number;
  latestReleaseVersion?: string;
  latestReleasePublishedAt?: string;
  resultsNotificationSent: number;
  resultsNotificationFailed: number;
  queuedJobs: number;
  runningJobs: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [bodyText, setBodyText] = useState(DEFAULT_BODY);
  const [batchSize, setBatchSize] = useState("100");
  const [message, setMessage] = useState("");
  const workerBusy = queuedJobs > 0 || runningJobs > 0;
  const batchN = Number(batchSize);
  const batchValid = Number.isSafeInteger(batchN) && batchN >= 1 && batchN <= 500;
  const fielding = studyStatus === "pilot" || studyStatus === "fielding";

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Research operation failed");
    return result as Record<string, unknown>;
  }

  async function lockTemplate() {
    setBusy("template");
    setMessage("");
    try {
      const result = await post({
        action: "save_recruitment_template",
        subject,
        bodyText
      });
      setMessage("Η έκδοση πρόσκλησης κλειδώθηκε: " + String(result.version || ""));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η πρόσκληση δεν αποθηκεύτηκε.");
    } finally {
      setBusy(null);
    }
  }

  async function sendInvites() {
    if (!batchValid) return;
    setBusy("send");
    setMessage("");
    try {
      const result = await post({
        action: "send_invites",
        limit: batchN,
        label: "fieldwork-" + new Date().toISOString()
      });
      setMessage("Η παρτίδα προσκλήσεων μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      router.refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Η αποστολή δεν μπήκε στην ουρά.";
      setMessage(raw === "RESEARCH_EMAIL_DELIVERY_DISABLED"
        ? "Η ερευνητική αποστολή SES είναι απενεργοποιημένη. Ενεργοποιήστε ρητά το BLS_RESEARCH_EMAIL_DELIVERY_ENABLED."
        : raw);
    } finally {
      setBusy(null);
    }
  }

  async function deliverRewards() {
    setBusy("rewards");
    setMessage("");
    try {
      const result = await post({
        action: "deliver_rewards",
        limit: 100,
        label: "reward-delivery-" + new Date().toISOString()
      });
      setMessage("Η αποστολή κωδικών ευχαριστίας μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      router.refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Η αποστολή κωδικών δεν μπήκε στην ουρά.";
      setMessage(raw === "RESEARCH_EMAIL_DELIVERY_DISABLED"
        ? "Η ερευνητική αποστολή SES είναι απενεργοποιημένη. Ενεργοποιήστε ρητά το BLS_RESEARCH_EMAIL_DELIVERY_ENABLED."
        : raw);
    } finally {
      setBusy(null);
    }
  }

  async function notifyResults() {
    setBusy("results");
    setMessage("");
    try {
      const result = await post({
        action: "notify_results",
        limit: 100,
        label: "results-notification-" + new Date().toISOString()
      });
      setMessage("Η ενημέρωση δημοσιευμένων αποτελεσμάτων μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      router.refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Η ενημέρωση αποτελεσμάτων δεν μπήκε στην ουρά.";
      setMessage(raw === "RESEARCH_EMAIL_DELIVERY_DISABLED"
        ? "Η ερευνητική αποστολή SES είναι απενεργοποιημένη. Ενεργοποιήστε ρητά το BLS_RESEARCH_EMAIL_DELIVERY_ENABLED."
        : raw);
    } finally {
      setBusy(null);
    }
  }

  async function buildRelease() {
    setBusy("release");
    setMessage("");
    try {
      const result = await post({ action: "build_release" });
      setMessage("Το reproducible release μπήκε στην ουρά: " + String(result.releaseVersion || "") + ".");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Το release δεν μπήκε στην ουρά.");
    } finally {
      setBusy(null);
    }
  }

  async function runAnalysis() {
    setBusy("analysis");
    setMessage("");
    try {
      const result = await post({ action: "run_analysis" });
      setMessage("Η σταθμισμένη ανάλυση μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η ανάλυση δεν μπήκε στην ουρά.");
    } finally {
      setBusy(null);
    }
  }

  return <div className="workspace-queue-card">
    <div className="workspace-action-bar">
      <span>
        <strong>Recruitment protocol</strong><br />
        {recruitmentTemplateVersion
          ? "Locked invitation version: " + recruitmentTemplateVersion
          : "Δεν υπάρχει ακόμη κλειδωμένη έκδοση της ερευνητικής πρόσκλησης."}
      </span>
    </div>

    {!recruitmentTemplateVersion && <div className="workspace-action-bar">
      <div style={{ width: "100%", display: "grid", gap: 10 }}>
        <label>
          <strong>Θέμα email</strong><br />
          <input
            aria-label="Research invitation subject"
            maxLength={180}
            onChange={(event) => setSubject(event.target.value)}
            type="text"
            value={subject}
          />
        </label>
        <label>
          <strong>Κείμενο πρόσκλησης</strong><br />
          <textarea
            aria-label="Research invitation body"
            onChange={(event) => setBodyText(event.target.value)}
            rows={12}
            value={bodyText}
          />
        </label>
        <div>
          <button
            className="button button-secondary"
            disabled={Boolean(busy)}
            onClick={() => void lockTemplate()}
            type="button"
          >{busy === "template" ? "Κλείδωμα…" : "Κλείδωμα έκδοσης πρόσκλησης"}</button>
        </div>
      </div>
    </div>}

    <div className="workspace-action-bar">
      <span>
        <strong>SES fieldwork</strong><br />
        {activeContacts.toLocaleString("el-GR")} contactable frame units · {completed.toLocaleString("el-GR")} ολοκληρωμένες απαντήσεις.
      </span>
      <div className="workspace-action-buttons">
        <input
          aria-label="Invitation batch size"
          inputMode="numeric"
          max={500}
          min={1}
          onChange={(event) => setBatchSize(event.target.value.replace(/[^0-9]/g, ""))}
          type="number"
          value={batchSize}
        />
        <button
          className="button"
          disabled={Boolean(busy) || workerBusy || !fielding || !recruitmentTemplateVersion || !batchValid}
          onClick={() => void sendInvites()}
          type="button"
        >{busy === "send" ? "Queueing…" : "Queue SES invitation batch"}</button>
      </div>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Participant thank-you delivery</strong><br />
        {rewardEligible.toLocaleString("el-GR")} entitlement(s) παραμένουν eligible · {rewardIssued.toLocaleString("el-GR")} issued · {rewardDeliveryFailed.toLocaleString("el-GR")} failed delivery record(s).
        Η αποστολή απαιτεί μόνο τη χωριστή επιλογή “thank-you code” και δεν διαβάζει marketing consent.
      </span>
      <button
        className="button button-secondary"
        disabled={Boolean(busy) || workerBusy || rewardEligible < 1}
        onClick={() => void deliverRewards()}
        type="button"
      >{busy === "rewards" ? "Queueing…" : "Deliver pending thank-you codes"}</button>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Analysis pipeline</strong><br />
        {pendingQualityReviews > 0
          ? `Υπάρχουν ${pendingQualityReviews} εκκρεμή quality review(s). Resolve include/exclude πριν από analysis.`
          : "Η ανάλυση τρέχει μόνο μετά το κλείσιμο fieldwork και τη μετάβαση της μελέτης σε analysis."}
      </span>
      <button
        className="button"
        disabled={Boolean(busy) || workerBusy || studyStatus !== "analysis" || pendingQualityReviews > 0}
        onClick={() => void runAnalysis()}
        type="button"
      >{busy === "analysis" ? "Queueing…" : "Run weighted analysis"}</button>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Reproducible release</strong><br />
        {latestReleaseVersion
          ? "Latest release snapshot: " + latestReleaseVersion
          : "Μετά από επιτυχημένη ανάλυση δημιουργείται frozen release με methodology, dataset hash και artifact hash."}
      </span>
      <button
        className="button"
        disabled={Boolean(busy) || workerBusy || studyStatus !== "analysis" || succeededAnalysisRuns < 1 || Boolean(latestReleaseVersion)}
        onClick={() => void buildRelease()}
        type="button"
      >{busy === "release" ? "Queueing…" : "Build release snapshot"}</button>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Published-results notification</strong><br />
        {latestReleasePublishedAt
          ? `${resultsNotificationSent.toLocaleString("el-GR")} sent · ${resultsNotificationFailed.toLocaleString("el-GR")} failed for the published release. Re-queueing is idempotent for already-sent recipients.`
          : "Η ενημέρωση ενεργοποιείται μόνο μετά την πραγματική δημοσίευση release και μόνο για όσους ζήτησαν ενημέρωση αποτελεσμάτων."}
      </span>
      <button
        className="button button-secondary"
        disabled={Boolean(busy) || workerBusy || studyStatus !== "published" || !latestReleasePublishedAt}
        onClick={() => void notifyResults()}
        type="button"
      >{busy === "results" ? "Queueing…" : "Notify opted-in participants"}</button>
    </div>

    <div className="workspace-inline-note">
      {message || (workerBusy
        ? "Υπάρχει ήδη research worker job σε αναμονή ή εκτέλεση."
        : "Τα invitation tokens δημιουργούνται μέσα στον worker και δεν αποθηκεύονται ποτέ σε plaintext. Bounces/complaints επιστρέφουν στη suppression ledger μέσω του SES SNS webhook.")}
    </div>
  </div>;
}
