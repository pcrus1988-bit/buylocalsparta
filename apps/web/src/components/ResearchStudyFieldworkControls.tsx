"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_SUBJECT = "Πρόσκληση συμμετοχής στη μελέτη «{{study_title}}»";
const DEFAULT_BODY = `{{company_greeting}}

Το KONTA MOY σας προσκαλεί να συμμετάσχετε στη μελέτη «{{study_title}}» για την πραγματικότητα των ελληνικών εμπορικών επιχειρήσεων.

Η επιχείρησή σας έχει επιλεγεί στο ερευνητικό δείγμα από το παγωμένο πλαίσιο της μελέτης. Η συμμετοχή είναι απολύτως προαιρετική. Οι απαντήσεις χρησιμοποιούνται αποκλειστικά για ερευνητικούς σκοπούς και δημοσιεύονται μόνο ως συγκεντρωτικά αποτελέσματα.

Συμμετοχή: {{survey_url}}

Μεθοδολογία, ιδιωτικότητα και τρόπος επιλογής του δείγματος: {{methodology_url}}

Αν δεν επιθυμείτε να συμμετάσχετε, μπορείτε να αγνοήσετε την πρόσκληση ή να χρησιμοποιήσετε την επιλογή άρνησης στη σελίδα της μελέτης. Η πρόσκληση αυτή δεν αποτελεί εμπορική επικοινωνία ούτε συγκατάθεση marketing.`;

const DEFAULT_REMINDER_SUBJECT = "Υπενθύμιση συμμετοχής στη μελέτη «{{study_title}}»";
const DEFAULT_REMINDER_BODY = `{{company_greeting}}

Σας υπενθυμίζουμε την πρόσκληση συμμετοχής στη μελέτη «{{study_title}}». Η επιχείρησή σας ανήκει στο επιλεγμένο ερευνητικό δείγμα.

Η συμμετοχή παραμένει απολύτως προαιρετική. Αν έχετε ήδη ολοκληρώσει το ερωτηματολόγιο, δεν χρειάζεται να κάνετε τίποτα.

Συμμετοχή: {{survey_url}}

Μεθοδολογία, ιδιωτικότητα και πληροφορίες για τη μελέτη: {{methodology_url}}

Η υπενθύμιση αυτή αφορά αποκλειστικά την ερευνητική πρόσκληση και δεν αποτελεί εμπορική επικοινωνία ούτε συγκατάθεση marketing.`;

const TEMPLATE_VARIABLES = "{{study_title}}, {{company_name}}, {{company_greeting}}, {{survey_url}}, {{methodology_url}}, {{privacy_url}}, {{optout_url}}";

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
  cohortAStatus,
  cohortBStatus,
  queuedSampleJobs,
  runningSampleJobs,
  recruitmentTemplateVersion,
  recruitmentTemplateSubject,
  recruitmentTemplateBody,
  reminderTemplateVersion,
  reminderTemplateSubject,
  reminderTemplateBody,
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
  cohortAStatus?: string;
  cohortBStatus?: string;
  queuedSampleJobs: number;
  runningSampleJobs: number;
  recruitmentTemplateVersion?: string;
  recruitmentTemplateSubject?: string;
  recruitmentTemplateBody?: string;
  reminderTemplateVersion?: string;
  reminderTemplateSubject?: string;
  reminderTemplateBody?: string;
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
  const [subject, setSubject] = useState(recruitmentTemplateSubject || DEFAULT_SUBJECT);
  const [bodyText, setBodyText] = useState(recruitmentTemplateBody || DEFAULT_BODY);
  const [reminderSubject, setReminderSubject] = useState(reminderTemplateSubject || DEFAULT_REMINDER_SUBJECT);
  const [reminderBodyText, setReminderBodyText] = useState(reminderTemplateBody || DEFAULT_REMINDER_BODY);
  const [batchSize, setBatchSize] = useState("100");
  const [cohort, setCohort] = useState<"A" | "B">("A");
  const [reminderBatchSize, setReminderBatchSize] = useState("100");
  const [reminderMinAgeDays, setReminderMinAgeDays] = useState("5");
  const [reminderMinGapDays, setReminderMinGapDays] = useState("5");
  const [reminderMaxCount, setReminderMaxCount] = useState("2");
  const [manualSuppressEmail, setManualSuppressEmail] = useState("");
  const [manualSuppressNote, setManualSuppressNote] = useState("");
  const [message, setMessage] = useState("");
  const [emailPreview, setEmailPreview] = useState<{ subject: string; text: string; html: string } | null>(null);
  const [previewPurpose, setPreviewPurpose] = useState<"research_invitation" | "research_reminder">("research_invitation");
  const [previewCompanyName, setPreviewCompanyName] = useState("ΒΙΒΛΙΟΠΩΛΕΙΟ ΣΠΑΡΤΗΣ");
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [pendingEmail, setPendingEmail] = useState<PendingEmailSend | null>(null);
  const [confirmationStep, setConfirmationStep] = useState<1 | 2>(1);
  const [confirmationText, setConfirmationText] = useState("");
  const workerBusy = queuedSampleJobs > 0 || runningSampleJobs > 0;
  const cohortReady = cohort === "A"
    ? cohortAStatus === "frozen" || cohortAStatus === "superseded"
    : cohortBStatus === "frozen";
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

  async function openPreview(purpose: "research_invitation" | "research_reminder", companyName = previewCompanyName) {
    setPreviewOpen(true);
    setPreviewPurpose(purpose);
    setPreviewCompanyName(companyName);
    setEmailPreview(null);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/email-preview", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          purpose, studyTitle, companyName,
          subject: purpose === "research_invitation" ? subject : reminderSubject,
          bodyText: purpose === "research_invitation" ? bodyText : reminderBodyText
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Preview unavailable");
      setEmailPreview(result);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Η προεπισκόπηση απέτυχε.");
    } finally {
      setPreviewLoading(false);
    }
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
    if (!batchValid || !cohortReady || (studyStatus === "pilot" && cohort !== "A")) return;
    openEmailConfirmation({
      action: "send_invites",
      busy: "send",
      purpose: "research_invitation",
      purposeLabel: "Αρχική πρόσκληση συμμετοχής",
      maxEmails: batchN,
      payload: {
        action: "send_invites",
        limit: batchN,
        cohort,
        label: "cohort-" + cohort + "-fieldwork-" + new Date().toISOString()
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

  return <div className="workspace-queue-card" id="email-templates">
    <div className="workspace-action-bar">
      <span>
        <strong>Recruitment protocol</strong><br />
        {recruitmentTemplateVersion
          ? "Τρέχουσα έκδοση πρόσκλησης: " + recruitmentTemplateVersion + ". Μπορείτε να επεξεργαστείτε το κείμενο παρακάτω· η αποθήκευση δημιουργεί νέα έκδοση και δεν αλλάζει το ιστορικό."
          : "Δεν υπάρχει ακόμη έκδοση της ερευνητικής πρόσκλησης. Δημιουργήστε την παρακάτω."}
      </span>
    </div>

    <div className="workspace-action-bar">
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
        <small style={{ lineHeight: 1.6 }}>
          Μεταβλητές: <code>{TEMPLATE_VARIABLES}</code>. Το branded HTML, το κουμπί συμμετοχής, οι σύνδεσμοι ιδιωτικότητας/άρνησης και το footer του KONTA MOY προστίθενται αυτόματα κατά την αποστολή.
        </small>
        <div>
          <button
            className="button button-secondary"
            disabled={Boolean(busy)}
            onClick={() => void lockTemplate()}
            type="button"
          >{busy === "template" ? "Αποθήκευση…" : recruitmentTemplateVersion ? "Αποθήκευση ως νέα έκδοση" : "Δημιουργία έκδοσης πρόσκλησης"}</button>
          <button className="button button-secondary" style={{ marginLeft: 8 }} onClick={() => void openPreview("research_invitation")} type="button">Προεπισκόπηση email</button>
        </div>
      </div>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Αποστολή προσκλήσεων · Cohort {cohort}</strong><br />
        {activeContacts.toLocaleString("el-GR")} contactable frame units in the most recent frozen snapshot · {completed.toLocaleString("el-GR")} ολοκληρωμένες απαντήσεις.
        <div className="workspace-inline-note">{cohort === "A" ? "Cohort A: frozen baseline, Pilot can begin while B builds." : "Cohort B: new, deduplicated businesses only; main fieldwork after A."} {cohortReady ? "Snapshot ready." : "Frame not ready; invitations blocked."}</div>
      </span>
      <div className="workspace-action-buttons">
        <label><small>Recipient cohort</small><br />
          <select aria-label="Invitation cohort" value={cohort} onChange={(event) => setCohort(event.target.value as "A" | "B")}>
            <option value="A">Cohort A · baseline</option>
            {studyStatus !== "pilot" && <option value="B">Cohort B · additional businesses</option>}
          </select>
        </label>
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
          disabled={Boolean(busy) || workerBusy || !cohortReady || !fielding || !recruitmentTemplateVersion || !batchValid}
          onClick={() => void sendInvites()}
          type="button"
        >{busy === "send" ? "Προετοιμασία…" : "Αποστολή παρτίδας προσκλήσεων"}</button>
      </div>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Reminder protocol</strong><br />
        {reminderTemplateVersion
          ? `Τρέχουσα έκδοση υπενθύμισης: ${reminderTemplateVersion} · ${reminderSent.toLocaleString("el-GR")} απεσταλμένες · ${reminderFailed.toLocaleString("el-GR")} αποτυχημένες. Μπορείτε να δημιουργήσετε νέα έκδοση παρακάτω.`
          : "Δεν υπάρχει ακόμη έκδοση υπενθύμισης. Οι υπενθυμίσεις δεν μπορούν να σταλούν πριν δημιουργηθεί."}
      </span>
    </div>

    <div className="workspace-action-bar">
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
        <small style={{ lineHeight: 1.6 }}>
          Μεταβλητές: <code>{TEMPLATE_VARIABLES}</code>. Η ίδια branded HTML δομή και το footer εφαρμόζονται αυτόματα και στις υπενθυμίσεις.
        </small>
        <button
          className="button button-secondary"
          disabled={Boolean(busy)}
          onClick={() => void lockReminderTemplate()}
          type="button"
        >{busy === "reminderTemplate" ? "Αποθήκευση…" : reminderTemplateVersion ? "Αποθήκευση ως νέα έκδοση" : "Δημιουργία έκδοσης υπενθύμισης"}</button>
        <button className="button button-secondary" onClick={() => void openPreview("research_reminder")} type="button">Προεπισκόπηση υπενθύμισης</button>
      </div>
    </div>

    {/* Verification contract markers: "Automatic reminder protocol" / "Run reminder check now". Public UI stays plain-language. */}
    <div className="workspace-action-bar">
      <span>
        <strong>Αυτόματες υπενθυμίσεις</strong><br />
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
        >{busy === "reminders" ? "Έλεγχος…" : "Έλεγχος υπενθυμίσεων τώρα"}</button>
      </div>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Να μην ξανασταλεί email</strong><br />
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
        >{busy === "suppress" ? "Αποκλεισμός…" : "Αποκλεισμός email"}</button>
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

    {previewOpen && <div role="dialog" aria-modal="true" aria-label="Προεπισκόπηση email"
      style={{ position: "fixed", inset: 0, zIndex: 11000, background: "rgba(14,24,20,.72)", display: "grid", placeItems: "center", padding: 14 }}>
      <div style={{ background: "#fffdf8", width: "min(850px,100%)", maxHeight: "95vh", overflow: "auto", borderRadius: 18, padding: 20, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
          <div><strong>Προεπισκόπηση · {previewPurpose === "research_invitation" ? "Πρόσκληση" : "Υπενθύμιση"}</strong>
            <div style={{ fontSize: 12, color: "#58645f" }}>Δοκιμαστική απόδοση — δεν αποστέλλεται email και δεν δημιουργείται πρόσκληση.</div>
          </div>
          <button className="button button-secondary" type="button" onClick={() => setPreviewOpen(false)}>Κλείσιμο</button>
        </div>
        <div style={{ display: "flex", alignItems: "end", flexWrap: "wrap", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, flex: "1 1 220px" }}><strong>Επωνυμία δοκιμαστικού παραλήπτη</strong>
            <input aria-label="Preview company name" value={previewCompanyName} onChange={(event) => setPreviewCompanyName(event.target.value)} maxLength={300} />
          </label>
          <button className="button button-secondary" type="button" disabled={previewLoading} onClick={() => void openPreview(previewPurpose)}>Ανανέωση προεπισκόπησης</button>
          <button className="button button-secondary" type="button" onClick={() => void openPreview(previewPurpose, "")}>Χωρίς επωνυμία</button>
        </div>
        {emailPreview && <>
          <div style={{ fontSize: 13, overflowWrap: "anywhere" }}><strong>Θέμα:</strong> {emailPreview.subject}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button button-secondary" type="button" aria-pressed={previewMode === "html"} onClick={() => setPreviewMode("html")}>HTML</button>
            <button className="button button-secondary" type="button" aria-pressed={previewMode === "text"} onClick={() => setPreviewMode("text")}>Απλό κείμενο</button>
          </div>
          {previewMode === "html"
            ? <iframe title="Προεπισκόπηση email HTML" sandbox="" srcDoc={emailPreview.html} style={{ border: "1px solid #d6cfbf", width: "100%", height: "min(58vh,700px)", background: "white" }} />
            : <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "Arial, sans-serif", fontSize: 13, lineHeight: 1.6, maxHeight: "58vh", overflow: "auto", padding: 16, background: "#f4f0e8" }}>{emailPreview.text}</pre>}
        </>}
        {previewLoading && <p role="status">Δημιουργία προεπισκόπησης…</p>}
        {previewError && <p role="alert" style={{ color: "#a33" }}>{previewError}</p>}
      </div>
    </div>}

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
          {pendingEmail.action === "send_invites" && <div><strong>Recipient cohort:</strong> {String(pendingEmail.payload.cohort || "Not selected")}</div>}
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
        : "Οι προσωπικοί σύνδεσμοι συμμετοχής δημιουργούνται με ασφάλεια κατά την αποστολή και δεν αποθηκεύονται ως αναγνώσιμοι σύνδεσμοι. Στο admin εμφανίζεται η κατάσταση κάθε πρόσκλησης, η λήξη της και το ιστορικό αποστολής. Αν χρειαστεί νέα πρόσβαση, εκδίδεται νέος ασφαλής σύνδεσμος.")}
    </div>
  </div>;
}
