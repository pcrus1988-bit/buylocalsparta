import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const migrationPath = "db/migrations/0414_research_survey_ecosystem.sql";
const checksumPath = "db/migrations/checksums.0414.json";
const suppressionMigrationPath = "db/migrations/0415_research_contact_suppression_ledger.sql";
const suppressionChecksumPath = "db/migrations/checksums.0415.json";
const migration = readFileSync(migrationPath, "utf8");
const suppressionMigration = readFileSync(suppressionMigrationPath, "utf8");
const checksums = JSON.parse(readFileSync(checksumPath, "utf8")) as Record<string, string>;
const suppressionChecksums = JSON.parse(readFileSync(suppressionChecksumPath, "utf8")) as Record<string, string>;
const runtime = readFileSync("packages/postgres-runtime/src/index.ts", "utf8");
const surveyRuntime = readFileSync("apps/web/src/lib/research-survey-runtime.ts", "utf8");
const jobs = readFileSync("apps/web/src/lib/research-survey-jobs.ts", "utf8");
const release = readFileSync("apps/web/src/lib/research-survey-release.ts", "utf8");
const researchMail = readFileSync("apps/web/src/lib/research-survey-mail.ts", "utf8");
const sesEvents = readFileSync("apps/web/src/lib/research-survey-ses-events.ts", "utf8");
const quality = readFileSync("apps/web/src/lib/research-survey-quality.ts", "utf8");
const qualityControls = readFileSync("apps/web/src/components/ResearchStudyQualityControls.tsx", "utf8");
const fieldworkControls = readFileSync("apps/web/src/components/ResearchStudyFieldworkControls.tsx", "utf8");
const sesSender = readFileSync("apps/web/src/lib/admin-mail-ses.ts", "utf8");
const gemi = readFileSync("apps/web/src/lib/gemi-admin-export.ts", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

const expectedTables = [
  "research_studies",
  "research_instruments",
  "research_questions",
  "research_frame_snapshots",
  "research_strata",
  "research_frame_units",
  "research_contact_points",
  "research_sample_draws",
  "research_sample_units",
  "research_recruitment_templates",
  "research_invite_batches",
  "research_invites",
  "research_invite_events",
  "research_sample_disposition_events",
  "research_responses",
  "research_consents",
  "research_answers",
  "research_experiment_assignments",
  "research_response_quality_reviews",
  "research_reward_entitlements",
  "research_response_scores",
  "research_weights",
  "research_analysis_runs",
  "research_analysis_estimates",
  "research_release_snapshots",
  "research_study_jobs"
] as const;

const errors: string[] = [];
const sha = createHash("sha256").update(migration, "utf8").digest("hex");
const suppressionSha = createHash("sha256").update(suppressionMigration, "utf8").digest("hex");
if (checksums["0414_research_survey_ecosystem.sql"] !== sha) {
  errors.push("0414 checksum does not match migration bytes");
}
if (suppressionChecksums["0415_research_contact_suppression_ledger.sql"] !== suppressionSha) {
  errors.push("0415 checksum does not match migration bytes");
}
if (!runtime.includes("EXPECTED_SCHEMA_VERSION = 415")) errors.push("runtime schema head is not 415");
if ((migration.match(/^BEGIN;$/gm) ?? []).length !== 1) errors.push("migration must contain exactly one BEGIN");
if ((migration.match(/^COMMIT;$/gm) ?? []).length !== 1) errors.push("migration must contain exactly one COMMIT");

const created = [...migration.matchAll(/CREATE TABLE public\.([a-z0-9_]+)/g)].map((match) => match[1]!);
const duplicates = created.filter((name, index) => created.indexOf(name) !== index);
if (duplicates.length) errors.push(`duplicate CREATE TABLE blocks: ${[...new Set(duplicates)].join(", ")}`);
for (const table of expectedTables) {
  if (!created.includes(table)) errors.push(`missing table ${table}`);
  if (!migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)) {
    errors.push(`RLS not enabled on ${table}`);
  }
}
if (created.length !== expectedTables.length) {
  errors.push(`expected ${expectedTables.length} research tables; found ${created.length}`);
}
if (!migration.includes("REVOKE ALL ON") || !migration.includes("FROM anon;") || !migration.includes("FROM authenticated;")) {
  errors.push("private research tables are not explicitly revoked from anon/authenticated");
}
if (!migration.includes("research_guard_answer_mutation")) errors.push("completed-answer immutability guard missing");
if (!migration.includes("research_consents_append_only")) errors.push("append-only consent ledger guard missing");
if (!migration.includes("research_sample_dispositions_append_only")) errors.push("append-only sample disposition guard missing");
if (!migration.includes("research_recruitment_templates_locked_immutable")) errors.push("locked recruitment template immutability guard missing");
if (!migration.includes("research_frame_snapshots_frozen_immutable")) errors.push("frozen frame immutability guard missing");
if (!migration.includes("research_sample_draws_locked_immutable")) errors.push("locked sample immutability guard missing");
if (!migration.includes("research_analysis_runs_succeeded_immutable")) errors.push("succeeded analysis immutability guard missing");
if (!migration.includes("research_analysis_estimates_frozen_with_run")) errors.push("analysis estimate immutability guard missing");
if (!migration.includes("research_weights_frozen_with_analysis")) errors.push("analysis weight immutability guard missing");
if (!migration.includes("research_release_snapshots_immutable")) errors.push("release snapshot immutability guard missing");
if (!suppressionMigration.includes("CREATE TABLE public.research_contact_suppression_events")) errors.push("cross-wave suppression ledger missing");
if (!suppressionMigration.includes("research_contact_suppression_events_append_only")) errors.push("suppression ledger append-only guard missing");
if (!suppressionMigration.includes("research_contact_is_suppressed")) errors.push("suppression state helper missing");
if (!suppressionMigration.includes("schema_415_backfill")) errors.push("existing suppression backfill missing");
if (!migration.includes("token_hash text NOT NULL UNIQUE")) errors.push("hashed invitation token contract missing");
if (/\btoken\s+text\b/i.test(migration)) errors.push("plaintext invitation token column detected");

if (!surveyRuntime.includes("SELECT DISTINCT ON (consent_kind) consent_kind, granted")) {
  errors.push("survey resume path does not read latest optional consent state");
}
if (!surveyRuntime.includes("research_response_quality_reviews")) errors.push("survey completion QA ledger missing");
if (!surveyRuntime.includes("research_reward_entitlements")) errors.push("reward entitlement separation missing");
if (!surveyRuntime.includes("research_sample_disposition_events")) errors.push("fieldwork disposition events missing");
if (!jobs.includes("gemiResearchFrameRecords")) errors.push("GEMI frame worker bridge missing");
if (!jobs.includes("stratified-hash-rank-v1")) errors.push("reproducible sample algorithm missing");
if (!jobs.includes("processInviteBatchJob")) errors.push("worker-managed invitation delivery missing");
if (!jobs.includes("runGreekRetailAnalysis(job.study_id, job.id)")) errors.push("analysis job bridge missing");
if (!jobs.includes('job.job_type === "release"')) errors.push("release job bridge missing");
if (!jobs.includes("buildGreekRetailRelease")) errors.push("release worker implementation missing");
if (!jobs.includes("assertResearchSurveyEmailReady")) errors.push("research email readiness gate missing");
if (!researchMail.includes("BLS_RESEARCH_SES_CONFIGURATION_SET")) errors.push("dedicated SES configuration set gate missing");
if (!researchMail.includes("research_invite")) errors.push("SES research message tags missing");
if (!sesSender.includes("ConfigurationSetName")) errors.push("SES sender does not apply configuration set");
if (!sesEvents.includes("BLS_RESEARCH_SES_SNS_TOPIC_ARN")) errors.push("SES SNS topic allowlist missing");
if (!sesEvents.includes("SNS_SIGNATURE_INVALID")) errors.push("SNS signature verification missing");
if (!sesEvents.includes("suppression_status='bounced'")) errors.push("bounce suppression bridge missing");
if (!sesEvents.includes("research_contact_suppression_events")) errors.push("SES events do not persist cross-wave suppression");
if (!jobs.includes("research_contact_is_suppressed")) errors.push("research worker does not enforce cross-wave suppression");
if (!surveyRuntime.includes("participant_research_opt_out")) errors.push("participant future-research opt-out path missing");
if (!quality.includes("researchQualityReviewQueue")) errors.push("manual research QA queue missing");
if (!quality.includes("resolveResearchQualityReview")) errors.push("manual research QA resolver missing");
if (!quality.includes("FOR UPDATE OF rr")) errors.push("manual research QA resolution is not serialized");
if (!qualityControls.includes('void resolve(item, "include")')) errors.push("research QA include control missing");
if (!qualityControls.includes('void resolve(item, "exclude")')) errors.push("research QA exclude control missing");
if (!fieldworkControls.includes("pendingQualityReviews > 0")) errors.push("analysis UI is not gated on pending research QA");
if (surveyRuntime.includes("generateResearchInvitationBatch")) errors.push("legacy plaintext invitation delivery path remains");
if (surveyRuntime.includes("SURVEY_EXPERIMENT_INCOMPLETE")) errors.push("optional experiment still blocks completion");
if (!surveyRuntime.includes('"eligibilityBasis":"completed_response"')) errors.push("reward eligibility is not completion-based");
if (!gemi.includes("export async function* gemiResearchFrameRecords")) errors.push("GEMI governed record stream missing");
if (!release.includes("artifactSha256 = sha256Canonical(artifact)")) errors.push("canonical public release artifact hash missing");
if (!release.includes("RESEARCH_RELEASE_REQUIRES_QA_RESOLUTION")) errors.push("release QA gate missing");
if (!release.includes("confidenceIntervalsPublished")) errors.push("release disclosure contract missing");
if (!release.includes("idempotentReplay")) errors.push("release idempotence contract missing");
if (!surveyRuntime.includes('"publish_release"')) errors.push("explicit publish lifecycle action missing");
if (!pkg.scripts?.["worker:research"]) errors.push("research worker script missing");

if (errors.length) {
  console.error(["Research survey ecosystem verification failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  schema: 415,
  tables: created.length + 1,
  migrationSha256: sha,
  suppressionMigrationSha256: suppressionSha,
  worker: pkg.scripts?.["worker:research"]
}));
