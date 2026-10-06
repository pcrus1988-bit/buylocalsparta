"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchQualityReviewItem } from "../lib/research-survey-quality";

export function ResearchStudyQualityControls({
  slug,
  csrfToken,
  initialItems
}: {
  slug: string;
  csrfToken: string;
  initialItems: readonly ResearchQualityReviewItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState([...initialItems]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");

  async function resolve(item: ResearchQualityReviewItem, decision: "include" | "exclude") {
    setBusy(item.responseId);
    setMessage("");
    try {
      const response = await fetch(
        "/api/admin/research/surveys/" + encodeURIComponent(slug) + "/quality",
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({
            responseId: item.responseId,
            decision,
            note: notes[item.responseId] || undefined
          })
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "RESEARCH_QA_RESOLVE_FAILED");
      setItems((current) => current.filter((candidate) => candidate.responseId !== item.responseId));
      setMessage(decision === "include"
        ? "Η απάντηση εγκρίθηκε για την ανάλυση."
        : "Η απάντηση αποκλείστηκε από την ανάλυση με διατηρημένο audit trail.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η ολοκλήρωση του QA review.");
    } finally {
      setBusy(undefined);
    }
  }

  if (!items.length) {
    return <div className="workspace-queue-card">
      <div className="workspace-action-bar">
        <span><strong>Response QA</strong><br />Δεν υπάρχουν εκκρεμείς manual quality reviews.</span>
      </div>
      {message && <div className="workspace-inline-note">{message}</div>}
    </div>;
  }

  return <div className="workspace-queue-card">
    <div className="workspace-action-bar">
      <span>
        <strong>Response QA · {items.length} pending</strong><br />
        Η ανάλυση παραμένει κλειδωμένη μέχρι κάθε flagged ολοκληρωμένη απάντηση να γίνει include ή exclude.
      </span>
    </div>
    {items.map((item) => <div className="workspace-action-bar" key={item.responseId}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <strong>{item.regionCode} · {item.sectorCode}</strong><br />
        <small>
          quality {item.responseQualityScore}/100 · {item.durationSeconds}s · flags: {item.reasonCodes.join(", ") || "manual review"} ·
          readiness {item.digitalReadinessScore ?? "—"} · friction {item.frictionOverallScore ?? "—"}
        </small>
        <input
          aria-label={"QA note " + item.responseId}
          maxLength={500}
          onChange={(event) => setNotes((current) => ({ ...current, [item.responseId]: event.target.value }))}
          placeholder="Σημείωση ελέγχου (προαιρετική)"
          type="text"
          value={notes[item.responseId] || ""}
        />
      </div>
      <div className="workspace-action-buttons">
        <button
          className="button button-secondary"
          disabled={Boolean(busy)}
          onClick={() => void resolve(item, "include")}
          type="button"
        >{busy === item.responseId ? "Αποθήκευση…" : "Include"}</button>
        <button
          className="button"
          disabled={Boolean(busy)}
          onClick={() => void resolve(item, "exclude")}
          type="button"
        >{busy === item.responseId ? "Αποθήκευση…" : "Exclude"}</button>
      </div>
    </div>)}
    {message && <div className="workspace-inline-note">{message}</div>}
  </div>;
}
