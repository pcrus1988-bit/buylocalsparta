import { getProductionPostgresRuntime } from "../apps/web/src/lib/postgres-runtime.ts";
import {
  processResearchStudyJobs,
  type ResearchJobType
} from "../apps/web/src/lib/research-survey-jobs.ts";

const LONG_JOB_TYPES: readonly ResearchJobType[] = ["frame_snapshot", "analysis"];

function requestedJobTypes(raw: string | undefined): readonly ResearchJobType[] {
  const value = raw?.trim() || "all";
  if (value === "all") return LONG_JOB_TYPES;
  if (value === "frame_snapshot" || value === "analysis") return [value];
  throw new Error("RESEARCH_LONG_JOB_TYPE_INVALID");
}

const allowed = requestedJobTypes(process.argv[2]);
const limit = allowed.length;
const runtime = getProductionPostgresRuntime();

try {
  const result = await processResearchStudyJobs(limit, allowed);
  console.log(JSON.stringify({
    ok: result.failed === 0,
    executor: "github-actions-one-shot",
    allowedJobTypes: allowed,
    ...result
  }));
  if (result.failed > 0) process.exitCode = 1;
} finally {
  await runtime.close();
}
