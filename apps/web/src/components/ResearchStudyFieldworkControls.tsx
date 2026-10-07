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

Η συμμετοχή ή μη συμμετοχή σας δεν επηρεάζει οποιαδήποτε εμπορική σχέση με το KONTA MOY. Οι επιλογές για ενημέρωση αποτελεσμάτων και κωδικό ευχαριστίας είναι ξεχωριστές από τη συγκατάθεση συμμετοχής στην έρευνα.`;

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
  studyTitle,
  studyStatus,
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
  canAnalyze,
  canPublish,
  queuedJobs,
  runningJobs
}: {
  slug: string;
  csrfToken: string;
  studyTitle: string;
  studyStatus: string;
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
  canAnalyze: boolean;
  canPublish: boolean;
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

  async function confirmBulkEmail(input: {
    purpose: "initial_invitations" | "reminders" | "thank_you_codes" | "published_results";
    purposeLabel: string;
    limit: number;
    minAgeDays?: number;
    minGapDays?: number;
    maxReminders?: number;
  }): Promise<number | undefined> {
    const preview = await post({
      action: "preview_email_send",
      emailPurpose: input.purpose,
      limit: input.limit,
      minAgeDays: input.minAgeDays,
      minGapDays: input.minGapDays,
      maxReminders: input.maxReminders
    });
    const candidateCount = Number(preview.candidateCount || 0);
    if (!Number.isSafeInteger(candidateCount) || candidateCount < 1) {
      setMessage("Δεν υπάρχουν επιλέξιμοι παραλήπτες για αυτή την αποστολή.");
      return undefined;
    }

    const firstConfirmed = window.confirm(
      "ΕΠΙΒΕΒΑΙΩΣΗ ΑΠΟΣΤΟΛΗΣ EMAIL\n\n" +
      "Μελέτη: " + studyTitle + "\n" +
      "Σκοπός: " + input.purposeLabel + "\n" +
      "Emails που θα μπουν στην παρτίδα: " + candidateCount.toLocaleString("el-GR") + "\n\n" +
      "Επιβεβαιώνετε ότι θέλετε να προχωρήσετε;"
    );
    if (!firstConfirmed) return undefined;

    const finalConfirmed = window.confirm(
      "ΤΕΛΙΚΗ ΕΠΙΒΕΒΑΙΩΣΗ\n\n" +
      "Μελέτη: " + studyTitle + "\n" +
      "Σκοπός: " + input.purposeLabel + "\n" +
      "Ακριβής αριθμός emails: " + candidateCount.toLocaleString("el-GR") + "\n\n" +
      "Με OK η παρτίδα θα προστεθεί στην ουρά αποστολής."
    );
    return finalConfirmed ? candidateCount : undefined;
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
      setMessage("Η νέα έκδοση πρόσκλησης αποθηκεύτηκε και κλειδώθηκε: " + String(result.version || ""));
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
      setMessage("Η νέα έκδοση υπενθύμισης αποθηκεύτηκε και κλειδώθηκε: " + String(result.version || ""));
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
      const confirmedRecipientCount = await confirmBulkEmail({
        purpose: "reminders",
        purposeLabel: "Υπενθύμιση συμμετοχής",
        limit: reminderBatchN,
        minAgeDays: reminderAgeN,
        minGapDays: reminderGapN,
        maxReminders: reminderMaxN
      });
      if (!confirmedRecipientCount) return;
      const result = await post({
        action: "send_reminders",
        limit: reminderBatchN,
        minAgeDays: reminderAgeN,
        minGapDays: reminderGapN,
        maxReminders: reminderMaxN,
        label: "fieldwork-reminder-" + new Date().toISOString(),
        confirmedEmailSend: true,
        confirmedRecipientCount,
        confirmedEmailPurpose: "reminders",
        confirmedSurveySlug: slug
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
      const confirmedRecipientCount = await confirmBulkEmail({
        purpose: "initial_invitations",
        purposeLabel: "Αρχική πρόσκληση συμμετοχής",
        limit: batchN
      });
      if (!confirmedRecipientCount) return;
      const result = await post({
        action: "send_invites",
        limit: batchN,
        label: "fieldwork-" + new Date().toISOString(),
        confirmedEmailSend: true,
        confirmedRecipientCount,
        confirmedEmailPurpose: "initial_invitations",
        confirmedSurveySlug: slug
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
      const confirmedRecipientCount = await confirmBulkEmail({
        purpose: "thank_you_codes",
        purposeLabel: "Αποστολή κωδικού ευχαριστίας",
        limit: 100
      });
      if (!confirmedRecipientCount) return;
      const result = await post({
        action: "deliver_rewards",
        limit: 100,
        label: "reward-delivery-" + new Date().toISOString(),
        confirmedEmailSend: true,
        confirmedRecipientCount,
        confirmedEmailPurpose: "thank_you_codes",
        confirmedSurveySlug: slug
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
      const confirmedRecipientCount = await confirmBulkEmail({
        purpose: "published_results",
        purposeLabel: "Ενημέρωση δημοσιευμένων αποτελεσμάτων",
        limit: 100
      });
      if (!confirmedRecipientCount) return;
      const result = await post({
        action: "notify_results",
        limit: 100,
        label: "results-notification-" + new Date().toISOString(),
        confirmedEmailSend: true,
        confirmedRecipientCount,
        confirmedEmailPurpose: "published_results",
        confirmedSurveySlug: slug
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

  return <div className="workspace-queue-card" id={"research-email-" + slug}>
    <div className="workspace-action-bar">
      <span>
        <strong>Email templates · Πρόσκληση</strong><br />
        {recruitmentTemplateVersion
          ? "Τρέχουσα κλειδωμένη έκδοση: " + recruitmentTemplateVersion + ". Μπορείτε να επεξεργαστείτε το κείμενο παρακάτω και να αποθηκεύσετε νέα έκδοση."
          : "Δεν υπάρχει ακόμη κλειδωμένη έκδοση της ερευνητικής πρόσκλησης."}
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
        <div>
          <button
            className="button button-secondary"
            disabled={Boolean(busy)}
            onClick={() => void lockTemplate()}
            type="button"
          >{busy === "template" ? "Αποθήκευση…" : recruitmentTemplateVersion ? "Αποθήκευση νέας έκδοσης πρόσκλησης" : "Αποθήκευση πρώτης έκδοσης πρόσκλησης"}</button>
        </div>
      </div>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Αποστολή προσκλήσεων</strong><br />
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
        >{busy === "send" ? "Προετοιμασία…" : "Αποστολή παρτίδας προσκλήσεων"}</button>
      </div>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Email templates · Υπενθύμιση</strong><br />
        {reminderTemplateVersion
          ? `Τρέχουσα κλειδωμένη έκδοση: ${reminderTemplateVersion} · ${reminderSent.toLocaleString("el-GR")} απεσταλμένα · ${reminderFailed.toLocaleString("el-GR")} αποτυχημένα. Μπορείτε να δημιουργήσετε νέα έκδοση παρακάτω.`
          : "Δεν υπάρχει κλειδωμένη έκδοση υπενθύμισης. Οι υπενθυμίσεις δεν μπορούν να σταλούν χωρίς ξεχωριστό template."}
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
        <button
          className="button button-secondary"
          disabled={Boolean(busy)}
          onClick={() => void lockReminderTemplate()}
          type="button"
        >{busy === "reminderTemplate" ? "Αποθήκευση…" : reminderTemplateVersion ? "Αποθήκευση νέας έκδοσης υπενθύμισης" : "Αποθήκευση πρώτης έκδοσης υπενθύμισης"}</button>
      </div>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Υπενθυμίσεις συμμετοχής</strong><br />
        Κάθε υπενθύμιση επιστρέφει στην ίδια συμμετοχή και δεν δημιουργεί δεύτερη απάντηση. Ο ακριβής αριθμός παραληπτών εμφανίζεται πριν από την υποχρεωτική διπλή επιβεβαίωση.
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
        >{busy === "reminders" ? "Προετοιμασία…" : "Αποστολή παρτίδας υπενθυμίσεων"}</button>
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
      >{busy === "rewards" ? "Προετοιμασία…" : "Αποστολή κωδικών ευχαριστίας"}</button>
    </div>

    {canAnalyze && <div className="workspace-action-bar">
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
    </div>}

    {canPublish && <div className="workspace-action-bar">
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
    </div>}

    {canPublish && <div className="workspace-action-bar">
      <span>
        <strong>Published-results notification</strong><br />
        {latestReleasePublishedAt
          ? `${resultsNotificationSent.toLocaleString("el-GR")} sent · ${resultsNotificationFailed.toLocaleString("el-GR")} failed for the published release. Κάθε νέα παρτίδα απαιτεί νέα διπλή επιβεβαίωση.`
          : "Η ενημέρωση ενεργοποιείται μόνο μετά την πραγματική δημοσίευση release και μόνο για όσους ζήτησαν ενημέρωση αποτελεσμάτων."}
      </span>
      <button
        className="button button-secondary"
        disabled={Boolean(busy) || workerBusy || studyStatus !== "published" || !latestReleasePublishedAt}
        onClick={() => void notifyResults()}
        type="button"
      >{busy === "results" ? "Προετοιμασία…" : "Ενημέρωση συμμετεχόντων για αποτελέσματα"}</button>
    </div>}

    <div className="workspace-inline-note">
      <strong>Ασφάλεια αποστολών:</strong> κανένα Research email δεν αποστέλλεται αυτόματα. Κάθε παρτίδα δείχνει πρώτα μελέτη, σκοπό και ακριβή αριθμό παραληπτών και απαιτεί δύο επιβεβαιώσεις.<br />
      {message || (workerBusy
        ? "Υπάρχει ήδη research worker job σε αναμονή ή εκτέλεση."
        : "Οι προσωπικοί σύνδεσμοι δημιουργούνται μόνο κατά την αποστολή και ο πλήρης σύνδεσμος δεν αποθηκεύεται. Οι υπενθυμίσεις δημιουργούν νέο ασφαλή σύνδεσμο για την ίδια συμμετοχή. Αποτυχημένες ή απορριφθείσες διευθύνσεις αποκλείονται αυτόματα από επόμενες αποστολές.")}
    </div>
  </div>;
}
