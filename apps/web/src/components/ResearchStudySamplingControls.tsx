"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResearchStudySamplingControls({
  slug,
  csrfToken,
  latestFrameStatus,
  studyStatus,
  framePopulation,
  phasePopulation,
  pilotHoldoutUnits,
  latestFrameStrata,
  activeContacts,
  latestSampleStatus,
  latestSampleTarget,
  queuedJobs,
  runningJobs
}: {
  slug: string;
  csrfToken: string;
  latestFrameStatus?: string;
  studyStatus: string;
  framePopulation: number;
  phasePopulation: number;
  pilotHoldoutUnits: number;
  latestFrameStrata: number;
  activeContacts: number;
  latestSampleStatus?: string;
  latestSampleTarget: number;
  queuedJobs: number;
  runningJobs: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"frame" | "sample" | null>(null);
  const [targetN, setTargetN] = useState("");
  const fieldworkPhase: "pilot" | "main" = ["draft","pilot"].includes(studyStatus) ? "pilot" : "main";
  const effectivePopulation = fieldworkPhase === "main" ? phasePopulation : framePopulation;
  const [targetCompletes, setTargetCompletes] = useState("500");
  const [expectedResponsePct, setExpectedResponsePct] = useState("15");
  const [randomSeed, setRandomSeed] = useState("");
  const [message, setMessage] = useState("");
  const workerBusy = queuedJobs > 0 || runningJobs > 0;
  const sampleN = Number(targetN);
  const sampleValid = Number.isSafeInteger(sampleN) && sampleN >= 100 && sampleN <= 100_000;
  const desiredCompletes = Number(targetCompletes);
  const responseRate = Number(expectedResponsePct) / 100;
  const contactabilityRate = effectivePopulation > 0 ? Math.min(1, activeContacts / effectivePopulation) : 0;
  const rawSuggested = desiredCompletes > 0 && responseRate > 0 && contactabilityRate > 0
    ? Math.ceil(desiredCompletes / (responseRate * contactabilityRate))
    : 0;
  const suggestedSelected = rawSuggested > 0
    ? Math.min(effectivePopulation, 100_000, Math.max(100, rawSuggested))
    : 0;
  const expectedInvitable = Math.round(suggestedSelected * contactabilityRate);
  const expectedCompletesAtSuggestion = Math.round(expectedInvitable * responseRate);
  const preferredVarianceFloor = Math.min(effectivePopulation, latestFrameStrata * 2);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Research job could not be queued");
    return result as { jobId: string; randomSeed?: string };
  }

  async function buildFrame() {
    setBusy("frame");
    setMessage("");
    try {
      const result = await post({ action: "build_frame" });
      setMessage("Το frozen ΓΕΜΗ frame μπήκε στην ουρά. Job " + result.jobId + ".");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η δημιουργία frame απέτυχε.");
    } finally {
      setBusy(null);
    }
  }

  async function drawSample() {
    if (!sampleValid) return;
    setBusy("sample");
    setMessage("");
    try {
      const result = await post({
        action: "draw_sample",
        targetN: sampleN,
        randomSeed: randomSeed.trim() || undefined,
        fieldworkPhase
      });
      if (result.randomSeed) setRandomSeed(result.randomSeed);
      setMessage(`Το ${fieldworkPhase === "pilot" ? "pilot" : "main"} sample draw μπήκε στην ουρά. Το random seed έχει παγώσει και καταγράφεται στο evidence chain.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Το sample draw απέτυχε.");
    } finally {
      setBusy(null);
    }
  }

  return <div className="workspace-queue-card">
    <div className="workspace-action-bar">
      <span>
        <strong>Population frame</strong><br />
        {latestFrameStatus
          ? `Latest: ${latestFrameStatus} · ${framePopulation.toLocaleString("el-GR")} frozen-frame businesses`
          : "Δεν έχει παγώσει ακόμη population frame."}
        {fieldworkPhase === "main" && pilotHoldoutUnits > 0
          ? ` · ${pilotHoldoutUnits.toLocaleString("el-GR")} pilot holdout → ${effectivePopulation.toLocaleString("el-GR")} main-eligible`
          : ""}
      </span>
      <button
        className="button button-secondary"
        disabled={Boolean(busy) || workerBusy}
        onClick={() => void buildFrame()}
        type="button"
      >{busy === "frame" ? "Queueing…" : latestFrameStatus === "frozen" ? "Refresh frame" : "Build frozen frame"}</button>
    </div>

    <div className="workspace-action-bar">
      <div style={{ width: "100%", display: "grid", gap: 10 }}>
        <span>
          <strong>Fieldwork feasibility & sample planner</strong><br />
          {fieldworkPhase === "pilot" ? "Pilot" : "Main"} contactability: {effectivePopulation > 0
            ? new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 2 }).format(contactabilityRate)
            : "—"}
          {" · "}{activeContacts.toLocaleString("el-GR")} active email contacts / {effectivePopulation.toLocaleString("el-GR")} eligible units
          {" · "}{latestFrameStrata.toLocaleString("el-GR")} sampling strata.
        </span>
        <div className="workspace-action-buttons">
          <input
            aria-label="Desired completed questionnaires"
            inputMode="numeric"
            min={1}
            onChange={(event) => setTargetCompletes(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Desired completes"
            type="number"
            value={targetCompletes}
          />
          <input
            aria-label="Expected response percent among invited businesses"
            inputMode="decimal"
            min={1}
            max={100}
            onChange={(event) => setExpectedResponsePct(event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="Response %"
            type="number"
            value={expectedResponsePct}
          />
          <button
            className="button button-secondary"
            disabled={!suggestedSelected}
            onClick={() => setTargetN(String(suggestedSelected))}
            type="button"
          >Use suggested n</button>
        </div>
        <small>
          {suggestedSelected
            ? `Suggested selected n: ${suggestedSelected.toLocaleString("el-GR")} → about ${expectedInvitable.toLocaleString("el-GR")} contactable units → about ${expectedCompletesAtSuggestion.toLocaleString("el-GR")} completes at ${expectedResponsePct || "0"}% invited-response assumption.`
            : "A suggestion appears once the frame has active contacts and valid completion/response assumptions."}
          {preferredVarianceFloor > 0
            ? ` Preferred design floor for the v2 draw is up to two selected units per stratum (${preferredVarianceFloor.toLocaleString("el-GR")} units if capacity permits).`
            : ""}
        </small>
        {rawSuggested > 100_000 && <div className="workspace-inline-note form-error">
          The desired completion target would require more than the current 100,000-unit draw safety cap at this contactability/response assumption. This is a fieldwork feasibility warning, not a reason to treat the smaller sample as equivalent.
        </div>}
        {contactabilityRate > 0 && contactabilityRate < 0.1 && <div className="workspace-inline-note form-error">
          Fewer than 10% of currently eligible units have an active email contact. Email-only fieldwork may create substantial contactability bias; expand the contact layer or narrow the target-population claim before interpreting the study as representative of the full frame.
        </div>}
      </div>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Probability sample</strong><br />
        {latestSampleStatus
          ? `Latest: ${latestSampleStatus} · ${latestSampleTarget.toLocaleString("el-GR")} selected units`
          : "Set the number of selected businesses. This is not the target number of completed questionnaires."}
      </span>
      <div className="workspace-action-buttons">
        <strong>{fieldworkPhase === "pilot" ? "Pilot holdout" : "Main fieldwork"}</strong>
        <input
          aria-label="Selected businesses"
          inputMode="numeric"
          min={100}
          max={100000}
          onChange={(event) => setTargetN(event.target.value.replace(/[^0-9]/g, ""))}
          placeholder="Selected units"
          type="number"
          value={targetN}
        />
        <input
          aria-label="Random seed"
          onChange={(event) => setRandomSeed(event.target.value)}
          placeholder="Random seed (optional)"
          type="text"
          value={randomSeed}
        />
        <button
          className="button"
          disabled={Boolean(busy) || workerBusy || latestFrameStatus !== "frozen" || !sampleValid || (fieldworkPhase === "main" && studyStatus !== "fielding")}
          onClick={() => void drawSample()}
          type="button"
        >{busy === "sample" ? "Queueing…" : "Draw reproducible sample"}</button>
      </div>
    </div>

    <div className="workspace-inline-note">
      {message || (workerBusy
        ? `Worker jobs pending/running: ${queuedJobs + runningJobs}. Frame/sample actions remain locked until the current job finishes.`
        : "Pilot and main samples are deliberately separate. Main draws exclude businesses exposed during the pilot; sample size is still chosen from precision, subgroup and expected-response needs.")}
    </div>
  </div>;
}
