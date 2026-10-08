"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchQuestion, ResearchQuestionType } from "../lib/research-survey-model";
import { RETAIL_SENTIMENT_2026_QUESTIONS } from "../lib/research-retail-sentiment-2026";
import type { ResearchSurveyDesignAdminOverview } from "../lib/research-survey-admin-design";

function pairs(value: unknown): ReadonlyArray<readonly [string, string]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    Array.isArray(item) && item.length >= 2
      ? [[String(item[0]), String(item[1])] as const]
      : []
  );
}

function pairsText(value: unknown): string {
  return pairs(value).map(([key, label]) => key + " | " + label).join("\n");
}

function parsePairs(value: string): string[][] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf("|");
    if (separator < 0) return [line, line];
    const key = line.slice(0, separator).trim();
    const label = line.slice(separator + 1).trim();
    return [key, label || key];
  }).filter(([key]) => Boolean(key));
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultConfig(type: ResearchQuestionType): Record<string, unknown> {
  if (type === "single" || type === "multi") {
    return {
      options: [["yes", "Ναι"], ["no", "Όχι"]],
      ...(type === "multi" ? { max: 2 } : {})
    };
  }
  if (type === "scale") return { min: 1, max: 5, step: 1 };
  if (type === "matrix") {
    return {
      items: [["item_1", "Στοιχείο 1"]],
      scale: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]
    };
  }
  if (type === "text") return { maxLength: 1500 };
  return { tasks: 1, choice: ["a", "b", "none"], attributes: {} };
}

async function designPost(slug: string, csrfToken: string, body: Record<string, unknown>) {
  const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Research questionnaire update failed.");
  return result as Record<string, unknown>;
}

function QuestionEditorCard({
  question,
  index,
  total,
  editable,
  slug,
  csrfToken
}: {
  question: ResearchQuestion;
  index: number;
  total: number;
  editable: boolean;
  slug: string;
  csrfToken: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState(question.code);
  const [sectionCode, setSectionCode] = useState(question.sectionCode);
  const [type, setType] = useState<ResearchQuestionType>(question.type);
  const [prompt, setPrompt] = useState(question.prompt);
  const [help, setHelp] = useState(question.help ?? "");
  const [required, setRequired] = useState(question.required);
  const [analysisKey, setAnalysisKey] = useState(question.analysisKey);
  const [optionsText, setOptionsText] = useState(pairsText(question.config.options));
  const [matrixItemsText, setMatrixItemsText] = useState(pairsText(question.config.items));
  const [matrixScaleText, setMatrixScaleText] = useState(pairsText(question.config.scale));
  const [multiMax, setMultiMax] = useState(String(question.config.max ?? ""));
  const [scaleMin, setScaleMin] = useState(String(question.config.min ?? 1));
  const [scaleMax, setScaleMax] = useState(String(question.config.max ?? 5));
  const [scaleStep, setScaleStep] = useState(String(question.config.step ?? 1));
  const [maxLength, setMaxLength] = useState(String(question.config.maxLength ?? 1500));
  const [advancedJson, setAdvancedJson] = useState(JSON.stringify(question.config, null, 2));
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  function buildConfig(): Record<string, unknown> {
    if (type === "single") return { ...question.config, options: parsePairs(optionsText) };
    if (type === "multi") {
      const config = { ...question.config, options: parsePairs(optionsText) } as Record<string, unknown>;
      const max = Number(multiMax);
      if (Number.isFinite(max) && max > 0) config.max = max;
      else delete config.max;
      return config;
    }
    if (type === "matrix") return {
      ...question.config,
      items: parsePairs(matrixItemsText),
      scale: parsePairs(matrixScaleText)
    };
    if (type === "scale") return {
      ...question.config,
      min: numberValue(scaleMin, 1),
      max: numberValue(scaleMax, 5),
      step: numberValue(scaleStep, 1)
    };
    if (type === "text") return {
      ...question.config,
      maxLength: Math.max(1, Math.round(numberValue(maxLength, 1500)))
    };
    const parsed = JSON.parse(advancedJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Experiment definition must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  }

  async function mutate(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setMessage("");
    try {
      await designPost(slug, csrfToken, { action, questionId: question.id, ...extra });
      setMessage("Saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Questionnaire update failed.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("save_question");
    setMessage("");
    try {
      await designPost(slug, csrfToken, {
        action: "save_question",
        question: {
          id: question.id,
          code,
          sectionCode,
          type,
          prompt,
          help,
          required,
          analysisKey,
          config: buildConfig()
        }
      });
      setMessage("Saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Question could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this question from the current draft questionnaire?")) return;
    await mutate("delete_question");
  }

  return <article className="workspace-queue-card" style={{ display: "grid", gap: 14 }}>
    <div className="workspace-action-bar">
      <span>
        <strong>{index + 1}. {question.code}</strong><br />
        Section {question.sectionCode} · {question.type}
      </span>
      <div className="workspace-action-buttons">
        <button className="button button-secondary" disabled={!editable || index === 0 || Boolean(busy)} onClick={() => void mutate("move_question", { direction: "up" })} type="button">↑</button>
        <button className="button button-secondary" disabled={!editable || index === total - 1 || Boolean(busy)} onClick={() => void mutate("move_question", { direction: "down" })} type="button">↓</button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
      <label>
        <strong>Question code</strong><br />
        <input disabled={!editable} onChange={(event) => setCode(event.target.value)} style={{ width: "100%" }} value={code} />
      </label>
      <label>
        <strong>Section</strong><br />
        <input disabled={!editable} onChange={(event) => setSectionCode(event.target.value)} style={{ width: "100%" }} value={sectionCode} />
      </label>
      <label>
        <strong>Answer type</strong><br />
        <select disabled={!editable} onChange={(event) => setType(event.target.value as ResearchQuestionType)} value={type}>
          <option value="single">Single choice</option>
          <option value="multi">Multiple choice</option>
          <option value="scale">Numeric scale</option>
          <option value="matrix">Matrix</option>
          <option value="text">Free text</option>
          <option value="experiment">Experiment</option>
        </select>
      </label>
      <label>
        <strong>Evaluation key</strong><br />
        <input disabled={!editable} onChange={(event) => setAnalysisKey(event.target.value)} style={{ width: "100%" }} value={analysisKey} />
      </label>
    </div>

    <label>
      <strong>Question shown to participant</strong><br />
      <textarea disabled={!editable} onChange={(event) => setPrompt(event.target.value)} rows={3} style={{ width: "100%" }} value={prompt} />
    </label>

    <label>
      <strong>Optional help text</strong><br />
      <textarea disabled={!editable} onChange={(event) => setHelp(event.target.value)} rows={2} style={{ width: "100%" }} value={help} />
    </label>

    {(type === "single" || type === "multi") && <div style={{ display: "grid", gap: 10 }}>
      <label>
        <strong>Answer options</strong><br />
        <textarea disabled={!editable} onChange={(event) => setOptionsText(event.target.value)} rows={Math.max(4, parsePairs(optionsText).length)} style={{ width: "100%", fontFamily: "monospace" }} value={optionsText} />
        <small>One option per line: internal value | label shown to participant.</small>
      </label>
      {type === "multi" && <label>
        <strong>Maximum selections</strong><br />
        <input disabled={!editable} min={1} onChange={(event) => setMultiMax(event.target.value)} type="number" value={multiMax} />
      </label>}
    </div>}

    {type === "matrix" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
      <label>
        <strong>Matrix rows</strong><br />
        <textarea disabled={!editable} onChange={(event) => setMatrixItemsText(event.target.value)} rows={7} style={{ width: "100%", fontFamily: "monospace" }} value={matrixItemsText} />
        <small>One row per line: internal value | participant label.</small>
      </label>
      <label>
        <strong>Answer scale</strong><br />
        <textarea disabled={!editable} onChange={(event) => setMatrixScaleText(event.target.value)} rows={7} style={{ width: "100%", fontFamily: "monospace" }} value={matrixScaleText} />
        <small>One scale value per line: value | label.</small>
      </label>
    </div>}

    {type === "scale" && <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label><strong>Minimum</strong><br /><input disabled={!editable} onChange={(event) => setScaleMin(event.target.value)} type="number" value={scaleMin} /></label>
      <label><strong>Maximum</strong><br /><input disabled={!editable} onChange={(event) => setScaleMax(event.target.value)} type="number" value={scaleMax} /></label>
      <label><strong>Step</strong><br /><input disabled={!editable} min="0.01" onChange={(event) => setScaleStep(event.target.value)} step="0.01" type="number" value={scaleStep} /></label>
    </div>}

    {type === "text" && <label>
      <strong>Maximum characters</strong><br />
      <input disabled={!editable} min={1} onChange={(event) => setMaxLength(event.target.value)} type="number" value={maxLength} />
    </label>}

    {type === "experiment" && <label>
      <strong>Experiment definition</strong><br />
      <textarea disabled={!editable} onChange={(event) => setAdvancedJson(event.target.value)} rows={14} style={{ width: "100%", fontFamily: "monospace" }} value={advancedJson} />
      <small>Advanced definition for randomized tasks and attributes. Existing experiment evidence is never edited after lock.</small>
    </label>}

    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input checked={required} disabled={!editable} onChange={(event) => setRequired(event.target.checked)} type="checkbox" />
      <strong>Required question</strong>
    </label>

    {editable && <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
      <button className="button" disabled={Boolean(busy)} onClick={() => void save()} type="button">{busy === "save_question" ? "Saving…" : "Save question"}</button>
      <button className="button button-secondary" disabled={Boolean(busy)} onClick={() => void remove()} type="button">Delete</button>
    </div>}

    {message && <div className={message === "Saved." ? "workspace-inline-note" : "workspace-inline-note form-error"}>{message}</div>}
  </article>;
}

function NewQuestionPanel({ slug, csrfToken }: { slug: string; csrfToken: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [sectionCode, setSectionCode] = useState("A");
  const [type, setType] = useState<ResearchQuestionType>("single");
  const [prompt, setPrompt] = useState("");
  const [analysisKey, setAnalysisKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function add() {
    setBusy(true);
    setMessage("");
    try {
      await designPost(slug, csrfToken, {
        action: "save_question",
        question: {
          code,
          sectionCode,
          type,
          prompt,
          help: "",
          required: true,
          analysisKey,
          config: defaultConfig(type)
        }
      });
      setCode("");
      setPrompt("");
      setAnalysisKey("");
      setMessage("Question added.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Question could not be added.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-queue-card" style={{ display: "grid", gap: 12 }}>
    <strong>Add question</strong>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
      <label><small>Question code</small><br /><input onChange={(event) => setCode(event.target.value)} placeholder="Q20" style={{ width: "100%" }} value={code} /></label>
      <label><small>Section</small><br /><input onChange={(event) => setSectionCode(event.target.value)} style={{ width: "100%" }} value={sectionCode} /></label>
      <label><small>Answer type</small><br /><select onChange={(event) => setType(event.target.value as ResearchQuestionType)} value={type}>
        <option value="single">Single choice</option>
        <option value="multi">Multiple choice</option>
        <option value="scale">Numeric scale</option>
        <option value="matrix">Matrix</option>
        <option value="text">Free text</option>
        <option value="experiment">Experiment</option>
      </select></label>
      <label><small>Evaluation key</small><br /><input onChange={(event) => setAnalysisKey(event.target.value)} placeholder="metric_key" style={{ width: "100%" }} value={analysisKey} /></label>
    </div>
    <label><small>Question</small><br /><textarea onChange={(event) => setPrompt(event.target.value)} rows={3} style={{ width: "100%" }} value={prompt} /></label>
    <div className="workspace-action-buttons">
      <button className="button" disabled={busy || !code.trim() || !prompt.trim() || !analysisKey.trim()} onClick={() => void add()} type="button">{busy ? "Adding…" : "Add question"}</button>
    </div>
    {message && <div className={message === "Question added." ? "workspace-inline-note" : "workspace-inline-note form-error"}>{message}</div>}
  </div>;
}

export function ResearchSurveyQuestionsEditor({
  slug,
  csrfToken,
  canEdit,
  canAnalyze,
  data
}: {
  slug: string;
  csrfToken: string;
  canEdit: boolean;
  canAnalyze: boolean;
  data: ResearchSurveyDesignAdminOverview;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const instrument = data.instrument;
  const editable = Boolean(canEdit && data.study.status === "draft" && instrument?.status === "draft");
  const canCreateRevision = Boolean(canEdit && data.study.status === "draft" && instrument && (instrument.status !== "draft" || data.analysisPlan?.status === "locked"));
  const canLockQuestionnaire = Boolean(editable && data.questions.length > 0);
  const moduleInstalled = RETAIL_SENTIMENT_2026_QUESTIONS.every((item) => data.questions.some((question) => question.code === item.code));
  const canInstallSentiment = Boolean(editable && canAnalyze && data.analysisPlan?.status === "draft" && !moduleInstalled && slug === "greek-retail-2026");

  async function createRevision() {
    setBusy(true);
    setMessage("");
    try {
      const result = await designPost(slug, csrfToken, { action: "create_revision" });
      setMessage("Editable questionnaire revision created: " + String(result.instrumentVersion || ""));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Editable revision could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function installSentiment() {
    if (!canInstallSentiment || !instrument) return;
    if (!window.confirm(
      "Add Q19–Q27 (9 questions) and preregister the Greek Retail Business Confidence Index for questionnaire " + instrument.version +
      "?\n\nThe questions will be added to the current editable draft only. No invitations will be sent. Review the new fingerprint before locking."
    )) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await designPost(slug, csrfToken, { action: "install_retail_sentiment_2026" });
      setMessage("Installed " + String(result.installed ?? 0) + " new questions (Q19–Q27) and preregistered the confidence index.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not install Q19–Q27.");
    } finally {
      setBusy(false);
    }
  }

  async function lockQuestionnaire() {
    if (!instrument || !canLockQuestionnaire) return;
    const confirmed = window.confirm(
      "Lock this questionnaire version?\n\n" +
      "Version: " + instrument.version + "\n" +
      "Questions: " + data.questions.length + "\n" +
      "Fingerprint: " + instrument.contentSha256 + "\n\n" +
      "The questions will become read-only. Any later changes require a new draft revision. " +
      "This does not lock the evaluation plan, start the pilot, or send invitations."
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await designPost(slug, csrfToken, {
        action: "lock_instrument",
        expectedInstrumentVersion: instrument.version,
        expectedInstrumentSha256: instrument.contentSha256
      });
      setMessage("Questionnaire locked: " + instrument.version + ".");
      router.refresh();
    } catch (error) {
      if (error instanceof Error && error.message === "RESEARCH_INSTRUMENT_CHANGED_REFRESH") {
        setMessage("The draft was changed since this page loaded. Refresh and review its current fingerprint before locking.");
        router.refresh();
      } else {
        setMessage(error instanceof Error ? error.message : "Questionnaire could not be locked.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!instrument) {
    return <section className="shell vendor-section"><div className="workspace-inline-note form-error">No questionnaire instrument exists for this survey.</div></section>;
  }

  return <section className="shell vendor-section">
    <div className="workspace-action-bar">
      <span>
        <strong>Questionnaire {instrument.version}</strong><br />
        {data.questions.length} question(s) · status {instrument.status}
      </span>
      <span style={{ fontFamily: "monospace", fontSize: 12 }}>fingerprint {instrument.contentSha256.slice(0, 12)}…</span>
    </div>

    {editable
      ? <div className="workspace-inline-note">This is the editable draft. Changes update only this draft questionnaire and its fingerprint.</div>
      : <div className="workspace-inline-note">
          This questionnaire is frozen. It remains visible for audit and reproducibility, but its questions cannot be silently changed.
          {canCreateRevision ? " Create a new draft revision to make changes before fieldwork begins." : ""}
        </div>}

    {!moduleInstalled && slug === "greek-retail-2026" && <div className="workspace-queue-card" style={{ display: "grid", gap: 8, marginTop: 14 }}>
      <strong>Προτεινόμενη νέα ενότητα · Οικονομική κατάσταση και επιχειρηματική εμπιστοσύνη (Q19–Q27)</strong>
      <p>Οι παρακάτω εννέα ερωτήσεις δεν έχουν προστεθεί ακόμη σε αυτό το ερωτηματολόγιο.</p>
      <ol style={{ paddingLeft: 25, margin: 0 }}>
        {RETAIL_SENTIMENT_2026_QUESTIONS.map((question) => <li key={question.code}><strong>{question.code}.</strong> {question.prompt}</li>)}
      </ol>
      <small>Πρώτα εγκατάσταση στο draft, μετά έλεγχος και κλείδωμα. Δεν γίνεται αποστολή email.</small>
    </div>}

    {editable && !moduleInstalled && slug === "greek-retail-2026" && <div className="workspace-action-bar">
      <span><strong>Install Q19–Q27</strong><br />
        Add nine sentiment questions and register the 0–100 Greek Retail Business Confidence Index in the draft analysis plan.
        {data.analysisPlan?.status !== "draft" && <><br /><small>The evaluation plan must be an editable draft; create a new design revision first.</small></>}
        {!canAnalyze && <><br /><small>Research analysis permission is required to update the preregistered index.</small></>}
      </span>
      <button className="button button-secondary" disabled={busy || !canInstallSentiment} onClick={() => void installSentiment()} type="button">
        {busy ? "Installing…" : "Install Q19–Q27"}
      </button>
    </div>}

    {editable && <div className="workspace-action-bar">
      <span><strong>Ready to freeze this questionnaire?</strong><br />
        Lock version <strong>{instrument.version}</strong> with {data.questions.length} question(s) and its current fingerprint.
        <br /><small>Locking prevents further edits to this version. It does not lock the evaluation plan, start the pilot or send invitations.</small>
      </span>
      <button className="button" disabled={busy || !canLockQuestionnaire} onClick={() => void lockQuestionnaire()} type="button">
        {busy ? "Locking…" : "Lock questionnaire"}
      </button>
    </div>}

    {canCreateRevision && <div className="workspace-action-bar">
      <span><strong>Need to revise a locked questionnaire or evaluation plan?</strong><br />Create a new draft version with the same questions and a matching draft evaluation plan.</span>
      <button className="button" disabled={busy} onClick={() => void createRevision()} type="button">{busy ? "Creating…" : "Create editable revision"}</button>
    </div>}

    {message && <div role="status" className={message.startsWith("Editable") || message.startsWith("Questionnaire locked:") || message.startsWith("Installed") ? "workspace-inline-note" : "workspace-inline-note form-error"}>{message}</div>}

    <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
      {data.questions.map((question, index) => <QuestionEditorCard
        csrfToken={csrfToken}
        editable={editable}
        index={index}
        key={question.id}
        question={question}
        slug={slug}
        total={data.questions.length}
      />)}
    </div>

    {editable && <div style={{ marginTop: 16 }}><NewQuestionPanel csrfToken={csrfToken} slug={slug} /></div>}
  </section>;
}


function evaluationObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function evaluationArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}
function evaluationOutcomesText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((raw) => {
    const item = evaluationObject(raw);
    return [String(item.metricKey ?? ""), String(item.label ?? ""), evaluationArray(item.segments).join(",")].join(" | ");
  }).join("\n");
}
function parseEvaluationOutcomes(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split("|").map((part) => part.trim());
    return {
      metricKey: parts[0] || "",
      label: parts[1] || parts[0] || "",
      estimand: "weighted_population_mean",
      segments: (parts[2] || "overall").split(",").map((part) => part.trim()).filter(Boolean)
    };
  }).filter((item) => item.metricKey);
}

export function ResearchEvaluationPlanEditor({
  slug,
  csrfToken,
  canEdit,
  canAddLater,
  data
}: {
  slug: string;
  csrfToken: string;
  canEdit: boolean;
  canAddLater: boolean;
  data: ResearchSurveyDesignAdminOverview;
}) {
  const router = useRouter();
  const plan = data.analysisPlan;
  const planJson = plan?.plan ?? {};
  const secondary = evaluationObject(planJson.secondaryAnalyses);
  const disclosure = evaluationObject(planJson.disclosure);
  const variance = evaluationObject(planJson.variance);
  const weighting = evaluationObject(planJson.weighting);
  const [title, setTitle] = useState(plan?.title ?? "Survey evaluation plan");
  const [primary, setPrimary] = useState(evaluationOutcomesText(planJson.primaryOutcomes));
  const [secondaryScope, setSecondaryScope] = useState(String(secondary.scope ?? ""));
  const [secondarySegments, setSecondarySegments] = useState(evaluationArray(secondary.segments).join(", "));
  const [exploratory, setExploratory] = useState(JSON.stringify(Array.isArray(planJson.exploratoryAnalyses) ? planJson.exploratoryAnalyses : [], null, 2));
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [laterEventId, setLaterEventId] = useState("");
  const [laterTitle, setLaterTitle] = useState("");
  const [laterResearchQuestion, setLaterResearchQuestion] = useState("");
  const [laterMetricKey, setLaterMetricKey] = useState("");
  const [laterMethod, setLaterMethod] = useState("weighted_population_mean");
  const [laterSegments, setLaterSegments] = useState("overall");
  const [laterFilters, setLaterFilters] = useState("");
  const [laterInterpretation, setLaterInterpretation] = useState("");
  const [laterPublicationLabel, setLaterPublicationLabel] = useState("");
  const editable = Boolean(canEdit && data.study.status === "draft" && plan?.status === "draft");
  const canRevise = Boolean(canEdit && data.study.status === "draft" && data.instrument && plan?.status === "locked");
  const laterEditable = Boolean(canAddLater && data.study.status !== "draft" && data.study.status !== "archived");

  async function save() {
    if (!plan) return;
    setBusy("save");
    setMessage("");
    try {
      const exploratoryValue = JSON.parse(exploratory) as unknown;
      if (!Array.isArray(exploratoryValue)) throw new Error("Exploratory evaluation must be a list.");
      const primaryOutcomes = parseEvaluationOutcomes(primary);
      if (!primaryOutcomes.length) throw new Error("At least one primary outcome is required.");
      await designPost(slug, csrfToken, {
        action: "save_analysis_plan",
        title,
        plan: {
          ...planJson,
          primaryOutcomes,
          secondaryAnalyses: {
            ...secondary,
            scope: secondaryScope.trim(),
            segments: secondarySegments.split(",").map((part) => part.trim()).filter(Boolean),
            classification: "prespecified_secondary"
          },
          exploratoryAnalyses: exploratoryValue
        }
      });
      setMessage("Evaluation plan saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evaluation plan could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function lock() {
    if (!window.confirm("Lock this evaluation plan? A locked plan cannot be edited in place.")) return;
    setBusy("lock");
    setMessage("");
    try {
      await designPost(slug, csrfToken, { action: "lock_analysis_plan" });
      setMessage("Evaluation plan locked.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evaluation plan could not be locked.");
    } finally {
      setBusy("");
    }
  }

  async function revise() {
    setBusy("revision");
    setMessage("");
    try {
      const result = await designPost(slug, csrfToken, { action: "create_revision" });
      setMessage("Editable revision created: " + String(result.analysisPlanVersion || ""));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Editable revision could not be created.");
    } finally {
      setBusy("");
    }
  }

  function resetLaterEvaluation() {
    setLaterEventId("");
    setLaterTitle("");
    setLaterResearchQuestion("");
    setLaterMetricKey("");
    setLaterMethod("weighted_population_mean");
    setLaterSegments("overall");
    setLaterFilters("");
    setLaterInterpretation("");
    setLaterPublicationLabel("");
  }

  function editLaterEvaluation(item: ResearchSurveyDesignAdminOverview["laterEvaluations"][number]) {
    setLaterEventId(item.eventId);
    setLaterTitle(item.title);
    setLaterResearchQuestion(item.researchQuestion);
    setLaterMetricKey(item.metricKey);
    setLaterMethod(item.method);
    setLaterSegments(item.segments.join(", "));
    setLaterFilters(item.filters);
    setLaterInterpretation(item.interpretation);
    setLaterPublicationLabel(item.publicationLabel);
    setMessage("");
  }

  async function saveLaterEvaluation() {
    setBusy("save_later");
    setMessage("");
    try {
      if (!laterTitle.trim() || !laterResearchQuestion.trim() || !laterMetricKey.trim() || !laterMethod.trim()) {
        throw new Error("Title, research question, metric key and method are required.");
      }
      const result = await designPost(slug, csrfToken, {
        action: "save_later_evaluation",
        priorEventId: laterEventId || undefined,
        title: laterTitle,
        researchQuestion: laterResearchQuestion,
        metricKey: laterMetricKey,
        method: laterMethod,
        segments: laterSegments.split(",").map((part) => part.trim()).filter(Boolean),
        filters: laterFilters,
        interpretation: laterInterpretation,
        publicationLabel: laterPublicationLabel
      });
      setMessage("Later evaluation saved as exploratory revision " + String(result.revision || "1") + ".");
      resetLaterEvaluation();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Later evaluation could not be saved.");
    } finally {
      setBusy("");
    }
  }

  if (!data.instrument) {
    return <section className="shell vendor-section"><div className="workspace-inline-note form-error">No questionnaire exists for this survey.</div></section>;
  }
  if (!plan) {
    return <section className="shell vendor-section">
      <div className="workspace-inline-note">No evaluation plan exists for the current questionnaire.</div>
      {canEdit && data.study.status === "draft" && <button className="button" disabled={Boolean(busy)} onClick={() => void revise()} type="button">Create evaluation draft</button>}
    </section>;
  }

  return <section className="shell vendor-section">
    <div className="workspace-action-bar">
      <span><strong>{plan.title}</strong><br />Version {plan.version} · {plan.status}</span>
      <span style={{ fontFamily: "monospace", fontSize: 12 }}>fingerprint {plan.contentSha256.slice(0, 12)}…</span>
    </div>
    <div className="workspace-inline-note">
      This page defines how answers will later be evaluated: headline metrics, standard breakdowns and explicitly exploratory analyses. It never changes raw responses.
    </div>
    {!editable && <div className="workspace-inline-note">
      This plan is frozen evidence and cannot be rewritten.
      {canRevise ? " The survey is still in draft, so you can create a new editable design revision." : " Any later analysis must remain explicitly exploratory and be documented without changing the original plan."}
    </div>}
    {canRevise && <div className="workspace-action-bar">
      <span><strong>Revise before fieldwork</strong><br />Keep this locked version and create a new draft questionnaire + evaluation revision.</span>
      <button className="button" disabled={Boolean(busy)} onClick={() => void revise()} type="button">{busy === "revision" ? "Creating…" : "Create editable revision"}</button>
    </div>}

    <div className="workspace-queue-card" style={{ display: "grid", gap: 16, marginTop: 16 }}>
      <label><strong>Evaluation plan title</strong><br /><input disabled={!editable} onChange={(event) => setTitle(event.target.value)} style={{ width: "100%" }} value={title} /></label>
      <label>
        <strong>Headline metrics</strong><br />
        <textarea disabled={!editable} onChange={(event) => setPrimary(event.target.value)} rows={7} style={{ width: "100%", fontFamily: "monospace" }} value={primary} />
        <small>One metric per line: metric key | public label | breakdowns. Example: digital_readiness.mean | Digital Readiness | overall,regionCode,sectorCode</small>
      </label>
      <label><strong>Secondary evaluation scope</strong><br /><textarea disabled={!editable} onChange={(event) => setSecondaryScope(event.target.value)} rows={4} style={{ width: "100%" }} value={secondaryScope} /></label>
      <label><strong>Standard breakdowns</strong><br /><input disabled={!editable} onChange={(event) => setSecondarySegments(event.target.value)} placeholder="overall, regionCode, sectorCode, sizeBand" style={{ width: "100%" }} value={secondarySegments} /></label>
      <label>
        <strong>Planned exploratory analyses (before fieldwork)</strong><br />
        <textarea disabled={!editable} onChange={(event) => setExploratory(event.target.value)} rows={12} style={{ width: "100%", fontFamily: "monospace" }} value={exploratory} />
        <small>These belong to the pre-fieldwork plan. Analyses added after the plan is locked are managed separately below and are always labelled exploratory.</small>
      </label>
    </div>

    <div className="analytics-workflow-grid" style={{ marginTop: 16 }}>
      <article className="analytics-workflow-card"><span>Confidence level</span><strong>{Math.round(Number(variance.confidenceLevel ?? 0.95) * 100)}%</strong><small>{String(variance.method ?? "stratified_srs_fpc_v1")} · fixed to executable analysis code.</small></article>
      <article className="analytics-workflow-card"><span>Public minimum base</span><strong>n ≥ {String(disclosure.minimumUnweightedBase ?? 30)}</strong><small>{Boolean(disclosure.smallBaseSuppression) ? "Small-base results are suppressed." : "See locked disclosure rules."}</small></article>
      <article className="analytics-workflow-card"><span>Weighting</span><strong>{String(weighting.calibrationAdjustment ?? "—")}</strong><small>Statistical implementation stays code-bound and versioned.</small></article>
    </div>

    {editable && <div className="workspace-action-bar" style={{ marginTop: 16 }}>
      <span>{message || "Save the draft as often as needed. Lock only when the evaluation design is ready."}</span>
      <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
        <button className="button button-secondary" disabled={Boolean(busy)} onClick={() => void save()} type="button">{busy === "save" ? "Saving…" : "Save evaluation draft"}</button>
        <button className="button" disabled={Boolean(busy) || !parseEvaluationOutcomes(primary).length} onClick={() => void lock()} type="button">{busy === "lock" ? "Locking…" : "Lock evaluation plan"}</button>
      </div>
    </div>}
    {!editable && message && <div className="workspace-inline-note">{message}</div>}

    <div className="workspace-queue-card" style={{ display: "grid", gap: 16, marginTop: 22 }}>
      <div className="workspace-action-bar">
        <span>
          <strong>Later evaluation</strong><br />
          Add or revise analyses after the original plan has been locked. They remain clearly classified as exploratory and never overwrite the preregistered plan.
        </span>
        <span><strong>{data.laterEvaluations.length}</strong> active definition(s)</span>
      </div>

      {data.study.status === "draft" && <div className="workspace-inline-note">
        Later evaluation becomes available once the survey leaves Draft. While still in Draft, add planned analyses to the evaluation plan above.
      </div>}

      {data.laterEvaluations.length > 0 && <div style={{ display: "grid", gap: 10 }}>
        {data.laterEvaluations.map((item) => <article className="analytics-workflow-card" key={item.definitionId}>
          <span>Exploratory · revision {item.revision}</span>
          <strong>{item.title}</strong>
          <small>{item.researchQuestion}</small>
          <small>Metric: {item.metricKey} · Method: {item.method}</small>
          <small>Breakdowns: {item.segments.length ? item.segments.join(", ") : "overall"}</small>
          {item.filters && <small>Filters: {item.filters}</small>}
          <div className="workspace-action-buttons">
            <button className="button button-secondary" disabled={!laterEditable || Boolean(busy)} onClick={() => editLaterEvaluation(item)} type="button">Edit as new revision</button>
          </div>
        </article>)}
      </div>}

      {laterEditable && <div style={{ display: "grid", gap: 12 }}>
        <div className="workspace-action-bar">
          <span><strong>{laterEventId ? "Revise later evaluation" : "Add later evaluation"}</strong><br />Saving an edit creates a new revision and preserves the earlier definition.</span>
          {laterEventId && <button className="button button-secondary" disabled={Boolean(busy)} onClick={resetLaterEvaluation} type="button">Cancel edit</button>}
        </div>
        <label><strong>Title</strong><br /><input onChange={(event) => setLaterTitle(event.target.value)} style={{ width: "100%" }} value={laterTitle} /></label>
        <label><strong>Research question</strong><br /><textarea onChange={(event) => setLaterResearchQuestion(event.target.value)} rows={3} style={{ width: "100%" }} value={laterResearchQuestion} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <label><strong>Metric / evaluation key</strong><br /><input onChange={(event) => setLaterMetricKey(event.target.value)} placeholder="digital_readiness.mean" style={{ width: "100%" }} value={laterMetricKey} /></label>
          <label><strong>Method</strong><br /><input onChange={(event) => setLaterMethod(event.target.value)} placeholder="weighted_population_mean" style={{ width: "100%" }} value={laterMethod} /></label>
        </div>
        <label><strong>Breakdowns</strong><br /><input onChange={(event) => setLaterSegments(event.target.value)} placeholder="overall, regionCode, sectorCode" style={{ width: "100%" }} value={laterSegments} /><small>Comma-separated.</small></label>
        <label><strong>Filters / population subset</strong><br /><textarea onChange={(event) => setLaterFilters(event.target.value)} placeholder="Optional inclusion/filter rule" rows={2} style={{ width: "100%" }} value={laterFilters} /></label>
        <label><strong>Interpretation / reason for adding later</strong><br /><textarea onChange={(event) => setLaterInterpretation(event.target.value)} rows={3} style={{ width: "100%" }} value={laterInterpretation} /></label>
        <label><strong>Public label</strong><br /><input onChange={(event) => setLaterPublicationLabel(event.target.value)} placeholder={laterTitle || "Label shown in results"} style={{ width: "100%" }} value={laterPublicationLabel} /></label>
        <div className="workspace-action-bar">
          <span>Classification is fixed: <strong>Exploratory / added after registration</strong>.</span>
          <button className="button" disabled={Boolean(busy) || !laterTitle.trim() || !laterResearchQuestion.trim() || !laterMetricKey.trim() || !laterMethod.trim()} onClick={() => void saveLaterEvaluation()} type="button">
            {busy === "save_later" ? "Saving…" : laterEventId ? "Save new revision" : "Add later evaluation"}
          </button>
        </div>
      </div>}

      {!laterEditable && data.study.status !== "draft" && <div className="workspace-inline-note">
        You have read-only access to later evaluation definitions. Research analysis permission is required to add or revise them.
      </div>}
    </div>
  </section>;
}
