"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchQuestion, ResearchQuestionType } from "../lib/research-survey-model";
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
  const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/design", {
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
  data
}: {
  slug: string;
  csrfToken: string;
  canEdit: boolean;
  data: ResearchSurveyDesignAdminOverview;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const instrument = data.instrument;
  const editable = Boolean(canEdit && data.study.status === "draft" && instrument?.status === "draft");
  const canCreateRevision = Boolean(canEdit && data.study.status === "draft" && instrument && instrument.status !== "draft");

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

    {canCreateRevision && <div className="workspace-action-bar">
      <span><strong>Need to change a locked questionnaire?</strong><br />Create a new draft version with the same questions and a matching draft evaluation plan.</span>
      <button className="button" disabled={busy} onClick={() => void createRevision()} type="button">{busy ? "Creating…" : "Create editable revision"}</button>
    </div>}

    {message && <div className={message.startsWith("Editable") ? "workspace-inline-note" : "workspace-inline-note form-error"}>{message}</div>}

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
