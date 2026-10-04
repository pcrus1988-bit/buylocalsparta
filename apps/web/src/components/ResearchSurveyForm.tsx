"use client";

import { useMemo, useState } from "react";
import type { ResearchExperimentAssignment, ResearchSurveyContext } from "../lib/research-survey-runtime";
import { matrixItems, matrixScale, questionOptions, type ResearchAnswer, type ResearchAnswerMap, type ResearchQuestion } from "../lib/research-survey-model";
import styles from "./ResearchSurveyForm.module.css";

type ConsentState = Readonly<{ results_notification: boolean; thank_you_code: boolean; marketing: boolean }>;

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
  return { results_notification: false, thank_you_code: false, marketing: false };
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
          onChange={() => onChange(checked ? selected.filter((item) => item !== optionValue) : [...selected, optionValue])}
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

function ResearchQuestionCard({ question, value, onChange }: {
  question: ResearchQuestion;
  value: ResearchAnswer | undefined;
  onChange: (value: ResearchAnswer) => void;
}) {
  return <article className={styles.question}>
    <div className={styles.questionNumber}>{question.code}</div>
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

export function ResearchSurveyForm({ slug, token, initial }: {
  slug: string;
  token: string;
  initial: ResearchSurveyContext;
}) {
  const [started, setStarted] = useState(Boolean(initial.response));
  const [completed, setCompleted] = useState(initial.response?.status === "completed");
  const [researchConsent, setResearchConsent] = useState(Boolean(initial.response));
  const [answers, setAnswers] = useState<Record<string, ResearchAnswer>>(asMutableAnswers(initial.answers));
  const [experiments, setExperiments] = useState<readonly ResearchExperimentAssignment[]>(initial.experiments);
  const [experimentChoices, setExperimentChoices] = useState<Record<string, "a" | "b" | "none">>(
    Object.fromEntries(initial.experiments.flatMap((item) => item.selected ? [[String(item.taskNumber), item.selected]] : []))
  );
  const [optionalConsents, setOptionalConsents] = useState<ConsentState>({ ...initialConsent(), ...initial.consents });
  const [sectionIndex, setSectionIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const questionSections = useMemo(() => {
    const codes = ["A", "B", "C", "D", "E", "F"];
    return codes.map((code) => ({
      code,
      title: SECTION_LABELS[code],
      questions: initial.questions.filter((question) => question.sectionCode === code && question.type !== "experiment")
    }));
  }, [initial.questions]);
  const allSections = [...questionSections, { code: "X", title: SECTION_LABELS.X, questions: [] as ResearchQuestion[] }, { code: "DONE", title: "Ολοκλήρωση", questions: [] as ResearchQuestion[] }];
  const current = allSections[sectionIndex];

  async function save(payload: Record<string, unknown>) {
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
      await save({ answers, experimentChoices, optionalConsents, complete: true });
      setCompleted(true);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Δεν ήταν δυνατή η ολοκλήρωση.";
      setMessage(errorText.includes("SURVEY_INCOMPLETE")
        ? "Λείπουν μία ή περισσότερες υποχρεωτικές απαντήσεις. Επιστρέψτε στις προηγούμενες ενότητες και συμπληρώστε τες."
        : errorText);
    }
  }

  if (completed) {
    return <div className={styles.complete}>
      <span className={styles.kicker}>Η απάντηση καταχωρήθηκε</span>
      <h2>Ευχαριστούμε για τη συμμετοχή σας.</h2>
      <p>Η απάντησή σας έχει κλειδωθεί ως ολοκληρωμένη και θα χρησιμοποιηθεί μόνο στο πλαίσιο της μελέτης και των επιλογών συγκατάθεσης που δώσατε.</p>
      <a href={"/research/" + encodeURIComponent(slug) + "/methodology"}>Δείτε τη μεθοδολογία της μελέτης</a>
    </div>;
  }

  if (!started) {
    return <div className={styles.consent}>
      <span className={styles.kicker}>Πριν ξεκινήσετε</span>
      <h2>Συγκατάθεση συμμετοχής</h2>
      <p>Η συμμετοχή είναι προαιρετική. Ο προσωπικός σύνδεσμος χρησιμοποιείται για να επιβεβαιώνει ότι η απάντηση ανήκει στο επιλεγμένο δείγμα και για να αποφεύγονται διπλές συμμετοχές. Δεν εμφανίζεται ΑΦΜ, email ή όνομα επιχείρησης στο ερωτηματολόγιο.</p>
      <label className={styles.consentChoice}>
        <input type="checkbox" checked={researchConsent} onChange={(event) => setResearchConsent(event.target.checked)} />
        <span>Έχω ενημερωθεί για τον σκοπό της έρευνας και συμφωνώ να συμμετάσχω.</span>
      </label>
      {message && <p className={styles.error}>{message}</p>}
      <button type="button" className={styles.primary} disabled={saving} onClick={begin}>{saving ? "Έναρξη…" : "Έναρξη έρευνας"}</button>
    </div>;
  }

  const progress = Math.round((sectionIndex / (allSections.length - 1)) * 100);
  return <div className={styles.form}>
    <div className={styles.progress}>
      <div><span>Πρόοδος</span><strong>{progress}%</strong></div>
      <div className={styles.progressTrack}><span style={{ width: String(progress) + "%" }} /></div>
    </div>

    <header className={styles.sectionHeader}>
      <span className={styles.kicker}>{current.code === "X" ? "Προαιρετικό" : current.code === "DONE" ? "Τελικό βήμα" : "Ενότητα " + current.code}</span>
      <h2>{current.title}</h2>
      {current.code === "X" && <p>Οι επιλογές αυτές είναι ερευνητικά σενάρια και όχι πραγματικές εμπορικές προσφορές. Μπορείτε να παραλείψετε ολόκληρη την ενότητα.</p>}
      {current.code === "DONE" && <p>Οι παρακάτω επιλογές είναι χωριστές από τη συμμετοχή στην έρευνα. Καμία δεν είναι προϋπόθεση για την καταχώρηση της απάντησής σας.</p>}
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

    {current.code === "DONE" && <div className={styles.optionalConsents}>
      <label><input type="checkbox" checked={optionalConsents.results_notification} onChange={(event) => setOptionalConsents((state) => ({ ...state, results_notification: event.target.checked }))} /><span>Θέλω να ενημερωθώ όταν δημοσιευθούν τα αποτελέσματα.</span></label>
      <label><input type="checkbox" checked={optionalConsents.thank_you_code} onChange={(event) => setOptionalConsents((state) => ({ ...state, thank_you_code: event.target.checked }))} /><span>Θέλω να λάβω τον κωδικό ευχαριστίας που προσφέρεται στους συμμετέχοντες.</span></label>
      <label><input type="checkbox" checked={optionalConsents.marketing} onChange={(event) => setOptionalConsents((state) => ({ ...state, marketing: event.target.checked }))} /><span>Θέλω να λαμβάνω πληροφορίες σχετικά με τις υπηρεσίες του KONTA MOY.</span></label>
    </div>}

    {message && <p className={styles.error}>{message}</p>}
    <div className={styles.actions}>
      {sectionIndex > 0 && <button type="button" className={styles.secondary} disabled={saving} onClick={() => setSectionIndex((index) => Math.max(0, index - 1))}>Πίσω</button>}
      {current.code !== "DONE"
        ? <button type="button" className={styles.primary} disabled={saving} onClick={next}>{saving ? "Αποθήκευση…" : current.code === "X" ? "Συνέχεια" : "Αποθήκευση & συνέχεια"}</button>
        : <button type="button" className={styles.primary} disabled={saving} onClick={completeSurvey}>{saving ? "Ολοκλήρωση…" : "Ολοκλήρωση έρευνας"}</button>}
    </div>
  </div>;
}
