"use client";

import { useMemo, useState } from "react";
import type { ResearchExperimentAssignment, ResearchSurveyContext } from "../lib/research-survey-runtime";
import { matrixItems, matrixScale, questionOptions, validateResearchAnswers, type ResearchAnswer, type ResearchAnswerMap, type ResearchQuestion } from "../lib/research-survey-model";
import styles from "./ResearchSurveyForm.module.css";

type ConsentState = Readonly<{ results_notification: boolean; thank_you_code: boolean }>;

const SECTION_LABELS: Record<string, string> = {
  A: "Η επιχείρησή σας",
  B: "Ψηφιακή λειτουργία",
  C: "Πού δυσκολεύεται το λιανεμπόριο",
  D: "Πελάτες και τοπική αγορά",
  E: "Marketplaces και ψηφιακές πλατφόρμες",
  F: "Το επόμενο έτος",
  X: "Προαιρετικό ερευνητικό πείραμα"
};

function initialConsent(): ConsentState {
  return { results_notification: false, thank_you_code: false };
}

function asMutableAnswers(value: ResearchAnswerMap): Record<string, ResearchAnswer> {
  return Object.fromEntries(Object.entries(value));
}

function experimentAttributeLabel(key: string): string {
  return ({
    monthly_fee_eur: "Μηνιαίο κόστος",
    commission_pct: "Προμήθεια",
    reach: "Προβολή",
    catalog: "Κατάλογος",
    customer_relationship: "Σχέση με πελάτη",
    stock_sync: "Απόθεμα",
    operations: "Υποστήριξη λειτουργιών"
  } as Record<string, string>)[key] ?? key;
}

function experimentValueLabel(key: string, value: string | number): string {
  const labels: Record<string, Record<string, string>> = {
    reach: { local: "Τοπική", national: "Πανελλαδική", local_national: "Τοπική + πανελλαδική" },
    catalog: { manual: "Χειροκίνητη", single_import: "Μία εισαγωγή", automatic_sync: "Αυτόματος συγχρονισμός" },
    customer_relationship: { platform_only: "Μέσω πλατφόρμας", merchant_access: "Άμεση πρόσβαση επιχείρησης" },
    stock_sync: { none: "Χωρίς συγχρονισμό", daily: "Καθημερινά", realtime: "Σχεδόν πραγματικός χρόνος" },
    operations: { listing_only: "Μόνο προβολή", payments: "Πληρωμές", payments_shipping_returns: "Πληρωμές + αποστολές + επιστροφές" }
  };
  if (key === "monthly_fee_eur") return String(value) + " € / μήνα";
  if (key === "commission_pct") return String(value) + "% ανά πώληση";
  return labels[key]?.[String(value)] ?? String(value);
}

function SingleQuestion({ question, value, onChange }: {
  question: ResearchQuestion;
  value: ResearchAnswer | undefined;
  onChange: (value: ResearchAnswer) => void;
}) {
  return <div className={styles.options}>
    {questionOptions(question).map(([optionValue, label]) => <label className={styles.option} key={optionValue}>
      <input type="radio" name={question.code} checked={value === optionValue} onChange={() => onChange(optionValue)} />
      <span>{label}</span>
    </label>)}
  </div>;
}

function MultiQuestion({ question, value, onChange }: {
  question: ResearchQuestion;
  value: ResearchAnswer | undefined;
  onChange: (value: ResearchAnswer) => void;
}) {
  const selected = Array.isArray(value) ? value.map(String) : [];
  const max = Number(question.config.max ?? Number.POSITIVE_INFINITY);
  return <div className={styles.options}>
    {questionOptions(question).map(([optionValue, label]) => {
      const checked = selected.includes(optionValue);
      const disabled = !checked && selected.length >= max;
      return <label className={styles.option + (disabled ? " " + styles.disabled : "")} key={optionValue}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => {
            if (checked) {
              onChange(selected.filter((item) => item !== optionValue));
              return;
            }
            if (optionValue === "none") {
              onChange(["none"]);
              return;
            }
            onChange([...selected.filter((item) => item !== "none"), optionValue]);
          }}
        />
        <span>{label}</span>
      </label>;
    })}
    {Number.isFinite(max) && <small className={styles.hint}>Έως {max} επιλογές.</small>}
  </div>;
}

function ScaleQuestion({ question, value, onChange }: {
  question: ResearchQuestion;
  value: ResearchAnswer | undefined;
  onChange: (value: ResearchAnswer) => void;
}) {
  const min = Number(question.config.min ?? 1);
  const max = Number(question.config.max ?? 5);
  const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const labels = question.config.labels && typeof question.config.labels === "object"
    ? question.config.labels as Record<string, string>
    : {};
  return <div>
    <div className={styles.scale}>
      {values.map((scaleValue) => <label key={scaleValue} className={value === scaleValue ? styles.scaleSelected : ""}>
        <input type="radio" checked={value === scaleValue} onChange={() => onChange(scaleValue)} />
        <strong>{scaleValue}</strong>
      </label>)}
    </div>
    {(labels[String(min)] || labels[String(max)]) && <div className={styles.scaleLabels}>
      <span>{labels[String(min)]}</span><span>{labels[String(max)]}</span>
    </div>}
  </div>;
}

function MatrixQuestion({ question, value, onChange }: {
  question: ResearchQuestion;
  value: ResearchAnswer | undefined;
  onChange: (value: ResearchAnswer) => void;
}) {
  const answers = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, string | number>
    : {};
  const scale = matrixScale(question);
  return <div className={styles.matrix}>
    {matrixItems(question).map(([itemId, label]) => <div className={styles.matrixRow} key={itemId}>
      <div className={styles.matrixLabel}>{label}</div>
      <div className={styles.matrixChoices}>
        {scale.map(([scaleValue, scaleLabel]) => <label
          key={scaleValue}
          title={scaleLabel}
          className={String(answers[itemId] ?? "") === scaleValue ? styles.matrixSelected : ""}
        >
          <input
            type="radio"
            name={question.code + "-" + itemId}
            checked={String(answers[itemId] ?? "") === scaleValue}
            onChange={() => onChange({ ...answers, [itemId]: scaleValue })}
          />
          <span>{scaleLabel}</span>
        </label>)}
      </div>
    </div>)}
  </div>;
}

function answerPresent(value: ResearchAnswer | undefined): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function ResearchQuestionCard({ question, value, onChange }: {
  question: ResearchQuestion;
  value: ResearchAnswer | undefined;
  onChange: (value: ResearchAnswer) => void;
}) {
  const answered = answerPresent(value);
  return <article className={styles.question + (answered ? " " + styles.questionAnswered : "")}>
    <div className={styles.questionMeta}>
      <div className={styles.questionNumber}>{question.code}</div>
      {answered && <span className={styles.answered}>Απαντήθηκε</span>}
    </div>
    <h3>{question.prompt}</h3>
    {question.help && <p className={styles.help}>{question.help}</p>}
    {question.type === "single" && <SingleQuestion question={question} value={value} onChange={onChange} />}
    {question.type === "multi" && <MultiQuestion question={question} value={value} onChange={onChange} />}
    {question.type === "scale" && <ScaleQuestion question={question} value={value} onChange={onChange} />}
    {question.type === "matrix" && <MatrixQuestion question={question} value={value} onChange={onChange} />}
    {question.type === "text" && <textarea
      className={styles.textarea}
      value={typeof value === "string" ? value : ""}
      maxLength={Number(question.config.maxLength ?? 1500)}
      onChange={(event) => onChange(event.target.value)}
      rows={6}
    />}
  </article>;
}

function ExperimentCard({ assignment, selected, onSelect }: {
  assignment: ResearchExperimentAssignment;
  selected?: "a" | "b" | "none";
  onSelect: (value: "a" | "b" | "none") => void;
}) {
  const profiles = [
    ["a", "Πλατφόρμα Α", assignment.alternativeA],
    ["b", "Πλατφόρμα Β", assignment.alternativeB]
  ] as const;
  return <article className={styles.experimentTask}>
    <div className={styles.questionNumber}>Σύγκριση {assignment.taskNumber}</div>
    <div className={styles.experimentGrid}>
      {profiles.map(([id, title, profile]) => <button
        type="button"
        className={styles.profile + (selected === id ? " " + styles.profileSelected : "")}
        onClick={() => onSelect(id)}
        key={id}
      >
        <strong>{title}</strong>
        <dl>
          {Object.entries(profile).map(([key, profileValue]) => <div key={key}>
            <dt>{experimentAttributeLabel(key)}</dt>
            <dd>{experimentValueLabel(key, profileValue)}</dd>
          </div>)}
        </dl>
      </button>)}
    </div>
    <button
      type="button"
      className={styles.noneChoice + (selected === "none" ? " " + styles.noneSelected : "")}
      onClick={() => onSelect("none")}
    >Καμία από τις δύο</button>
  </article>;
}

export function ResearchSurveyForm({ slug, token, initial, initialOptOutIntent = false, previewMode = false }: {
  slug: string;
  token: string;
  initial: ResearchSurveyContext;
  initialOptOutIntent?: boolean;
  /** A local-only reproduction of the real participant flow: never sends requests. */
  previewMode?: boolean;
}) {
  const [started, setStarted] = useState(Boolean(initial.response) && initial.response?.status === "in_progress");
  const [completed, setCompleted] = useState(initial.response?.status === "completed");
  const [declined, setDeclined] = useState(initial.response?.status === "withdrawn" || initial.invite.status === "suppressed");
  const [futureResearchSuppressed, setFutureResearchSuppressed] = useState(false);
  const [suppressFutureResearch, setSuppressFutureResearch] = useState(initialOptOutIntent);
  const [researchConsent, setResearchConsent] = useState(Boolean(initial.response) && initial.response?.status === "in_progress");
  const [answers, setAnswers] = useState<Record<string, ResearchAnswer>>(asMutableAnswers(initial.answers));
  const [experiments, setExperiments] = useState<readonly ResearchExperimentAssignment[]>(initial.experiments);
  const [experimentChoices, setExperimentChoices] = useState<Record<string, "a" | "b" | "none">>(
    Object.fromEntries(initial.experiments.flatMap((item) => item.selected ? [[String(item.taskNumber), item.selected]] : []))
  );
  const [optionalConsents, setOptionalConsents] = useState<ConsentState>({ ...initialConsent(), ...initial.consents });
  const [sectionIndex, setSectionIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [preferenceMessage, setPreferenceMessage] = useState("");

  const questionSections = useMemo(() => {
    const questions = [...initial.questions].filter((item) => item.type !== "experiment")
      .sort((left, right) => left.position - right.position || left.code.localeCompare(right.code));
    const codes = [...new Set(questions.map((item) => item.sectionCode))];
    return codes.map((code) => ({
      code,
      title: SECTION_LABELS[code] ?? "Ενότητα " + code,
      questions: questions.filter((question) => question.sectionCode === code)
    }));
  }, [initial.questions]);
  const hasExperiment = initial.questions.some((question) => question.type === "experiment") || experiments.length > 0;
  const allSections = [
    ...questionSections,
    ...(hasExperiment ? [{ code: "X", title: SECTION_LABELS.X, questions: [] as ResearchQuestion[] }] : []),
    { code: "DONE", title: "Ολοκλήρωση", questions: [] as ResearchQuestion[] }
  ];
  const current = allSections[sectionIndex];
  const currentAnswered = current.questions.filter((question) => answerPresent(answers[question.code])).length;
  const currentQuestionCount = current.questions.length;

  async function save(payload: Record<string, unknown>) {
    if (previewMode) return {} as Record<string, unknown>;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/research/" + encodeURIComponent(slug) + "/t/" + encodeURIComponent(token), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Δεν ήταν δυνατή η αποθήκευση.");
      if (Array.isArray(body.experiments)) setExperiments(body.experiments);
      return body;
    } finally {
      setSaving(false);
    }
  }

  async function begin() {
    if (!researchConsent) {
      setMessage("Για να ξεκινήσει η έρευνα χρειάζεται να επιλέξετε ότι συμφωνείτε να συμμετάσχετε.");
      return;
    }
    try {
      await save({ researchConsent: true });
      setStarted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η έναρξη.");
    }
  }

  async function next() {
    try {
      if (previewMode && current.questions.length) {
        const validation = validateResearchAnswers(current.questions, answers);
        if (!validation.ok) {
          setMessage("Συμπληρώστε τις υποχρεωτικές απαντήσεις και διορθώστε τυχόν μη έγκυρες επιλογές: " +
            [...validation.missing, ...validation.invalid].join(", "));
          return;
        }
      }
      setMessage("");
      if (current.code !== "X" && current.code !== "DONE") {
        const codes = new Set(current.questions.map((question) => question.code));
        const sectionAnswers = Object.fromEntries(Object.entries(answers).filter(([code]) => codes.has(code)));
        await save({ answers: sectionAnswers, experimentChoices });
      } else if (current.code === "X") {
        await save({ experimentChoices });
      }
      setSectionIndex((index) => Math.min(index + 1, allSections.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η αποθήκευση.");
    }
  }

  async function completeSurvey() {
    try {
      if (previewMode) {
        const validation = validateResearchAnswers(initial.questions, answers);
        if (!validation.ok) {
          setMessage("Λείπουν ή είναι μη έγκυρες οι απαντήσεις: " + [...validation.missing, ...validation.invalid].join(", ") +
            ". Επιστρέψτε στις προηγούμενες ενότητες.");
          return;
        }
      }
      await save({ answers, experimentChoices, complete: true });
      setCompleted(true);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Δεν ήταν δυνατή η ολοκλήρωση.";
      setMessage(errorText.includes("SURVEY_INCOMPLETE")
        ? "Λείπουν μία ή περισσότερες υποχρεωτικές απαντήσεις. Επιστρέψτε στις προηγούμενες ενότητες και συμπληρώστε τες."
        : errorText);
    }
  }

  async function saveConsentPreferences() {
    setPreferenceMessage("");
    try {
      const result = await save({
        action: "preferences",
        optionalConsents
      });
      if (result.consents && typeof result.consents === "object" && !Array.isArray(result.consents)) {
        setOptionalConsents((state) => ({ ...state, ...result.consents as Partial<ConsentState> }));
      }
      setPreferenceMessage(previewMode ? "Οι δοκιμαστικές επιλογές ενημερώθηκαν μόνο σε αυτή τη σελίδα." : "Οι επιλογές επικοινωνίας ενημερώθηκαν.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η ενημέρωση των επιλογών.");
    }
  }

  async function declineParticipation() {
    try {
      const result = await save({
        action: "refuse",
        suppressFutureResearch
      });
      setFutureResearchSuppressed(previewMode ? suppressFutureResearch : Boolean(result.futureResearchSuppressed));
      setDeclined(true);
      setStarted(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η καταχώρηση της επιλογής σας.");
    }
  }

  if (declined) {
    return <div className={styles.complete}>
      <span className={styles.kicker}>{previewMode ? "Προσομοίωση επιλογής" : "Η επιλογή σας καταχωρήθηκε"}</span>
      <h2>Δεν θα ζητηθεί απάντηση σε αυτή τη μελέτη.</h2>
      {previewMode && <p>ΔΟΚΙΜΗ ΜΟΝΟ — καμία εξαίρεση ή επιλογή επικοινωνίας δεν αποθηκεύτηκε.</p>}
      <p>{previewMode ? "Η επιλογή μη συμμετοχής εμφανίζεται σωστά. Δεν καταχωρήθηκε πραγματική άρνηση, συγκατάθεση ή εξαίρεση από αποστολές." : futureResearchSuppressed
        ? "Καταχωρήθηκε επίσης ότι δεν επιθυμείτε μελλοντικές προσκλήσεις για έρευνες του KONTA MOY. Η επιλογή αυτή είναι ανεξάρτητη από οποιαδήποτε εμπορική συγκατάθεση."
        : "Η συγκεκριμένη πρόσκληση έκλεισε χωρίς να δημιουργηθεί υποχρέωση συμμετοχής."}</p>
      <a href={"/research/" + encodeURIComponent(slug) + "/methodology"}>Δείτε τη μεθοδολογία της μελέτης</a>
    </div>;
  }

  if (completed) {
    return <div className={styles.complete}>
      <span className={styles.kicker}>{previewMode ? "Δοκιμαστική ολοκλήρωση — χωρίς αποθήκευση" : "Η απάντηση καταχωρήθηκε"}</span>
      <h2>Ευχαριστούμε για τη συμμετοχή σας.</h2>
      <p>{previewMode ? "Ολοκληρώσατε την προεπισκόπηση. Οι απαντήσεις σας δεν αποθηκεύτηκαν, δεν δημιουργήθηκε συμμετοχή και δεν εστάλη καμία ειδοποίηση." : "Η απάντησή σας έχει κλειδωθεί ως ολοκληρωμένη και θα χρησιμοποιηθεί μόνο στο πλαίσιο της μελέτης και των επιλογών συγκατάθεσης που δώσατε."}</p>

      <h3>Επιλογές επικοινωνίας</h3>
      <p>{previewMode ? "Δοκιμάστε την εμφάνιση αυτών των επιλογών. Δεν πραγματοποιείται αποθήκευση ή αποστολή." : "Ο προσωπικός σύνδεσμος παραμένει διαθέσιμος για να αλλάξετε αυτές τις επιλογές χωρίς να ανοίξει ξανά ή να αλλάξει η απάντησή σας."}</p>
      <div className={styles.optionalConsents}>
        <label><input type="checkbox" checked={optionalConsents.results_notification} onChange={(event) => setOptionalConsents((state) => ({ ...state, results_notification: event.target.checked }))} /><span>Θέλω να ενημερωθώ όταν δημοσιευθούν τα αποτελέσματα.</span></label>
        <label><input type="checkbox" checked={optionalConsents.thank_you_code} onChange={(event) => setOptionalConsents((state) => ({ ...state, thank_you_code: event.target.checked }))} /><span>Θέλω να λάβω τον κωδικό ευχαριστίας που προσφέρεται στους συμμετέχοντες.</span></label>
      </div>
      <p>{previewMode ? "Σε αυτή τη δοκιμή δεν θα πραγματοποιηθεί καμία αποστολή ή αποθήκευση επιλογών." : "Η αλλαγή ισχύει για μελλοντικές αποστολές. Μήνυμα που έχει ήδη αποσταλεί δεν μπορεί να ανακληθεί."}</p>
      {preferenceMessage && <p className={styles.success}>{preferenceMessage}</p>}
      {message && <p className={styles.error}>{message}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={saving} onClick={() => void saveConsentPreferences()}>
          {saving ? "Αποθήκευση…" : "Αποθήκευση επιλογών"}
        </button>
      </div>

      <h3>Ξεχωριστά από την έρευνα</h3>
      <p>Η ερευνητική ροή τελειώνει εδώ. Αν θέλετε να ενημερωθείτε για εμπορική συνεργασία με το KONTA MOY, αυτό γίνεται σε ξεχωριστή σελίδα και δεν συνδέεται με τις απαντήσεις, την αποζημίωση ή τη συμμετοχή σας στη μελέτη.</p>
      <a href="/join">Πληροφορίες συνεργασίας με το KONTA MOY →</a>

      <h3>Ανάκληση συμμετοχής</h3>
      <p>{previewMode ? "Εδώ ελέγχετε μόνο πώς εμφανίζεται η δυνατότητα ανάκλησης. Δεν υπάρχει πραγματική υποβολή για ανάκληση." : "Μπορείτε να ανακαλέσετε τη συμμετοχή από αυτόν τον προσωπικό σύνδεσμο. Η ανάκληση εξαιρεί την απάντηση από νέες αναλύσεις. Αποτελέσματα που έχουν ήδη δημοσιευθεί σε συγκεντρωτική μορφή παραμένουν μέρος της δημοσιευμένης μελέτης και δεν μπορούν να μετατραπούν αναδρομικά σε ατομικές απαντήσεις."}</p>
      <div className={styles.optionalConsents}>
        <label>
          <input
            type="checkbox"
            checked={suppressFutureResearch}
            onChange={(event) => setSuppressFutureResearch(event.target.checked)}
          />
          <span>Μαζί με την ανάκληση, να μη λάβω άλλη πρόσκληση για μελλοντική έρευνα του KONTA MOY.</span>
        </label>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} disabled={saving} onClick={() => void declineParticipation()}>
          {saving ? "Καταχώρηση ανάκλησης…" : "Ανάκληση συμμετοχής"}
        </button>
        <a href={"/research/" + encodeURIComponent(slug) + "/methodology"}>Δείτε τη μεθοδολογία της μελέτης</a>
      </div>
    </div>;
  }

  if (!started) {
    return <div className={styles.consent}>
      <span className={styles.kicker}>Πριν ξεκινήσετε</span>
      <h2>Συγκατάθεση συμμετοχής</h2>
      <div className={styles.consentFacts}>
        <span>Προαιρετική συμμετοχή</span>
        <span>Προσωπικός σύνδεσμος δείγματος</span>
        <span>Χωρίς ΑΦΜ ή email στο ερωτηματολόγιο</span>
      </div>
      <p>{previewMode ? "Προεπισκόπηση για τον διαχειριστή: δείτε τη διαδρομή του συμμετέχοντα πριν από την πιλοτική φάση. Δεν υπάρχει πραγματικός προσωπικός σύνδεσμος και τίποτα δεν καταχωρείται." : "Η συμμετοχή είναι προαιρετική. Ο προσωπικός σύνδεσμος χρησιμοποιείται για να επιβεβαιώνει ότι η απάντηση ανήκει στο επιλεγμένο δείγμα και για να αποφεύγονται διπλές συμμετοχές. Δεν εμφανίζεται ΑΦΜ, email ή όνομα επιχείρησης στο ερωτηματολόγιο."}</p>
      {initialOptOutIntent && <p className={styles.success}>Ανοίξατε τον σύνδεσμο μη συμμετοχής. Η επιλογή «να μη λάβω άλλη πρόσκληση» έχει προεπιλεγεί· πατήστε «Δεν επιθυμώ να συμμετάσχω» για να καταχωρηθεί.</p>}
      <label className={styles.consentChoice}>
        <input type="checkbox" checked={researchConsent} onChange={(event) => setResearchConsent(event.target.checked)} />
        <span>Έχω ενημερωθεί για τον σκοπό της έρευνας και συμφωνώ να συμμετάσχω.</span>
      </label>
      <div className={styles.optionalConsents}>
        <label>
          <input
            type="checkbox"
            checked={suppressFutureResearch}
            onChange={(event) => setSuppressFutureResearch(event.target.checked)}
          />
          <span>Αν δεν συμμετάσχω, να μη λάβω άλλη πρόσκληση για μελλοντική έρευνα του KONTA MOY.</span>
        </label>
      </div>
      {message && <p className={styles.error}>{message}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} disabled={saving} onClick={() => void declineParticipation()}>
          {saving ? "Καταχώρηση…" : "Δεν επιθυμώ να συμμετάσχω"}
        </button>
        <button type="button" className={styles.primary} disabled={saving} onClick={begin}>{saving ? "Έναρξη…" : "Έναρξη έρευνας"}</button>
      </div>
    </div>;
  }

  const progress = Math.round((sectionIndex / (allSections.length - 1)) * 100);
  return <div className={styles.form}>
    {previewMode && <div role="status" style={{ padding: 15, marginBottom: 18, borderRadius: 14, background: "#fff3cd", color: "#5b4300", fontWeight: 700 }}>ΠΡΟΕΠΙΣΚΟΠΗΣΗ · Δεν αποθηκεύονται απαντήσεις · Δεν αποστέλλονται μηνύματα</div>}
    <div className={styles.progress}>
      <div className={styles.progressTop}>
        <div>
          <span>Βήμα {sectionIndex + 1} από {allSections.length}</span>
          <strong>{current.title}</strong>
        </div>
        <strong className={styles.progressPercent}>{progress}%</strong>
      </div>
      <div className={styles.progressTrack}><span style={{ width: String(progress) + "%" }} /></div>
      <div className={styles.stepDots} aria-hidden="true">
        {allSections.map((section, index) => <span
          key={section.code}
          className={index < sectionIndex ? styles.stepDone : index === sectionIndex ? styles.stepActive : ""}
        />)}
      </div>
    </div>

    <header className={styles.sectionHeader}>
      <div className={styles.sectionMeta}>
        <span className={styles.kicker}>{current.code === "X" ? "Προαιρετικό" : current.code === "DONE" ? "Τελικό βήμα" : "Ενότητα " + current.code}</span>
        {currentQuestionCount > 0 && <span>{currentAnswered} / {currentQuestionCount} απαντημένες</span>}
      </div>
      <h2>{current.title}</h2>
      {current.code === "X" && <p>Οι επιλογές αυτές είναι ερευνητικά σενάρια και όχι πραγματικές εμπορικές προσφορές. Μπορείτε να παραλείψετε ολόκληρη την ενότητα.</p>}
      {current.code === "DONE" && <p>Με την ολοκλήρωση η ερευνητική απάντηση κλειδώνει. Οι προαιρετικές επιλογές ενημέρωσης αποτελεσμάτων και κωδικού ευχαριστίας εμφανίζονται μόνο αφού ολοκληρωθεί η έρευνα.</p>}
    </header>

    {current.questions.map((question) => <ResearchQuestionCard
      key={question.code}
      question={question}
      value={answers[question.code]}
      onChange={(value) => setAnswers((currentAnswers) => ({ ...currentAnswers, [question.code]: value }))}
    />)}

    {current.code === "X" && experiments.map((assignment) => <ExperimentCard
      key={assignment.taskNumber}
      assignment={assignment}
      selected={experimentChoices[String(assignment.taskNumber)]}
      onSelect={(value) => setExperimentChoices((currentChoices) => ({ ...currentChoices, [String(assignment.taskNumber)]: value }))}
    />)}

    {message && <p className={styles.error}>{message}</p>}
    <div className={styles.actions}>
      {sectionIndex > 0 && <button type="button" className={styles.secondary} disabled={saving} onClick={() => setSectionIndex((index) => Math.max(0, index - 1))}>Πίσω</button>}
      {current.code !== "DONE"
        ? <button type="button" className={styles.primary} disabled={saving} onClick={next}>{saving ? "Αποθήκευση…" : current.code === "X" ? "Συνέχεια" : previewMode ? "Επόμενο βήμα" : "Αποθήκευση & συνέχεια"}</button>
        : <button type="button" className={styles.primary} disabled={saving} onClick={completeSurvey}>{saving ? "Ολοκλήρωση…" : previewMode ? "Ολοκλήρωση προεπισκόπησης" : "Ολοκλήρωση έρευνας"}</button>}
    </div>
  </div>;
}
