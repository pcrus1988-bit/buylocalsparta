"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResearchStudySamplingControls({
  slug,
  csrfToken,
  latestFrameStatus,
  cohortAStatus,
  cohortAPopulation,
  cohortAContacts,
  cohortASampleStatus,
  cohortARecruitmentMode,
  cohortASampleSelected,
  cohortBStatus,
  cohortBPopulation,
  cohortBContacts,
  cohortBSampleStatus,
  cohortBRecruitmentMode,
  cohortBSampleSelected,
  queuedSampleJobs,
  runningSampleJobs,
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
  runningJobs
}: {
  slug: string;
  csrfToken: string;
  latestFrameStatus?: string;
  cohortAStatus?: string;
  cohortAPopulation?: number;
  cohortAContacts?: number;
  cohortASampleStatus?: string;
  cohortARecruitmentMode?: string;
  cohortASampleSelected?: number;
  cohortBStatus?: string;
  cohortBPopulation?: number;
  cohortBContacts?: number;
  cohortBSampleStatus?: string;
  cohortBRecruitmentMode?: string;
  cohortBSampleSelected?: number;
  queuedSampleJobs: number;
  runningSampleJobs: number;
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
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"frame" | "sample" | "census" | null>(null);
  const [targetN, setTargetN] = useState("");
  const [cohort, setCohort] = useState<"A" | "B">("A");
  const fieldworkPhase: "pilot" | "main" = ["draft","pilot"].includes(studyStatus) ? "pilot" : "main";
  const selectedPopulation = cohort === "A" ? (cohortAPopulation ?? 0) : (cohortBPopulation ?? 0);
  const selectedContacts = cohort === "A" ? (cohortAContacts ?? 0) : (cohortBContacts ?? 0);
  // Only Cohort A contains the pilot identities. B is already disjoint from A.
  const effectivePopulation = fieldworkPhase === "main" && cohort === "A"
    ? Math.max(0, selectedPopulation - pilotHoldoutUnits)
    : selectedPopulation;
  const [targetCompletes, setTargetCompletes] = useState(fieldworkPhase === "pilot" ? "20" : "500");
  const [expectedResponsePct, setExpectedResponsePct] = useState("15");
  const [randomSeed, setRandomSeed] = useState("");
  const [message, setMessage] = useState("");
  const frameWorkerBusy = queuedJobs > 0 || runningJobs > 0;
  // A frozen Cohort A is independently sampleable while B is importing.
  const sampleWorkerBusy = queuedSampleJobs > 0 || runningSampleJobs > 0;
  const cohortStatus = cohort === "A" ? cohortAStatus : cohortBStatus;
  const selectedDrawStatus = cohort === "A" ? cohortASampleStatus : cohortBSampleStatus;
  const selectedRecruitmentMode = cohort === "A" ? cohortARecruitmentMode : cohortBRecruitmentMode;
  const censusPrepared = selectedRecruitmentMode === "full_cohort_census" && (selectedDrawStatus === "locked" || selectedDrawStatus === "fielded");
  const selectedDrawCount = cohort === "A" ? cohortASampleSelected : cohortBSampleSelected;
  const cohortReady = cohort === "A"
    ? cohortStatus === "frozen" || cohortStatus === "superseded"
    : cohortStatus === "frozen";
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
  const contactabilityRate = effectivePopulation > 0 ? Math.min(1, selectedContacts / effectivePopulation) : 0;
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
        fieldworkPhase,
        cohort
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

  // The official first run is a full-contactable-frame census. Probability
  // sampling remains available only for the separate diagnostic Pilot.
  async function prepareEntireCohort() {
    if (fieldworkPhase !== "main" || !cohortReady || sampleWorkerBusy || censusPrepared) return;
    if (!window.confirm(`Prepare the COMPLETE contactable Cohort ${cohort} register? This writes enrollment records but sends NO emails.`)) return;
    setBusy("census");
    setMessage("");
    try {
      const result = await post({ action: "enroll_cohort", cohort });
      setMessage(`Full Cohort ${cohort} enrollment queued (job ${result.jobId}). No invitations have been sent. Review the register before fieldwork.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Full-cohort preparation failed.");
    } finally {
      setBusy(null);
    }
  }

  if (fieldworkPhase === "main") return <div className="workspace-queue-card">
    <div className="workspace-inline-note">
      <strong>Official first run · full-cohort invitation, not probability sampling</strong><br />
      All eligible businesses with an active, non-suppressed email in the frozen cohort are enrolled. Previously contacted Pilot units are excluded. Preparing the register does not send email; sending remains a separate, confirmed action.
    </div>
    <div className="workspace-action-bar" style={{ marginTop: 12 }}>
      <label><strong>Recipient cohort</strong><br />
        <select aria-label="Recipient cohort" value={cohort} onChange={(event) => setCohort(event.target.value as "A" | "B")}>
          <option value="A">Stage 1 · All of Cohort A</option>
          <option value="B">Stage 2 · All additional Cohort B businesses</option>
        </select>
      </label>
      <div>
        <strong>${cohort === "A" ? "Original retail cohort" : "Additional retail cohort"}</strong><br />
        <small>Frozen businesses: ${selectedPopulation.toLocaleString("el-GR")} · active-email businesses at freeze: ${selectedContacts.toLocaleString("el-GR")}</small><br />
        <small>${cohortReady ? "Frozen frame ready" : "Frame still pending"} · ${censusPrepared ? "Full cohort register ready" : "Full cohort register not yet prepared"}</small>
      </div>
    </div>
    <div className="workspace-action-buttons" style={{ marginTop: 12 }}>
      <button className="button" type="button" disabled={Boolean(busy) || sampleWorkerBusy || !cohortReady || censusPrepared || studyStatus !== "fielding"} onClick={() => void prepareEntireCohort()}>
        ${busy === "census" ? "Queueing complete cohort…" : censusPrepared ? "Full cohort prepared" : "Prepare entire Cohort " + cohort}
      </button>
      <a className="button button-secondary" href={"/admin/research/surveys/" + encodeURIComponent(slug) + "/fieldwork"}>Review email &amp; controlled sending</a>
    </div>
    <div className="workspace-inline-note" style={{ marginTop: 12 }}>
      ${message || (sampleWorkerBusy ? "Enrollment worker busy. Check Jobs and refresh; do not queue repeatedly." : cohort === "B" ? "Cohort B may be invited only after eligible Cohort A outreach is complete. Email identity deduplication and opt-outs still apply." : "Stage 1 is Cohort A. There is no target n, seed, or random sampling for this official run.")}
    </div>
  </div>;

  return <div className="workspace-queue-card">
    <div className="workspace-action-bar">
      <span>
        <strong>Population frame</strong><br />
        {cohortAStatus === "frozen" || cohortAStatus === "superseded"
          ? `Cohort A: ${(cohortAPopulation ?? 0).toLocaleString("el-GR")} frozen businesses · Cohort B: ${cohortBStatus || "not started"}`
          : "Cohort A has not been frozen yet."}
        {fieldworkPhase === "main" && pilotHoldoutUnits > 0
          ? ` · ${pilotHoldoutUnits.toLocaleString("el-GR")} pilot holdout → ${effectivePopulation.toLocaleString("el-GR")} main-eligible`
          : ""}
      </span>
      <button
        className="button button-secondary"
        disabled={Boolean(busy) || frameWorkerBusy}
        onClick={() => void buildFrame()}
        type="button"
      >{busy === "frame" ? "Queueing…" : latestFrameStatus === "frozen" ? "Refresh frame" : "Build frozen frame"}</button>
    </div>

    <div className="workspace-action-bar">
      <div style={{ width: "100%", display: "grid", gap: 10 }}>
        <label><strong>Sampling cohort</strong><br />
          <select aria-label="Sampling cohort" value={cohort} onChange={(event) => { setCohort(event.target.value as "A" | "B"); setTargetN(""); }}>
            <option value="A">Cohort A · frozen original retail population</option>
            {fieldworkPhase === "main" && <option value="B">Cohort B · new businesses only (excludes A)</option>}
          </select>
        </label>
        <div className="workspace-inline-note">
          {cohort === "A" ? `Cohort A: ${(cohortAPopulation ?? 0).toLocaleString("el-GR")} businesses · ${(cohortAContacts ?? 0).toLocaleString("el-GR")} snapshot contacts. ` : `Cohort B: ${cohortBStatus || "not ready"} · ${cohortBPopulation == null ? "deduplication pending" : cohortBPopulation.toLocaleString("el-GR") + " new businesses"}. `}
          {cohortReady ? "Selected cohort has a finalized evidence frame." : "This cohort is not finalized; sample drawing stays locked."}
        </div>
        <span>
          <strong>Fieldwork feasibility & sample planner</strong><br />
          {fieldworkPhase === "pilot" ? "Pilot" : "Main"} contactability: {effectivePopulation > 0
            ? new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 2 }).format(contactabilityRate)
            : "—"}
          {" · "}{selectedContacts.toLocaleString("el-GR")} snapshot email contacts / {effectivePopulation.toLocaleString("el-GR")} eligible units
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
        {selectedDrawStatus
          ? `Cohort ${cohort} · ${selectedDrawStatus} · ${(selectedDrawCount ?? 0).toLocaleString("el-GR")} selected units`
          : `Cohort ${cohort}: no sample yet. Enter selected businesses below; this is not the target number of completed questionnaires.`}
        {latestSampleDesignSha256 ? <><br />
          Frozen design: {latestSampleDesiredCompletes.toLocaleString("el-GR")} desired completes · {" "}
          {new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(latestSampleExpectedResponseRate)} invited-response assumption · {" "}
          {new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(latestSampleContactabilityRate)} contactability · {" "}
          {latestSampleExpectedCompletes.toLocaleString("el-GR")} expected completes · {latestSampleDesignSha256.slice(0, 12)}…
        </> : null}
      </span>
      <div className="workspace-action-buttons">
        <strong>{fieldworkPhase === "pilot" ? "Pilot holdout · Cohort A" : "Main fieldwork · Cohort " + cohort}</strong>
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
          disabled={Boolean(busy) || sampleWorkerBusy || !cohortReady || !sampleValid || (fieldworkPhase === "main" && studyStatus !== "fielding")}
          onClick={() => void drawSample()}
          type="button"
        >{busy === "sample" ? "Queueing…" : "Draw reproducible sample"}</button>
      </div>
    </div>

    <div className="workspace-inline-note">
      {message || (sampleWorkerBusy
        ? `Sample or invitation worker busy: ${queuedSampleJobs + runningSampleJobs}. Another draw is temporarily locked.`
        : "Cohort A can be sampled while Cohort B is building. Pilot draws are diagnostic (10–1,000); official A/B draws are separate, and main draws exclude contacted Pilot businesses.")}
    </div>
  </div>;
}
