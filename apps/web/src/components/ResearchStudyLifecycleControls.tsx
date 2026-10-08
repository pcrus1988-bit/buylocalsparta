"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "lock_instrument" | "start_pilot" | "start_fielding" | "close_fieldwork" | "begin_analysis" | "publish_release";

const LABELS: Record<Action, string> = {
  lock_instrument: "Κλείδωμα questionnaire",
  start_pilot: "Έναρξη pilot",
  start_fielding: "Έναρξη κύριου fieldwork",
  close_fieldwork: "Κλείσιμο fieldwork",
  begin_analysis: "Έναρξη analysis",
  publish_release: "Δημοσίευση release"
};

const CONFIRM_WORD: Record<Action, string> = {
  lock_instrument: "LOCK",
  start_pilot: "PILOT",
  start_fielding: "MAIN",
  close_fieldwork: "CLOSE",
  begin_analysis: "ANALYZE",
  publish_release: "PUBLISH"
};

const IMPACT: Record<Action, string> = {
  lock_instrument: "Locks the current questionnaire version. Review every question and consent text first.",
  start_pilot: "Opens a real Pilot phase. Pilot responses are diagnostic only; any subsequent emails are real sends.",
  start_fielding: "Ends Pilot activity and opens the official study. Confirm the frozen frame, holdout, consent and absence of running Pilot jobs.",
  close_fieldwork: "Closes official data collection. Check the Athens-time deadline and outstanding invitations.",
  begin_analysis: "Moves this study to formal analysis using its locked plan and reviewed data.",
  publish_release: "Publishes the research release. Verify methods, anonymity, privacy and all public outputs."
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
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [confirmationWord, setConfirmationWord] = useState("");

  const actions: Action[] = [];
  const analysisPlanLocked = analysisPlanStatus === "locked";
  if (studyStatus === "draft" && instrumentStatus === "draft") actions.push("lock_instrument");
  if (studyStatus === "draft" && instrumentStatus === "locked" && analysisPlanLocked) actions.push("start_pilot");
  if (studyStatus === "pilot" && analysisPlanLocked) actions.push("start_fielding");
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
      setPendingAction(null);
      setConfirmationWord("");
      router.refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Η ενέργεια απέτυχε.";
      setMessage(raw === "RESEARCH_FIELDING_REQUIRES_FROZEN_FRAME"
        ? "Για να κλείσει το pilot και να ανοίξει το κύριο fieldwork απαιτείται frozen population frame. Το main sample draw γίνεται αμέσως μετά, ώστε να αποκλειστούν οριστικά όσοι εκτέθηκαν στο pilot."
        : raw === "RESEARCH_PILOT_CLOSE_CONTACT_JOB_RUNNING"
          ? "Υπάρχει ακόμη ενεργό pilot sample/invitation/reminder job. Το pilot δεν κλείνει μέχρι να ολοκληρωθεί."
          : raw === "RESEARCH_FIELDWORK_CLOSE_REQUIRES_MAIN_SAMPLE"
            ? "Το κύριο fieldwork δεν μπορεί να κλείσει χωρίς locked main probability sample."
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
        onClick={() => { setPendingAction(action); setConfirmationWord(""); setMessage(""); }}
        type="button"
      >{busy === action ? "Εκτέλεση…" : LABELS[action]}</button>)}
    </div>
    {pendingAction && <div className="workspace-queue-card" role="group" aria-label="Confirm research phase action" style={{ width: "100%", marginTop: 14 }}>
      <strong>Confirm: {LABELS[pendingAction]}</strong>
      <p>Survey: <strong>{slug}</strong>. {IMPACT[pendingAction]}</p>
      <label htmlFor="research-action-confirm-word">To proceed, type <strong>{CONFIRM_WORD[pendingAction]}</strong>:</label>
      <div className="workspace-action-buttons" style={{ marginTop: 10 }}>
        <input id="research-action-confirm-word" autoComplete="off" spellCheck={false}
          value={confirmationWord} onChange={(event) => setConfirmationWord(event.target.value)}
          aria-label="Type the confirmation word" />
        <button type="button" className="button" disabled={Boolean(busy) || confirmationWord.trim() !== CONFIRM_WORD[pendingAction]}
          onClick={() => void run(pendingAction)}>
          {busy === pendingAction ? "Working…" : "Confirm irreversible action"}
        </button>
        <button type="button" className="button button-secondary" disabled={Boolean(busy)}
          onClick={() => { setPendingAction(null); setConfirmationWord(""); }}>Cancel</button>
      </div>
    </div>}
  </div>;
}
