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

const DEFAULT_REMINDER_SUBJECT = "Υπενθύμιση συμμετοχής στη μελέτη «Ελληνικό Λιανεμπόριο 2026»";
const DEFAULT_REMINDER_BODY = `Καλησπέρα,

Σας υπενθυμίζουμε την προαιρετική πρόσκληση συμμετοχής στη μελέτη «{{study_title}}». Αν έχετε ήδη ξεκινήσει, ο προσωπικός σύνδεσμος σας επιστρέφει στην ίδια απάντηση· δεν δημιουργεί δεύτερη συμμετοχή.

{{survey_url}}

Μεθοδολογία και πληροφορίες επεξεργασίας:
{{methodology_url}}

Δεν θα αποσταλούν περισσότερες υπενθυμίσεις από το προκαθορισμένο όριο της μελέτης. Η συμμετοχή ή μη συμμετοχή δεν επηρεάζει οποιαδήποτε εμπορική σχέση με το KONTA MOY.`;

type Busy = "template" | "reminderTemplate" | "send" | "reminders" | "rewards" | "analysis" | "release" | "results" | null;

export function ResearchStudyFieldworkControls({
  slug,
  csrfToken,
  studyStatus,
  recruitmentTemplateVersion,
  reminderTemplateVersion,
  reminderSent,
  reminderFailed,
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
  reminderTemplateVersion?: string;
  reminderSent: number;
  reminderFailed: number;
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
  const [reminderSubject, setReminderSubject] = useState(DEFAULT_REMINDER_SUBJECT);
  const [reminderBodyText, setReminderBodyText] = useState(DEFAULT_REMINDER_BODY);
  const [batchSize, setBatchSize] = useState("100");
  const [reminderBatchSize, setReminderBatchSize] = useState("100");
  const [reminderMinAgeDays, setReminderMinAgeDays] = useState("5");
  const [reminderMinGapDays, setReminderMinGapDays] = useState("5");
  const [reminderMaxCount, setReminderMaxCount] = useState("2");
  const [message, setMessage] = useState("");
  const workerBusy = queuedJobs > 0 || runningJobs > 0;
  const batchN = Number(batchSize);
  const batchValid = Number.isSafeInteger(batchN) && batchN >= 1 && batchN <= 500;
  const reminderBatchN = Number(reminderBatchSize);
  const reminderAgeN = Number(reminderMinAgeDays);
  const reminderGapN = Number(reminderMinGapDays);
  const reminderMaxN = Number(reminderMaxCount);
  const reminderValid =
    Number.isSafeInteger(reminderBatchN) && reminderBatchN >= 1 && reminderBatchN <= 500 &&
    Number.isSafeInteger(reminderAgeN) && reminderAgeN >= 1 && reminderAgeN <= 90 &&
    Number.isSafeInteger(reminderGapN) && reminderGapN >= 1 && reminderGapN <= 90 &&
    Number.isSafeInteger(reminderMaxN) && reminderMaxN >= 1 && reminderMaxN <= 5;
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
        purpose: "research_invitation",
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

  async function lockReminderTemplate() {
    setBusy("reminderTemplate");
    setMessage("");
    try {
      const result = await post({
        action: "save_recruitment_template",
        purpose: "research_reminder",
        subject: reminderSubject,
        bodyText: reminderBodyText
      });
      setMessage("Η έκδοση υπενθύμισης κλειδώθηκε: " + String(result.version || ""));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η υπενθύμιση δεν αποθηκεύτηκε.");
    } finally {
      setBusy(null);
    }
  }

  async function sendReminders() {
    if (!reminderValid) return;
    setBusy("reminders");
    setMessage("");
    try {
      const result = await post({
        action: "send_reminders",
        limit: reminderBatchN,
        minAgeDays: reminderAgeN,
        minGapDays: reminderGapN,
        maxReminders: reminderMaxN,
        label: "fieldwork-reminder-" + new Date().toISOString()
      });
      setMessage("Η παρτίδα υπενθυμίσεων μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      router.refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Η υπενθύμιση δεν μπήκε στην ουρά.";
      setMessage(raw === "RESEARCH_EMAIL_DELIVERY_DISABLED"
        ? "Η ερευνητική αποστολή SES είναι απενεργοποιημένη. Ενεργοποιήστε ρητά το BLS_RESEARCH_EMAIL_DELIVERY_ENABLED."
        : raw);
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
        <strong>Reminder protocol</strong><br />
        {reminderTemplateVersion
          ? `Locked reminder version: ${reminderTemplateVersion} · ${reminderSent.toLocaleString("el-GR")} sent · ${reminderFailed.toLocaleString("el-GR")} failed.`
          : "Δεν υπάρχει κλειδωμένη έκδοση υπενθύμισης. Οι υπενθυμίσεις δεν μπορούν να σταλούν χωρίς ξεχωριστό versioned template."}
      </span>
    </div>

    {!reminderTemplateVersion && <div className="workspace-action-bar">
      <div style={{ width: "100%", display: "grid", gap: 10 }}>
        <label>
          <strong>Θέμα υπενθύμισης</strong><br />
          <input
            aria-label="Research reminder subject"
            maxLength={180}
            onChange={(event) => setReminderSubject(event.target.value)}
            type="text"
            value={reminderSubject}
          />
        </label>
        <label>
          <strong>Κείμενο υπενθύμισης</strong><br />
          <textarea
            aria-label="Research reminder body"
            onChange={(event) => setReminderBodyText(event.target.value)}
            rows={10}
            value={reminderBodyText}
          />
        </label>
        <button
          className="button button-secondary"
          disabled={Boolean(busy)}
          onClick={() => void lockReminderTemplate()}
          type="button"
        >{busy === "reminderTemplate" ? "Κλείδωμα…" : "Κλείδωμα έκδοσης υπενθύμισης"}</button>
      </div>
    </div>}

    <div className="workspace-action-bar">
      <span>
        <strong>Governed reminders</strong><br />
        Ο ίδιος canonical invite/response παραμένει ενεργός. Κάθε email παίρνει νέο opaque token hash και καταγράφεται ως contact attempt, χωρίς να αυξάνει τον αριθμό των invitations ή το response-rate denominator.
      </span>
      <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
        <label>
          <small>Batch</small><br />
          <input
            aria-label="Reminder batch size"
            inputMode="numeric"
            max={500}
            min={1}
            onChange={(event) => setReminderBatchSize(event.target.value.replace(/[^0-9]/g, ""))}
            type="number"
            value={reminderBatchSize}
          />
        </label>
        <label>
          <small>First after days</small><br />
          <input
            aria-label="Reminder minimum invitation age days"
            inputMode="numeric"
            max={90}
            min={1}
            onChange={(event) => setReminderMinAgeDays(event.target.value.replace(/[^0-9]/g, ""))}
            type="number"
            value={reminderMinAgeDays}
          />
        </label>
        <label>
          <small>Gap days</small><br />
          <input
            aria-label="Reminder minimum gap days"
            inputMode="numeric"
            max={90}
            min={1}
            onChange={(event) => setReminderMinGapDays(event.target.value.replace(/[^0-9]/g, ""))}
            type="number"
            value={reminderMinGapDays}
          />
        </label>
        <label>
          <small>Max reminders</small><br />
          <input
            aria-label="Maximum reminders per invite"
            inputMode="numeric"
            max={5}
            min={1}
            onChange={(event) => setReminderMaxCount(event.target.value.replace(/[^0-9]/g, ""))}
            type="number"
            value={reminderMaxCount}
          />
        </label>
        <button
          className="button button-secondary"
          disabled={Boolean(busy) || workerBusy || !fielding || !reminderTemplateVersion || !reminderValid}
          onClick={() => void sendReminders()}
          type="button"
        >{busy === "reminders" ? "Queueing…" : "Queue reminder batch"}</button>
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
        : "Τα invitation/reminder tokens δημιουργούνται μέσα στον worker και δεν αποθηκεύονται ποτέ σε plaintext. Οι υπενθυμίσεις επαναχρησιμοποιούν το ίδιο canonical invite και καταγράφονται ως ξεχωριστά contact attempts. Bounces/complaints επιστρέφουν στη suppression ledger μέσω του SES SNS webhook.")}
    </div>
  </div>;
}
