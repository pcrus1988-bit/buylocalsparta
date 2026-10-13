import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateResearchRecoveryTotals, type ResearchRecoveryCandidate
} from "./research-survey-recovery.ts";
import type { ResearchQuestion } from "./research-survey-model.ts";

const questions: ResearchQuestion[] = [
  {
    id: "parent", code: "Q01", sectionCode: "A", position: 1,
    type: "single", prompt: "Uses marketplaces?", required: true,
    analysisKey: "marketplaces",
    config: { options: [["never", "Never"], ["current", "Currently"]] }
  },
  {
    id: "conditional", code: "Q23", sectionCode: "B", position: 2,
    type: "single", prompt: "Marketplace impact", required: true,
    analysisKey: "marketplace_impact",
    config: { options: [["positive", "Positive"]], showWhen: { code: "Q01", operator: "in", values: ["current"] } }
  },
  {
    id: "last", code: "Q27", sectionCode: "C", position: 3,
    type: "multi", prompt: "Economic pressures", required: true,
    analysisKey: "pressures",
    config: { options: [["energy", "Energy"], ["rent", "Rent"]] }
  }
];

function row(override: Partial<ResearchRecoveryCandidate> = {}): ResearchRecoveryCandidate {
  return {
    studyId: "study", waveId: "wave", instrumentId: "instrument",
    responseStatus: "in_progress", inviteStatus: "started",
    suppressionStatus: "active", fieldworkPhase: "main",
    finalQuestionAnsweredAt: "2026-10-13T05:00:00Z",
    answers: { Q01: "never", Q27: ["energy"] },
    ...override
  };
}

test("classifies saved complete-but-unsubmitted and saved incomplete separately", () => {
  const map = calculateResearchRecoveryTotals([
    row(),
    row({ answers: { Q01: "current", Q27: ["energy"] } }),
    row({ answers: { Q01: "never", Q27: [] } })
  ], new Map([["instrument", questions]]));
  assert.deepEqual(map.get("study:wave"), {
    contentCompleteUnsubmitted: 1,
    reachedFinalNeedsCorrection: 2
  });
});

test("never includes suppressed, withdrawn, pilot, or participants who did not reach Q27", () => {
  const map = calculateResearchRecoveryTotals([
    row({ suppressionStatus: "suppressed" }),
    row({ responseStatus: "withdrawn" }),
    row({ inviteStatus: "suppressed" }),
    row({ fieldworkPhase: "pilot" }),
    row({ finalQuestionAnsweredAt: undefined }),
    row({ answers: { Q01: "never" } })
  ], new Map([["instrument", questions]]));
  assert.equal(map.size, 0);
});

test("classification returns counts only and cannot create participant consents or fake submissions", () => {
  const map = calculateResearchRecoveryTotals([row()], new Map([["instrument", questions]]));
  const entry = map.get("study:wave");
  assert.deepEqual(Object.keys(entry ?? {}).sort(), ["contentCompleteUnsubmitted", "reachedFinalNeedsCorrection"]);
  assert.equal(JSON.stringify(entry).includes("marketing"), false);
  assert.equal(JSON.stringify(entry).includes("responseId"), false);
});
