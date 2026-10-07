"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchProtocolEvent } from "../lib/research-survey-runtime";

export function ResearchStudyProtocolControls({
  slug,
  csrfToken,
  studyStatus,
  events
}: {
  slug: string;
  csrfToken: string;
  studyStatus: string;
  events: readonly ResearchProtocolEvent[];
}) {
  const router = useRouter();
  const defaultPhase = studyStatus === "pilot"
    ? "pilot"
    : studyStatus === "fielding" || studyStatus === "closed"
      ? "main"
      : studyStatus === "analysis"
        ? "analysis"
        : studyStatus === "published"
          ? "publication"
          : "design";
  const [eventType, setEventType] = useState<ResearchProtocolEvent["eventType"]>("deviation");
  const [lifecyclePhase, setLifecyclePhase] = useState<ResearchProtocolEvent["lifecyclePhase"]>(defaultPhase);
  const [category, setCategory] = useState<ResearchProtocolEvent["category"]>("operations");
  const [severity, setSeverity] = useState<ResearchProtocolEvent["severity"]>("minor");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rationale, setRationale] = useState("");
  const [impactAssessment, setImpactAssessment] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [relatedEventId, setRelatedEventId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const resolvable = useMemo(
    () => events.filter((event) => event.eventType !== "resolution").slice(0, 100),
    [events]
  );
  const canSubmit = title.trim().length >= 5
    && description.trim().length >= 10
    && (!["material","critical"].includes(severity) || impactAssessment.trim().length > 0)
    && (eventType !== "resolution" || (relatedEventId && correctiveAction.trim().length > 0));

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/protocol-events", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          eventType,lifecyclePhase,category,severity,title,description,rationale,
          impactAssessment,correctiveAction,relatedEventId: relatedEventId || undefined
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Protocol evidence could not be recorded");
      setMessage("Το protocol event κλειδώθηκε στο evidence ledger.");
      setTitle("");
      setDescription("");
      setRationale("");
      setImpactAssessment("");
      setCorrectiveAction("");
      setRelatedEventId("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η καταχώριση απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="workspace-queue-card">
    <div>
      <strong>Protocol deviations & amendments</strong>
      <p style={{ marginBottom: 8 }}>
        Append-only evidence for changes, departures and resolutions. Material/critical events require an impact assessment and are frozen into the published release.
      </p>
    </div>
    <div className="workspace-action-buttons">
      <select aria-label="Protocol event type" value={eventType} onChange={(event) => setEventType(event.target.value as ResearchProtocolEvent["eventType"])}>
        <option value="deviation">Deviation</option>
        <option value="amendment">Amendment</option>
        <option value="resolution">Resolution</option>
      </select>
      <select aria-label="Lifecycle phase" value={lifecyclePhase} onChange={(event) => setLifecyclePhase(event.target.value as ResearchProtocolEvent["lifecyclePhase"])}>
        <option value="design">Design</option>
        <option value="pilot">Pilot</option>
        <option value="main">Main fieldwork</option>
        <option value="analysis">Analysis</option>
        <option value="publication">Publication</option>
      </select>
      <select aria-label="Protocol category" value={category} onChange={(event) => setCategory(event.target.value as ResearchProtocolEvent["category"])}>
        <option value="instrument">Instrument</option>
        <option value="sampling">Sampling</option>
        <option value="recruitment">Recruitment</option>
        <option value="fieldwork">Fieldwork</option>
        <option value="privacy">Privacy</option>
        <option value="analysis">Analysis</option>
        <option value="publication">Publication</option>
        <option value="operations">Operations</option>
      </select>
      <select aria-label="Protocol severity" value={severity} onChange={(event) => setSeverity(event.target.value as ResearchProtocolEvent["severity"])}>
        <option value="info">Info</option>
        <option value="minor">Minor</option>
        <option value="material">Material</option>
        <option value="critical">Critical</option>
      </select>
    </div>
    {eventType === "resolution" && <select
      aria-label="Protocol event to resolve"
      value={relatedEventId}
      onChange={(event) => setRelatedEventId(event.target.value)}
    >
      <option value="">Select event to resolve</option>
      {resolvable.map((event) => <option key={event.id} value={event.id}>
        {event.severity.toUpperCase()} · {event.title}
      </option>)}
    </select>}
    <input aria-label="Protocol event title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short title" />
    <textarea aria-label="Protocol event description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What changed or happened?" rows={3} />
    <textarea aria-label="Protocol event rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Rationale / cause (optional)" rows={2} />
    <textarea aria-label="Protocol event impact assessment" value={impactAssessment} onChange={(event) => setImpactAssessment(event.target.value)} placeholder="Impact on validity, participants or interpretation" rows={2} />
    <textarea aria-label="Protocol corrective action" value={correctiveAction} onChange={(event) => setCorrectiveAction(event.target.value)} placeholder="Corrective action / resolution (required for resolution)" rows={2} />
    <div className="workspace-action-bar">
      <span>{message || "Recorded rows are immutable; corrections are appended as new protocol events."}</span>
      <button className="button button-secondary" disabled={!canSubmit || busy} onClick={() => void submit()} type="button">
        {busy ? "Recording…" : "Record protocol evidence"}
      </button>
    </div>
    {events.length > 0 && <div style={{ display: "grid", gap: 8 }}>
      {events.slice(0, 12).map((event) => <div className="workspace-inline-note" key={event.id}>
        <strong>{event.severity.toUpperCase()} · {event.eventType} · {event.title}</strong><br />
        {event.lifecyclePhase} / {event.category} · {new Date(event.occurredAt).toLocaleString("el-GR")} · SHA {event.contentSha256.slice(0, 12)}…<br />
        {event.description}
      </div>)}
    </div>}
  </div>;
}
