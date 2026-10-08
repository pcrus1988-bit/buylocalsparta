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
  latestSampleDesignSha256,
  latestSampleDesiredCompletes,
  latestSampleExpectedResponseRate,
  latestSampleContactabilityRate,
  latestSampleExpectedCompletes,
  queuedJobs,
  runningJobs,
  blockingSamplingJobs
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
  latestSampleDesignSha256?: string;
  latestSampleDesiredCompletes: number;
  latestSampleExpectedResponseRate: number;
  latestSampleContactabilityRate: number;
  latestSampleExpectedCompletes: number;
  queuedJobs: number;
  runningJobs: number;
  blockingSamplingJobs: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"frame" | "sample" | null>(null);
  const [targetN, setTargetN] = useState("");
  const fieldworkPhase: "pilot" | "main" = ["draft","pilot"].includes(studyStatus) ? "pilot" : "main";
  const effectivePopulation = fieldworkPhase === "main" ? phasePopulation : framePopulation;
  const [targetCompletes, setTargetCompletes] = useState(fieldworkPhase === "pilot" ? "20" : "500");
  const [expectedResponsePct, setExpectedResponsePct] = useState("15");
  const [randomSeed, setRandomSeed] = useState("");
  const [message, setMessage] = useState("");
  const workerBusy = queuedJobs > 0 || runningJobs > 0;
  // A Cohort B frame importer is independent of Pilot Cohort A sampling.
  const samplingWorkerBusy = blockingSamplingJobs > 0;
  const usableFrame = fieldworkPhase === "pilot"
    ? latestFrameStatus === "frozen" || latestFrameStatus === "superseded"
    : latestFrameStatus === "frozen";
  const pilotAlreadyDrawn = fieldworkPhase === "pilot"
    && (latestSampleStatus === "locked" || latestSampleStatus === "fielded");
  const sampleN = Number(targetN);
  const minSampleN = fieldworkPhase === "pilot" ? 10 : 100;
  const maxSampleN = fieldworkPhase === "pilot" ? 1_000 : 100_000;
  const desiredCompletes = Number(targetCompletes);
  const responseRate = Number(expectedResponsePct) / 100;
  const planningAssumptionsValid = Number.isSafeInteger(desiredCompletes)
    && desiredCompletes >= 1
    && desiredCompletes <= Math.max(1, sampleN)
    && Number.isFinite(responseRate)
    && responseRate > 0
    && responseRate <= 1;
  const sampleValid = Number.isSafeInteger(sampleN)
    && sampleN >= minSampleN
    && sampleN <= maxSampleN
    && planningAssumptionsValid;
  const contactabilityRate = effectivePopulation > 0 ? Math.min(1, activeContacts / effectivePopulation) : 0;
  const rawSuggested = fieldworkPhase === "main" && desiredCompletes > 0 && responseRate > 0 && contactabilityRate > 0
    ? Math.ceil(desiredCompletes / (responseRate * contactabilityRate))
    : 0;
  const suggestedSelected = rawSuggested > 0
    ? Math.min(effectivePopulation, maxSampleN, Math.max(minSampleN, rawSuggested))
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
        desiredCompleteN: desiredCompletes,
        expectedResponseRate: responseRate,
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
          ? fieldworkPhase === "pilot"
            ? `Cohort A · original frozen baseline (${latestFrameStatus}) · ${framePopulation.toLocaleString("el-GR")} businesses`
            : `Latest frozen main frame: ${latestFrameStatus} · ${framePopulation.toLocaleString("el-GR")} businesses`
          : "No eligible frozen population frame exists for this phase."
        {fieldworkPhase === "main" && pilotHoldoutUnits > 0
          ? ` · ${pilotHoldoutUnits.toLocaleString("el-GR")} pilot holdout → ${effectivePopulation.toLocaleString("el-GR")} main-eligible`
          : ""}
      </span>
      <button
        className="button button-secondary"
        disabled={Boolean(busy) || workerBusy || (fieldworkPhase === "pilot" && usableFrame)}
        onClick={() => void buildFrame()}
        type="button"
      >{busy === "frame" ? "Queueing…" : workerBusy ? "Cohort B build in progress" : fieldworkPhase === "pilot" && usableFrame ? "Cohort A already frozen" : usableFrame ? "Refresh frame" : "Build frozen frame"}</button>
    </div>

    <div className="workspace-action-bar">
      <div style={{ width: "100%", display: "grid", gap: 10 }}>
        <span>
          <strong>Fieldwork feasibility & sample planner</strong><br />
          {fieldworkPhase === "pilot" ? "Pilot · Cohort A" : "Main"} contactability: {effectivePopulation > 0
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
          {fieldworkPhase === "pilot"
            ? "Pilot sizing is diagnostic rather than inferential: choose 10–1,000 units and an explicit pilot-completion target to test comprehension, routing and fieldwork operations. The assumptions are frozen with the draw; the main sample is calculated only after the pilot holdout is sealed."
            : suggestedSelected
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
        {latestSampleDesignSha256 ? <><br />
          Frozen design: {latestSampleDesiredCompletes.toLocaleString("el-GR")} desired completes · {" "}
          {new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(latestSampleExpectedResponseRate)} invited-response assumption · {" "}
          {new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(latestSampleContactabilityRate)} contactability · {" "}
          {latestSampleExpectedCompletes.toLocaleString("el-GR")} expected completes · {latestSampleDesignSha256.slice(0, 12)}…
        </> : null}
      </span>
      <div className="workspace-action-buttons">
        <strong>{fieldworkPhase === "pilot" ? "Pilot holdout" : "Main fieldwork"}</strong>
        <input
          aria-label="Selected businesses"
          inputMode="numeric"
          min={minSampleN}
          max={maxSampleN}
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
          disabled={Boolean(busy) || samplingWorkerBusy || !usableFrame || !sampleValid || pilotAlreadyDrawn || (fieldworkPhase === "main" && studyStatus !== "fielding")}
          onClick={() => void drawSample()}
          type="button"
        >{busy === "sample" ? "Queueing…" : "Draw reproducible sample"}</button>
      </div>
    </div>

    <div className="workspace-inline-note">
      {message || (samplingWorkerBusy
        ? `A sample or delivery job is running (${blockingSamplingJobs}). The draw remains locked until it finishes.`
        : fieldworkPhase === "pilot" && usableFrame && workerBusy
          ? "Cohort A is frozen and ready for diagnostic sampling. Cohort B is building independently; do not restart its frame job. No real emails are sent when drawing a sample."
          : pilotAlreadyDrawn
            ? "A Pilot sample has already been locked. Review it before considering any additional draw."
            : "Pilot and main samples are deliberately separate. Pilot draws use diagnostic bounds (10–1,000); main draws use inferential bounds (100–100,000) and exclude every business actually contacted during the pilot.")}
    </div>
  </div>;
}
