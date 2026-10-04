"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Option = Readonly<{ value: string; label: string }>;
type Question = Readonly<{
  id: string;
  section: string;
  type: "single" | "multi" | "matrix" | "text";
  title: string;
  help?: string;
  required?: boolean;
  maxSelections?: number;
  options?: readonly Option[];
  rows?: readonly Option[];
  scale?: readonly Option[];
  showWhen?: Readonly<{ questionId: string; includes: string }>;
}>;
type State = Readonly<{
  active: boolean;
  completed: boolean;
  sectorGroup: string;
  prefecture: string;
  municipality: string;
  startedAt?: string;
  permissionStatus?: "pending" | "confirmed" | "withdrawn" | "declined";
}>;
type Payload = Readonly<{
  instrument: Readonly<{
    title: string;
    introduction: string;
    estimatedMinutes: number;
    questions: readonly Question[];
  }>;
  state: State;
}>;

export function RetailStudy2026Survey() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [marketingChoice, setMarketingChoice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/research/retail-2026", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Δεν ήταν δυνατή η φόρτωση της έρευνας.");
        return body as Payload;
      })
      .then((body) => {
        if (cancelled) return;
        setPayload(body);
        setStarted(Boolean(body.state.startedAt));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η φόρτωση της έρευνας.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visibleQuestions = useMemo(() => {
    if (!payload) return [];
    return payload.instrument.questions.filter((question) => {
      if (!question.showWhen) return true;
      const current = answers[question.showWhen.questionId];
      return Array.isArray(current) ? current.includes(question.showWhen.includes) : current === question.showWhen.includes;
    });
  }, [payload, answers]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/research/retail-2026", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Η ενέργεια απέτυχε.");
    return result;
  }

  async function start() {
    setSaving(true);
    setMessage("");
    try {
      const result = await post({ action: "start" }) as { state: State };
      setPayload((current) => current ? { ...current, state: result.state } : current);
      setStarted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η έναρξη.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const missing = visibleQuestions.filter((question) => question.required && isMissingAnswer(question, answers[question.id]));
    if (missing.length) {
      setMessage("Απαντήστε στις υποχρεωτικές ερωτήσεις πριν από την υποβολή.");
      document.getElementById("question-" + missing[0].id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    try {
      const result = await post({ action: "submit", answers }) as { state: State };
      setPayload((current) => current ? { ...current, state: result.state } : current);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η υποβολή.");
    } finally {
      setSaving(false);
    }
  }

  async function requestInformation() {
    if (!marketingChoice) return;
    setSaving(true);
    setMessage("");
    try {
      await post({ action: "request_konta_mou_information" });
      setPayload((current) => current ? { ...current, state: { ...current.state, permissionStatus: "pending" } } : current);
      setMessage("Το αίτημά σας καταγράφηκε χωριστά από τις απαντήσεις της έρευνας. Θα απαιτείται επιβεβαίωση πριν από οποιαδήποτε εμπορική ενημέρωση.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η καταγραφή του αιτήματος.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="panel"><p>Φόρτωση έρευνας…</p></div>;
  if (!payload) return <div className="panel"><h2>Η πρόσκληση δεν είναι διαθέσιμη</h2><p>{message || "Χρησιμοποιήστε τον προσωπικό σύνδεσμο της πρόσκλησής σας."}</p></div>;
  if (!payload.state.active && !payload.state.completed) {
    return <div className="panel"><h2>Η έρευνα δεν είναι ενεργή αυτή τη στιγμή</h2><p>Η πρόσκλησή σας είναι αναγνωρισμένη, αλλά η περίοδος συλλογής απαντήσεων δεν έχει ανοίξει ή έχει ολοκληρωθεί.</p></div>;
  }
  if (payload.state.completed) {
    return <div className="panel">
      <div className="eyebrow">ΕΥΧΑΡΙΣΤΟΥΜΕ</div>
      <h2>Η απάντησή σας καταγράφηκε.</h2>
      <p>Οι απαντήσεις της έρευνας τηρούνται χωριστά από τα στοιχεία επικοινωνίας της πρόσκλησης και θα χρησιμοποιηθούν σε συγκεντρωτικές αναλύσεις.</p>
      <hr />
      <h3>Προαιρετικά και ανεξάρτητα από την έρευνα</h3>
      <label style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={marketingChoice}
          disabled={payload.state.permissionStatus === "pending" || payload.state.permissionStatus === "confirmed"}
          onChange={(event) => setMarketingChoice(event.target.checked)}
        />
        <span>Θέλω να μου στείλετε πληροφορίες για το ΚΟΝΤΑ ΜΟΥ και τις δυνατότητες που προσφέρει σε επιχειρήσεις. Η επιλογή είναι προαιρετική και δεν επηρεάζει τη συμμετοχή μου στην έρευνα.</span>
      </label>
      <div style={{ marginTop: "1rem" }}>
        <button className="btn btn-primary" type="button" disabled={!marketingChoice || saving || payload.state.permissionStatus === "pending" || payload.state.permissionStatus === "confirmed"} onClick={() => void requestInformation()}>
          {payload.state.permissionStatus === "confirmed" ? "Επιβεβαιωμένο" : payload.state.permissionStatus === "pending" ? "Αναμένει επιβεβαίωση" : "Καταγραφή αιτήματος"}
        </button>
      </div>
      {message ? <p role="status" style={{ marginTop: "1rem" }}>{message}</p> : null}
    </div>;
  }
  if (!started) {
    return <div className="panel">
      <h2>{payload.instrument.title}</h2>
      <p>{payload.instrument.introduction}</p>
      <p><strong>Χρόνος:</strong> περίπου {payload.instrument.estimatedMinutes} λεπτά.</p>
      <p>Δεν χρειάζεται να γράψετε όνομα, email, ΑΦΜ ή αριθμό ΓΕΜΗ. Ο προσωπικός σύνδεσμος χρησιμοποιείται μόνο για να αποτραπούν διπλές συμμετοχές και να γνωρίζουμε σε ποιο τμήμα του δείγματος ανήκει η πρόσκληση.</p>
      <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void start()}>
        {saving ? "Έναρξη…" : "Έναρξη έρευνας"}
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </div>;
  }

  return <form onSubmit={(event) => void submit(event)}>
    <div className="panel" style={{ marginBottom: "1rem" }}>
      <h2>Ερωτηματολόγιο</h2>
      <p>Οι ερωτήσεις με * είναι απαραίτητες για τη συγκρίσιμη ανάλυση. Δεν ζητάμε προσωπικά στοιχεία.</p>
    </div>
    {visibleQuestions.map((question, index) => <QuestionField
      key={question.id}
      question={question}
      index={index + 1}
      value={answers[question.id]}
      onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
    />)}
    {message ? <div className="panel" role="alert" style={{ marginBottom: "1rem" }}><p>{message}</p></div> : null}
    <div className="panel">
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Υποβολή…" : "Υποβολή απαντήσεων"}</button>
      <p style={{ marginTop: ".75rem" }}>Με την υποβολή ολοκληρώνετε μόνο τη συμμετοχή στην έρευνα. Δεν εγγράφεστε αυτόματα σε εμπορικές ενημερώσεις.</p>
    </div>
  </form>;
}

function QuestionField({ question, index, value, onChange }: {
  question: Question;
  index: number;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return <fieldset id={"question-" + question.id} className="panel" style={{ marginBottom: "1rem" }}>
    <legend><strong>{index}. {question.title}{question.required ? " *" : ""}</strong></legend>
    {question.help ? <p>{question.help}</p> : null}
    {question.type === "single" ? <div style={{ display: "grid", gap: ".55rem" }}>
      {(question.options ?? []).map((option) => <label key={option.value} style={{ display: "flex", gap: ".6rem", alignItems: "flex-start" }}>
        <input type="radio" name={question.id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
        <span>{option.label}</span>
      </label>)}
    </div> : null}
    {question.type === "multi" ? <div style={{ display: "grid", gap: ".55rem" }}>
      {(question.options ?? []).map((option) => {
        const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
        const checked = selected.includes(option.value);
        return <label key={option.value} style={{ display: "flex", gap: ".6rem", alignItems: "flex-start" }}>
          <input type="checkbox" checked={checked} onChange={(event) => {
            if (event.target.checked) {
              if (question.maxSelections && selected.length >= question.maxSelections) return;
              onChange([...selected, option.value]);
            } else onChange(selected.filter((item) => item !== option.value));
          }} />
          <span>{option.label}</span>
        </label>;
      })}
      {question.maxSelections ? <small>Έως {question.maxSelections} επιλογές.</small> : null}
    </div> : null}
    {question.type === "matrix" ? <div style={{ overflowX: "auto" }}>
      <table>
        <thead><tr><th>Θέμα</th><th>Αξιολόγηση</th></tr></thead>
        <tbody>{(question.rows ?? []).map((row) => {
          const matrix = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
          return <tr key={row.value}><td>{row.label}</td><td>
            <select value={typeof matrix[row.value] === "string" ? String(matrix[row.value]) : ""} onChange={(event) => onChange({ ...matrix, [row.value]: event.target.value })}>
              <option value="">— Επιλέξτε —</option>
              {(question.scale ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </td></tr>;
        })}</tbody>
      </table>
    </div> : null}
    {question.type === "text" ? <textarea
      rows={5}
      maxLength={2000}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Προαιρετική απάντηση"
      style={{ width: "100%" }}
    /> : null}
  </fieldset>;
}

function isMissingAnswer(question: Question, value: unknown): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (question.type === "matrix") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return true;
    const matrix = value as Record<string, unknown>;
    return (question.rows ?? []).some((row) => !matrix[row.value]);
  }
  return false;
}
