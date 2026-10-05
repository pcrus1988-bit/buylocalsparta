"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResearchStudySamplingControls({
  slug,
  csrfToken,
  latestFrameStatus,
  framePopulation,
  latestSampleStatus,
  latestSampleTarget,
  queuedJobs,
  runningJobs
}: {
  slug: string;
  csrfToken: string;
  latestFrameStatus?: string;
  framePopulation: number;
  latestSampleStatus?: string;
  latestSampleTarget: number;
  queuedJobs: number;
  runningJobs: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"frame" | "sample" | null>(null);
  const [targetN, setTargetN] = useState("");
  const [randomSeed, setRandomSeed] = useState("");
  const [message, setMessage] = useState("");
  const workerBusy = queuedJobs > 0 || runningJobs > 0;
  const sampleN = Number(targetN);
  const sampleValid = Number.isSafeInteger(sampleN) && sampleN >= 100 && sampleN <= 100_000;

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
        randomSeed: randomSeed.trim() || undefined
      });
      if (result.randomSeed) setRandomSeed(result.randomSeed);
      setMessage("Το sample draw μπήκε στην ουρά. Το random seed έχει παγώσει και καταγράφεται στο evidence chain.");
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
          ? `Latest: ${latestFrameStatus} · ${framePopulation.toLocaleString("el-GR")} businesses`
          : "Δεν έχει παγώσει ακόμη population frame."}
      </span>
      <button
        className="button button-secondary"
        disabled={Boolean(busy) || workerBusy}
        onClick={() => void buildFrame()}
        type="button"
      >{busy === "frame" ? "Queueing…" : latestFrameStatus === "frozen" ? "Refresh frame" : "Build frozen frame"}</button>
    </div>

    <div className="workspace-action-bar">
      <span>
        <strong>Probability sample</strong><br />
        {latestSampleStatus
          ? `Latest: ${latestSampleStatus} · ${latestSampleTarget.toLocaleString("el-GR")} selected units`
          : "Set the number of selected businesses. This is not the target number of completed questionnaires."}
      </span>
      <div className="workspace-action-buttons">
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
          disabled={Boolean(busy) || workerBusy || latestFrameStatus !== "frozen" || !sampleValid}
          onClick={() => void drawSample()}
          type="button"
        >{busy === "sample" ? "Queueing…" : "Draw reproducible sample"}</button>
      </div>
    </div>

    <div className="workspace-inline-note">
      {message || (workerBusy
        ? `Worker jobs pending/running: ${queuedJobs + runningJobs}. Frame/sample actions remain locked until the current job finishes.`
        : "Sample size is intentionally not guessed by the UI. Choose it from the desired precision, subgroup reporting needs and expected response rate.")}
    </div>
  </div>;
}
