"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchQualityReviewItem } from "../lib/research-survey-quality";

export function ResearchStudyQualityControls({
  slug,
  csrfToken,
  initialItems,
  initialTotal
}: {
  slug: string;
  csrfToken: string;
  initialItems: readonly ResearchQualityReviewItem[];
  initialTotal: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState([...initialItems]);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
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
      setTotal((current) => Math.max(0, current - 1));
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

  async function loadMore() {
    setLoadingMore(true);
    setMessage("");
    try {
      const response = await fetch(
        "/api/admin/research/surveys/" + encodeURIComponent(slug) + "/quality?offset=" + items.length,
        { cache: "no-store" }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "RESEARCH_QA_LOAD_FAILED");
      setItems((current) => {
        const known = new Set(current.map((item) => item.responseId));
        return [...current, ...((body.items || []) as ResearchQualityReviewItem[])
          .filter((item) => !known.has(item.responseId))];
      });
      setTotal(Number(body.total ?? total));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η φόρτωση περισσότερων ελέγχων.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (!items.length && total === 0) {
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
        <strong>Response QA · {total} pending</strong><br />
        <small>Προβάλλονται {items.length} από {total} · έως 50 νέες απαντήσεις ανά φόρτωση</small><br />
        Η ανάλυση παραμένει κλειδωμένη μέχρι κάθε flagged ολοκληρωμένη απάντηση να γίνει include ή exclude.
      </span>
    </div>
    {items.map((item) => <div className="workspace-action-bar" key={item.responseId}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <strong>{item.regionCode} · {item.sectorCode}</strong><br />
        <small>
          {item.source === "admin_content_recovery" ? "Διοικητική ανάκτηση · δεν καταγράφηκε τελική υποβολή" : "Αυτόματος ποιοτικός έλεγχος"} · {item.durationSeconds}s · quality {item.qualityScore ?? "—"}/100 · flags: {item.reasonCodes.join(", ") || "manual review"} ·
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
    {items.length < total && <div className="workspace-action-bar">
      <button className="button button-secondary" disabled={loadingMore || Boolean(busy)}
        onClick={() => void loadMore()} type="button">
        {loadingMore ? "Φόρτωση…" : "Φόρτωση επόμενων 50"}
      </button>
    </div>}
    {message && <div className="workspace-inline-note">{message}</div>}
  </div>;
}
