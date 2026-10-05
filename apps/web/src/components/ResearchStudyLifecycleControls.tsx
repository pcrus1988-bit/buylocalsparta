"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "lock_instrument" | "start_pilot" | "start_fielding" | "close_fieldwork" | "begin_analysis" | "publish_release";

const LABELS: Record<Action, string> = {
  lock_instrument: "Κλείδωμα questionnaire",
  start_pilot: "Έναρξη pilot",
  start_fielding: "Έναρξη fieldwork",
  close_fieldwork: "Κλείσιμο fieldwork",
  begin_analysis: "Έναρξη analysis",
  publish_release: "Δημοσίευση release"
};

export function ResearchStudyLifecycleControls({
  slug,
  csrfToken,
  studyStatus,
  instrumentStatus,
  analysisPlanStatus,
  latestReleaseVersion,
  latestReleasePublishedAt
}: {
  slug: string;
  csrfToken: string;
  studyStatus: string;
  instrumentStatus?: string;
  analysisPlanStatus?: string;
  latestReleaseVersion?: string;
  latestReleasePublishedAt?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState("");

  const actions: Action[] = [];
  const analysisPlanLocked = analysisPlanStatus === "locked";
  if (studyStatus === "draft" && instrumentStatus === "draft") actions.push("lock_instrument");
  if (studyStatus === "draft" && instrumentStatus === "locked" && analysisPlanLocked) actions.push("start_pilot", "start_fielding");
  if (studyStatus === "pilot") {
    if (analysisPlanLocked) actions.push("start_fielding");
    actions.push("close_fieldwork");
  }
  if (studyStatus === "fielding") actions.push("close_fieldwork");
  if (studyStatus === "closed") actions.push("begin_analysis");
  if (studyStatus === "analysis" && latestReleaseVersion && !latestReleasePublishedAt) actions.push("publish_release");

  async function run(action: Action) {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Research lifecycle transition failed");
      setMessage(action === "publish_release" ? "Το reproducible release δημοσιεύτηκε." : "Η μετάβαση καταχωρήθηκε.");
      router.refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Η ενέργεια απέτυχε.";
      setMessage(raw === "RESEARCH_FIELDING_REQUIRES_FRAME_AND_SAMPLE"
        ? "Για πλήρες fieldwork απαιτείται frozen population frame και locked sample draw."
        : raw === "RESEARCH_PILOT_REQUIRES_LOCKED_ANALYSIS_PLAN" || raw === "RESEARCH_FIELDING_REQUIRES_LOCKED_ANALYSIS_PLAN"
          ? "Πριν από pilot ή fieldwork πρέπει να υπάρχει locked pre-fieldwork analysis plan για το ενεργό questionnaire."
          : raw);
    } finally {
      setBusy(null);
    }
  }

  if (!actions.length) {
    if (["draft", "pilot"].includes(studyStatus) && instrumentStatus !== "draft" && !analysisPlanLocked) {
      return <div className="workspace-inline-note form-error">
        Pilot/fieldwork is blocked until the pre-fieldwork analysis plan for this questionnaire is locked.
      </div>;
    }
    return null;
  }
  return <div className="workspace-action-bar">
    <span>{message || "Οι αλλαγές lifecycle είναι ελεγχόμενες και καταγράφονται στο admin audit."}</span>
    <div className="workspace-action-buttons">
      {actions.map((action) => <button
        className={action === "close_fieldwork" ? "button button-secondary" : "button"}
        disabled={Boolean(busy)}
        key={action}
        onClick={() => run(action)}
        type="button"
      >{busy === action ? "Εκτέλεση…" : LABELS[action]}</button>)}
    </div>
  </div>;
}
