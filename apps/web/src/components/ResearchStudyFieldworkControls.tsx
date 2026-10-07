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

type Busy = "template" | "reminderTemplate" | "send" | "reminders" | "suppress" | "rewards" | "analysis" | "release" | "results" | null;

type EmailPurpose = "research_invitation" | "research_reminder" | "thank_you_code" | "results_notification";

type PendingEmailSend = Readonly<{
  action: "send_invites" | "send_reminders" | "deliver_rewards" | "notify_results";
  busy: "send" | "reminders" | "rewards" | "results";
  purpose: EmailPurpose;
  purposeLabel: string;
  maxEmails: number;
  payload: Record<string, unknown>;
}>;

export function ResearchStudyFieldworkControls({
  slug,
  studyTitle,
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
  studyTitle: string;
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
  const [manualSuppressEmail, setManualSuppressEmail] = useState("");
  const [manualSuppressNote, setManualSuppressNote] = useState("");
  const [message, setMessage] = useState("");
  const [pendingEmail, setPendingEmail] = useState<PendingEmailSend | null>(null);
  const [confirmationStep, setConfirmationStep] = useState<1 | 2>(1);
  const [confirmationText, setConfirmationText] = useState("");
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

  function openEmailConfirmation(input: PendingEmailSend) {
    setMessage("");
    setPendingEmail(input);
    setConfirmationStep(1);
    setConfirmationText("");
  }

  function closeEmailConfirmation() {
    if (busy) return;
    setPendingEmail(null);
    setConfirmationStep(1);
    setConfirmationText("");
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
        label: "manual-reminder-check-" + new Date().toISOString()
      });
      setMessage("Ο χειροκίνητος έλεγχος υπενθυμίσεων μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      router.refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Ο έλεγχος υπενθυμίσεων δεν μπήκε στην ουρά.";
      setMessage(raw === "RESEARCH_EMAIL_DELIVERY_DISABLED"
        ? "Η ερευνητική αποστολή SES είναι απενεργοποιημένη."
        : raw);
    } finally {
      setBusy(null);
    }
  }

  async function suppressContact() {
    const email = manualSuppressEmail.trim().toLowerCase();
    if (!email) return;
    setBusy("suppress");
    setMessage("");
    try {
      const result = await post({
        action: "suppress_contact",
        email,
        note: manualSuppressNote
      });
      setMessage(
        "Η διεύθυνση αποκλείστηκε από ερευνητικές αποστολές. " +
        String(result.matchedContacts || 0) + " εγγραφή(ές) επαφής · " +
        String(result.suppressedInvites || 0) + " ενεργή(ές) πρόσκληση(εις) έκλεισαν."
      );
      setManualSuppressEmail("");
      setManualSuppressNote("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατός ο αποκλεισμός της διεύθυνσης.");
    } finally {
      setBusy(null);
    }
  }

  function sendInvites() {
    if (!batchValid) return;
    openEmailConfirmation({
      action: "send_invites",
      busy: "send",
      purpose: "research_invitation",
      purposeLabel: "Αρχική πρόσκληση συμμετοχής",
      maxEmails: batchN,
      payload: {
        action: "send_invites",
        limit: batchN,
        label: "fieldwork-" + new Date().toISOString()
      }
    });
  }

  function deliverRewards() {
    const maxEmails = Math.max(1, Math.min(100, rewardEligible));
    openEmailConfirmation({
      action: "deliver_rewards",
      busy: "rewards",
      purpose: "thank_you_code",
      purposeLabel: "Αποστολή κωδικού ευχαριστίας",
      maxEmails,
      payload: {
        action: "deliver_rewards",
        limit: maxEmails,
        label: "reward-delivery-" + new Date().toISOString()
      }
    });
  }

  function notifyResults() {
    openEmailConfirmation({
      action: "notify_results",
      busy: "results",
      purpose: "results_notification",
      purposeLabel: "Ενημέρωση δημοσίευσης αποτελεσμάτων",
      maxEmails: 100,
      payload: {
        action: "notify_results",
        limit: 100,
        label: "results-notification-" + new Date().toISOString()
      }
    });
  }

  async function confirmEmailSend() {
    if (!pendingEmail || confirmationStep !== 2) return;
    if (confirmationText.trim() !== String(pendingEmail.maxEmails)) return;
    setBusy(pendingEmail.busy);
    setMessage("");
    try {
      const result = await post({
        ...pendingEmail.payload,
        emailApproval: {
          studySlug: slug,
          studyTitle,
          purpose: pendingEmail.purpose,
          maxEmails: pendingEmail.maxEmails,
          reviewConfirmed: true,
          finalConfirmed: true
        }
      });
      if (pendingEmail.action === "send_invites") {
        setMessage("Η παρτίδα προσκλήσεων μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      } else if (pendingEmail.action === "send_reminders") {
        setMessage("Η παρτίδα υπενθυμίσεων μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      } else if (pendingEmail.action === "deliver_rewards") {
        setMessage("Η αποστολή κωδικών ευχαριστίας μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      } else {
        setMessage("Η ενημέρωση δημοσιευμένων αποτελεσμάτων μπήκε στην ουρά. Job " + String(result.jobId || "") + ".");
      }
      setPendingEmail(null);
      setConfirmationStep(1);
      setConfirmationText("");
      router.refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Η αποστολή email δεν μπήκε στην ουρά.";
      setMessage(raw === "RESEARCH_EMAIL_DELIVERY_DISABLED"
        ? "Η ερευνητική αποστολή SES είναι απενεργοποιημένη. Ενεργοποιήστε ρητά το BLS_RESEARCH_EMAIL_DELIVERY_ENABLED."
        : raw === "RESEARCH_EMAIL_DOUBLE_CONFIRMATION_REQUIRED"
          ? "Η αποστολή απορρίφθηκε επειδή δεν ολοκληρώθηκε η διπλή επιβεβαίωση."
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
        <strong>Automatic reminder protocol</strong><br />
        Οι υπενθυμίσεις ελέγχονται αυτόματα από το Research cron. Προεπιλογή: πρώτη υπενθύμιση μετά από 5 ημέρες, ελάχιστο διάστημα 5 ημερών και έως 2 υπενθυμίσεις. Δεν αποστέλλεται υπενθύμιση σε ολοκληρωμένη/ανακληθείσα συμμετοχή, opt-out, bounce ή complaint. Τα πεδία δεξιά χρησιμοποιούνται μόνο για χειροκίνητο έκτακτο έλεγχο.
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
        >{busy === "reminders" ? "Έλεγχος…" : "Run reminder check now"}</button>
      </div>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Manual research contact suppression</strong><br />
        Χρησιμοποιήστε το όταν κάποιος ζητήσει να μη λάβει άλλη ερευνητική επικοινωνία. Η διεύθυνση δεν διαγράφεται από το ιστορικό evidence εκείνη τη στιγμή· αποκλείεται άμεσα από όλες τις επόμενες ερευνητικές αποστολές και καταγράφεται append-only suppression event.
      </span>
      <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
        <input
          aria-label="Email to suppress from research"
          onChange={(event) => setManualSuppressEmail(event.target.value)}
          placeholder="email@example.gr"
          type="email"
          value={manualSuppressEmail}
        />
        <input
          aria-label="Research suppression note"
          onChange={(event) => setManualSuppressNote(event.target.value)}
          placeholder="Αιτία / σημείωση (προαιρετικό)"
          type="text"
          value={manualSuppressNote}
        />
        <button
          className="button button-secondary"
          disabled={Boolean(busy) || !manualSuppressEmail.trim()}
          onClick={() => void suppressContact()}
          type="button"
        >{busy === "suppress" ? "Αποκλεισμός…" : "Suppress research email"}</button>
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

    {pendingEmail && <div
      aria-modal="true"
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(14, 24, 20, 0.68)",
        display: "grid",
        placeItems: "center",
        padding: 20
      }}
    >
      <div style={{
        width: "min(620px, 100%)",
        maxHeight: "90vh",
        overflow: "auto",
        background: "var(--surface, #fffdf8)",
        borderRadius: 20,
        padding: 24,
        boxShadow: "0 24px 80px rgba(0,0,0,.28)",
        display: "grid",
        gap: 18
      }}>
        <div>
          <small style={{ fontWeight: 800, letterSpacing: ".08em" }}>
            ΑΠΟΣΤΟΛΗ EMAIL · ΕΠΙΒΕΒΑΙΩΣΗ {confirmationStep}/2
          </small>
          <h2 style={{ margin: "8px 0 0" }}>
            {confirmationStep === 1 ? "Έλεγχος πριν από την αποστολή" : "Τελική επιβεβαίωση"}
          </h2>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div><strong>Μελέτη:</strong> {studyTitle}</div>
          <div><strong>Σκοπός:</strong> {pendingEmail.purposeLabel}</div>
          <div>
            <strong>Μέγιστος αριθμός email αυτής της παρτίδας:</strong>{" "}
            {pendingEmail.maxEmails.toLocaleString("el-GR")}
          </div>
          <div>
            <strong>Αυτόματη επόμενη παρτίδα:</strong>{" "}
            {pendingEmail.purpose === "research_invitation"
              ? "Όχι για νέες προσκλήσεις. Οι προβλεπόμενες υπενθυμίσεις μπορούν να ακολουθήσουν αυτόματα μόνο για μη απαντημένους, ενεργούς και μη αποκλεισμένους παραλήπτες."
              : "Όχι. Κάθε νέα παρτίδα αυτού του τύπου απαιτεί νέα διπλή επιβεβαίωση."}
          </div>
        </div>

        {confirmationStep === 1 ? <>
          <div className="workspace-inline-note">
            Ελέγξτε τη μελέτη, τον σκοπό και το ανώτατο πλήθος παραληπτών. Κανένα email δεν μπαίνει στην ουρά σε αυτό το βήμα.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="button button-secondary" onClick={closeEmailConfirmation} type="button">
              Ακύρωση
            </button>
            <button className="button" onClick={() => setConfirmationStep(2)} type="button">
              Επιβεβαίωση 1 · Τα έλεγξα
            </button>
          </div>
        </> : <>
          <label style={{ display: "grid", gap: 8 }}>
            <strong>
              Για την τελική επιβεβαίωση, πληκτρολογήστε {pendingEmail.maxEmails.toLocaleString("el-GR")}
            </strong>
            <input
              aria-label="Final research email confirmation count"
              autoFocus
              inputMode="numeric"
              onChange={(event) => setConfirmationText(event.target.value.replace(/[^0-9]/g, ""))}
              type="text"
              value={confirmationText}
            />
          </label>
          <div className="workspace-inline-note">
            Με την τελική επιβεβαίωση εγκρίνετε μόνο αυτή την παρτίδα και έως το παραπάνω πλήθος email.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              className="button button-secondary"
              disabled={Boolean(busy)}
              onClick={() => {
                setConfirmationStep(1);
                setConfirmationText("");
              }}
              type="button"
            >
              Πίσω
            </button>
            <button
              className="button"
              disabled={Boolean(busy) || confirmationText.trim() !== String(pendingEmail.maxEmails)}
              onClick={() => void confirmEmailSend()}
              type="button"
            >
              {busy ? "Αποστολή στην ουρά…" : "Επιβεβαίωση 2 · Έγκριση αποστολής"}
            </button>
          </div>
        </>}
      </div>
    </div>}

    <div className="workspace-inline-note">
      {message || (workerBusy
        ? "Υπάρχει ήδη research worker job σε αναμονή ή εκτέλεση."
        : "Τα invitation/reminder tokens δημιουργούνται μέσα στον worker και δεν αποθηκεύονται ποτέ σε plaintext. Οι υπενθυμίσεις επαναχρησιμοποιούν το ίδιο canonical invite και καταγράφονται ως ξεχωριστά contact attempts. Bounces/complaints επιστρέφουν στη suppression ledger μέσω του SES SNS webhook.")}
    </div>
  </div>;
}
