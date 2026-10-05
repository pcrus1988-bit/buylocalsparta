import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const migrationPath = "db/migrations/0416_research_survey_ecosystem.sql";
const checksumPath = "db/migrations/checksums.0416.json";
const suppressionMigrationPath = "db/migrations/0417_research_contact_suppression_ledger.sql";
const suppressionChecksumPath = "db/migrations/checksums.0417.json";
const deliveryMigrationPath = "db/migrations/0418_research_participant_delivery.sql";
const deliveryChecksumPath = "db/migrations/checksums.0418.json";
const reminderMigrationPath = "db/migrations/0419_research_invite_reminder_protocol.sql";
const reminderChecksumPath = "db/migrations/checksums.0419.json";
const analysisPlanMigrationPath = "db/migrations/0420_research_analysis_preregistration.sql";
const analysisPlanChecksumPath = "db/migrations/checksums.0420.json";
const migration = readFileSync(migrationPath, "utf8");
const suppressionMigration = readFileSync(suppressionMigrationPath, "utf8");
const deliveryMigration = readFileSync(deliveryMigrationPath, "utf8");
const reminderMigration = readFileSync(reminderMigrationPath, "utf8");
const analysisPlanMigration = readFileSync(analysisPlanMigrationPath, "utf8");
const checksums = JSON.parse(readFileSync(checksumPath, "utf8")) as Record<string, string>;
const suppressionChecksums = JSON.parse(readFileSync(suppressionChecksumPath, "utf8")) as Record<string, string>;
const deliveryChecksums = JSON.parse(readFileSync(deliveryChecksumPath, "utf8")) as Record<string, string>;
const reminderChecksums = JSON.parse(readFileSync(reminderChecksumPath, "utf8")) as Record<string, string>;
const analysisPlanChecksums = JSON.parse(readFileSync(analysisPlanChecksumPath, "utf8")) as Record<string, string>;
const runtime = readFileSync("packages/postgres-runtime/src/index.ts", "utf8");
const surveyRuntime = readFileSync("apps/web/src/lib/research-survey-runtime.ts", "utf8");
const surveyRoute = readFileSync("apps/web/src/app/api/research/[slug]/t/[token]/route.ts", "utf8");
const surveyForm = readFileSync("apps/web/src/components/ResearchSurveyForm.tsx", "utf8");
const schemaRollout = readFileSync(".github/workflows/research-survey-schema-rollout.yml", "utf8");
const schemaPreflight = readFileSync("scripts/research-survey-production-schema.ts", "utf8");
const jobs = readFileSync("apps/web/src/lib/research-survey-jobs.ts", "utf8");
const release = readFileSync("apps/web/src/lib/research-survey-release.ts", "utf8");
const researchMail = readFileSync("apps/web/src/lib/research-survey-mail.ts", "utf8");
const sesEvents = readFileSync("apps/web/src/lib/research-survey-ses-events.ts", "utf8");
const quality = readFileSync("apps/web/src/lib/research-survey-quality.ts", "utf8");
const qualityControls = readFileSync("apps/web/src/components/ResearchStudyQualityControls.tsx", "utf8");
const fieldworkControls = readFileSync("apps/web/src/components/ResearchStudyFieldworkControls.tsx", "utf8");
const fieldworkBalance = readFileSync("apps/web/src/components/ResearchStudyFieldworkBalance.tsx", "utf8");
const statistics = readFileSync("apps/web/src/lib/research-survey-statistics.ts", "utf8");
const analysis = readFileSync("apps/web/src/lib/research-survey-analysis.ts", "utf8");
const resultsPage = readFileSync("apps/web/src/app/research/greek-retail-2026/results/page.tsx", "utf8");
const releaseRoute = readFileSync("apps/web/src/app/api/research/[slug]/release/route.ts", "utf8");
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
const deliverySha = createHash("sha256").update(deliveryMigration, "utf8").digest("hex");
const reminderSha = createHash("sha256").update(reminderMigration, "utf8").digest("hex");
const analysisPlanSha = createHash("sha256").update(analysisPlanMigration, "utf8").digest("hex");
if (checksums["0416_research_survey_ecosystem.sql"] !== sha) {
  errors.push("0416 checksum does not match migration bytes");
}
if (suppressionChecksums["0417_research_contact_suppression_ledger.sql"] !== suppressionSha) {
  errors.push("0417 checksum does not match migration bytes");
}
if (deliveryChecksums["0418_research_participant_delivery.sql"] !== deliverySha) {
  errors.push("0418 checksum does not match migration bytes");
}
if (reminderChecksums["0419_research_invite_reminder_protocol.sql"] !== reminderSha) {
  errors.push("0419 checksum does not match migration bytes");
}
if (analysisPlanChecksums["0420_research_analysis_preregistration.sql"] !== analysisPlanSha) {
  errors.push("0420 checksum does not match migration bytes");
}
if (!runtime.includes("EXPECTED_SCHEMA_VERSION = 420")) errors.push("runtime schema head is not 420");
if (!reminderMigration.includes("CREATE TABLE public.research_invite_access_tokens")) errors.push("reminder access-token table missing");
if (!reminderMigration.includes("CREATE TABLE public.research_invite_messages")) errors.push("invitation attempt ledger missing");
if (!reminderMigration.includes("ALTER TABLE public.research_invite_access_tokens ENABLE ROW LEVEL SECURITY;")) errors.push("reminder access-token RLS missing");
if (!reminderMigration.includes("ALTER TABLE public.research_invite_messages ENABLE ROW LEVEL SECURITY;")) errors.push("invitation attempt RLS missing");
if (!reminderMigration.includes("'invite_reminder'")) errors.push("invite_reminder job type missing from schema");
if (!analysisPlanMigration.includes("CREATE TABLE public.research_analysis_plans")) errors.push("analysis preregistration table missing");
if (!analysisPlanMigration.includes("research_analysis_plans_one_locked_per_instrument_idx")) errors.push("single locked analysis-plan invariant missing");
if (!analysisPlanMigration.includes("research_analysis_plans_locked_immutable")) errors.push("locked analysis-plan immutability guard missing");
if (!analysisPlanMigration.includes("ADD COLUMN analysis_plan_id")) errors.push("analysis runs are not bound to an analysis plan");
if (!analysisPlanMigration.includes("kontamou.research.analysis-plan.v1")) errors.push("seeded analysis-plan contract missing");
if (!analysisPlanMigration.includes("prespecified_secondary")) errors.push("pre-specified secondary analysis classification missing from plan");
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
if (!deliveryMigration.includes("CREATE TABLE public.research_participant_deliveries")) errors.push("participant delivery ledger missing");
if (!deliveryMigration.includes("CREATE TABLE public.research_participant_delivery_events")) errors.push("participant delivery event ledger missing");
if (!deliveryMigration.includes("research_participant_delivery_events_append_only")) errors.push("participant delivery event append-only guard missing");
if (!deliveryMigration.includes("ALTER TABLE public.research_participant_deliveries ENABLE ROW LEVEL SECURITY;")) errors.push("participant delivery ledger RLS missing");
if (!deliveryMigration.includes("ALTER TABLE public.research_participant_delivery_events ENABLE ROW LEVEL SECURITY;")) errors.push("participant delivery events RLS missing");
if (!deliveryMigration.includes("'reward_delivery'") || !deliveryMigration.includes("'results_notification'")) errors.push("participant delivery job types missing");
if (!migration.includes("token_hash text NOT NULL UNIQUE")) errors.push("hashed invitation token contract missing");
if (/\btoken\s+text\b/i.test(migration)) errors.push("plaintext invitation token column detected");

if (!surveyRuntime.includes("SELECT DISTINCT ON (consent_kind) consent_kind, granted")) {
  errors.push("survey resume path does not read latest optional consent state");
}
if (!surveyRuntime.includes("updatePublicResearchConsents")) errors.push("post-completion consent update runtime missing");
if (!surveyRuntime.includes("survey_ui_preferences")) errors.push("post-completion consent events are not source-labelled");
if (!surveyRuntime.includes("participant_consent_revoked")) errors.push("consent revocation does not cancel unsent participant deliveries");
if (!surveyRoute.includes('body.action === "preferences"')) errors.push("token API preference action missing");
if (!surveyForm.includes("Αποθήκευση επιλογών")) errors.push("completed survey preference controls missing");
if (!surveyRuntime.includes("AS delivered") || !surveyRuntime.includes("AS opened")) errors.push("admin fieldwork funnel event counts missing");
if (!surveyRuntime.includes("researchFieldworkStrata")) errors.push("sampling-stratum fieldwork balance query missing");
if (!surveyRuntime.includes("sample_counts AS") || !surveyRuntime.includes("response_counts AS")) errors.push("stratum fieldwork balance is not aggregated by CTE");
if (!fieldworkBalance.includes("Fieldwork balance · sampling strata")) errors.push("stratum fieldwork balance admin view missing");
if (!fieldworkBalance.includes("additional sampling strata")) errors.push("full stratum fieldwork balance is not inspectable");

if (!surveyRuntime.includes("research_response_quality_reviews")) errors.push("survey completion QA ledger missing");
if (!surveyRuntime.includes("research_reward_entitlements")) errors.push("reward entitlement separation missing");
if (!surveyRuntime.includes("research_sample_disposition_events")) errors.push("fieldwork disposition events missing");
if (!jobs.includes("gemiResearchFrameRecords")) errors.push("GEMI frame worker bridge missing");
if (!jobs.includes("stratified-hash-rank-v2")) errors.push("minimum-aware reproducible sample algorithm missing");
if (!jobs.includes("processInviteBatchJob")) errors.push("worker-managed invitation delivery missing");
if (!jobs.includes("processRewardDeliveryJob")) errors.push("worker-managed reward delivery missing");
if (!jobs.includes("processResultsNotificationJob")) errors.push("worker-managed results notification missing");
if (!jobs.includes("createHmac")) errors.push("deterministic non-plaintext reward code derivation missing");
if (!jobs.includes("research_participant_deliveries")) errors.push("participant delivery ledger worker bridge missing");
if (!jobs.includes("runGreekRetailAnalysis(job.study_id, job.id)")) errors.push("analysis job bridge missing");
if (!jobs.includes('job.job_type === "release"')) errors.push("release job bridge missing");
if (!jobs.includes("buildGreekRetailRelease")) errors.push("release worker implementation missing");
if (!jobs.includes("assertResearchSurveyEmailReady")) errors.push("research email readiness gate missing");
if (!researchMail.includes("BLS_RESEARCH_SES_CONFIGURATION_SET")) errors.push("dedicated SES configuration set gate missing");
if (!researchMail.includes("research_invite")) errors.push("SES research message tags missing");
if (!researchMail.includes("sendResearchThankYouCode")) errors.push("thank-you code email workflow missing");
if (!researchMail.includes("sendResearchResultsNotification")) errors.push("results notification email workflow missing");
if (!researchMail.includes("research_delivery")) errors.push("participant delivery SES tags missing");
if (!sesSender.includes("ConfigurationSetName")) errors.push("SES sender does not apply configuration set");
if (!sesEvents.includes("BLS_RESEARCH_SES_SNS_TOPIC_ARN")) errors.push("SES SNS topic allowlist missing");
if (!sesEvents.includes("SNS_SIGNATURE_INVALID")) errors.push("SNS signature verification missing");
if (!sesEvents.includes("suppression_status='bounced'")) errors.push("bounce suppression bridge missing");
if (!sesEvents.includes("research_contact_suppression_events")) errors.push("SES events do not persist cross-wave suppression");
if (!sesEvents.includes("research_participant_delivery_events")) errors.push("SES events do not audit participant delivery outcomes");
if (!sesEvents.includes("provider_message_not_research_message")) errors.push("SES event routing does not recognize participant messages");
if (!jobs.includes("research_contact_is_suppressed")) errors.push("research worker does not enforce cross-wave suppression");
if (!jobs.includes("queueGreekRetailInviteReminderBatch")) errors.push("governed reminder queue missing");
if (!jobs.includes("processInviteReminderJob")) errors.push("governed reminder worker missing");
if (!jobs.includes("PRIOR_ATTEMPT_NOT_RETRIED")) errors.push("reminder retries are not fail-closed");
if (!jobs.includes("attemptKind: \"reminder\"")) errors.push("reminder SES attempt tagging missing");
if (!surveyRuntime.includes("research_invite_access_tokens")) errors.push("public survey does not resolve token aliases");
if (!fieldworkControls.includes("Queue reminder batch")) errors.push("admin reminder controls missing");
if (!sesEvents.includes("research_attempt")) errors.push("SES callback attempt recovery missing");
if (!sesEvents.includes("research_invite_messages")) errors.push("SES callback does not update attempt ledger");
if (!release.includes("denominatorRule")) errors.push("release does not freeze reminder denominator rule");
if (!release.includes("contactAttempts")) errors.push("release does not freeze contact-attempt paradata");
if (!surveyRuntime.includes("participant_research_opt_out")) errors.push("participant future-research opt-out path missing");
if (!quality.includes("researchQualityReviewQueue")) errors.push("manual research QA queue missing");
if (!quality.includes("resolveResearchQualityReview")) errors.push("manual research QA resolver missing");
if (!quality.includes("FOR UPDATE OF rr")) errors.push("manual research QA resolution is not serialized");
if (!qualityControls.includes('void resolve(item, "include")')) errors.push("research QA include control missing");
if (!qualityControls.includes('void resolve(item, "exclude")')) errors.push("research QA exclude control missing");
if (!fieldworkControls.includes("pendingQualityReviews > 0")) errors.push("analysis UI is not gated on pending research QA");
if (!statistics.includes("proportionalStratumAllocation")) errors.push("minimum-aware sample allocation helper missing");
if (!statistics.includes("stratifiedSrsMeanVariance")) errors.push("design-aware variance helper missing");
if (!statistics.includes("researchWeightDiagnostics")) errors.push("weighting effective-sample diagnostics missing");

if (!statistics.includes("unequal_within_stratum_weights")) errors.push("variance guard for unequal stratum weights missing");
if (!analysis.includes('VARIANCE_METHOD = "stratified_srs_fpc_v1"')) errors.push("analysis variance method is not versioned");
if (!analysis.includes("'weightDiagnostics',$3::jsonb")) errors.push("analysis run does not persist weighting diagnostics");
if (!statistics.includes("normalTwoSidedPValue")) errors.push("pairwise normal p-value helper missing");
if (!analysis.includes('ANALYSIS_CODE_VERSION = "greek-retail-2026-analysis-v4"')) errors.push("analysis code version is not v4");
if (!analysis.includes("RESEARCH_ANALYSIS_PLAN_MISSING")) errors.push("analysis does not require a locked preregistration plan");
if (!analysis.includes("RESEARCH_ANALYSIS_PLAN_BINDING_MISMATCH")) errors.push("analysis retry does not enforce immutable plan binding");
if (!analysis.includes('analysisClassification: "prespecified_secondary"')) errors.push("pre-specified secondary estimate classification missing");
if (!analysis.includes('"prespecified_primary"')) errors.push("pre-specified primary estimate classification missing");
if (!analysis.includes("pairwise_independent_strata_difference_v1")) errors.push("pairwise region/sector difference estimator missing");
if (!statistics.includes("benjaminiHochbergAdjustedPValues")) errors.push("pairwise FDR adjustment helper missing");
if (!analysis.includes('adjustedPValueMethod: "benjamini_hochberg"')) errors.push("pairwise FDR-adjusted q-value persistence missing");
if (!resultsPage.includes("Pre-fieldwork analysis plan")) errors.push("public preregistration disclosure section missing");
if (!resultsPage.includes("analysisPlan.contentSha256")) errors.push("public preregistration fingerprint missing");
if (!resultsPage.includes("Exploratory pairwise inference")) errors.push("public pairwise inference section missing");
if (!resultsPage.includes("Benjamini–Hochberg FDR-adjusted q-value")) errors.push("public pairwise FDR disclosure missing");

if (!release.includes("analysisPlan: {")) errors.push("release does not freeze the preregistered analysis plan");
if (!release.includes("analysis_plan_sha256")) errors.push("release does not freeze the analysis-plan fingerprint");
if (!release.includes("prespecifiedAnalysisPlanPublished: true")) errors.push("release disclosure does not identify preregistration");
if (!release.includes("weightDiagnostics: objectValue(parameters.weightDiagnostics)")) errors.push("release does not freeze weighting diagnostics");
if (!resultsPage.includes("Kish effective n")) errors.push("public results do not disclose effective sample size");

if (!analysis.includes("normal95ConfidenceInterval")) errors.push("analysis confidence interval bridge missing");
if (!resultsPage.includes("95% CI")) errors.push("public results do not surface governed confidence intervals");
if (surveyRuntime.includes("generateResearchInvitationBatch")) errors.push("legacy plaintext invitation delivery path remains");
if (surveyRuntime.includes("SURVEY_EXPERIMENT_INCOMPLETE")) errors.push("optional experiment still blocks completion");
if (!surveyRuntime.includes('"eligibilityBasis":"completed_response"')) errors.push("reward eligibility is not completion-based");
if (!surveyRuntime.includes("'reward_delivery','queued'")) errors.push("completion does not queue consent-scoped reward delivery");
if (!surveyRuntime.includes("'results_notification','queued'")) errors.push("publication does not queue results notification");
if (!gemi.includes("export async function* gemiResearchFrameRecords")) errors.push("GEMI governed record stream missing");
if (!release.includes("artifactSha256 = sha256Canonical(artifact)")) errors.push("canonical public release artifact hash missing");
if (!release.includes("getPublishedGreekRetailReleaseArtifact")) errors.push("published release artifact reconstruction missing");
if (!release.includes("researchReleaseArtifactIntegrity")) errors.push("transactional release integrity verifier missing");
if (!surveyRuntime.includes("RESEARCH_RELEASE_ARTIFACT_HASH_MISMATCH")) errors.push("publication does not fail closed on artifact hash mismatch");

if (!release.includes("recomputedSha256 === published.artifactSha256")) errors.push("published release artifact integrity check missing");
if (!release.includes("method: text(estimate.method)")) errors.push("published artifact reconstruction drops estimate method");
if (!releaseRoute.includes("X-Konta-Mou-Artifact-SHA256")) errors.push("canonical release endpoint does not expose artifact hash");
if (!releaseRoute.includes("Content-Disposition")) errors.push("canonical release endpoint is not downloadable");
if (!resultsPage.includes("Download canonical JSON")) errors.push("public results page does not expose evidence artifact download");

if (!release.includes("RESEARCH_RELEASE_REQUIRES_QA_RESOLUTION")) errors.push("release QA gate missing");
if (!release.includes("confidenceIntervalsPublished")) errors.push("release disclosure contract missing");
if (!release.includes("emailContactabilityRate")) errors.push("release does not freeze frame contactability");
if (!release.includes("questions: instrumentQuestions.rows.map")) errors.push("release does not freeze exact questionnaire");
if (!release.includes("recruitmentTemplates.rows.map")) errors.push("release does not freeze recruitment copy");
if (!release.includes("latestDispositionCounts")) errors.push("release does not freeze final sample dispositions");
if (!release.includes("completionRateOfSent")) errors.push("release does not freeze explicit fieldwork denominators");
if (!resultsPage.includes("Sent→complete")) errors.push("public results do not disclose frozen fieldwork conversion rate");
if (!release.includes("idempotentReplay")) errors.push("release idempotence contract missing");
if (!surveyRuntime.includes("RESEARCH_PILOT_REQUIRES_LOCKED_ANALYSIS_PLAN")) errors.push("pilot lifecycle is not gated by preregistration");
if (!surveyRuntime.includes("RESEARCH_FIELDING_REQUIRES_LOCKED_ANALYSIS_PLAN")) errors.push("fieldwork lifecycle is not gated by preregistration");
if (!surveyRuntime.includes('"publish_release"')) errors.push("explicit publish lifecycle action missing");
if (!schemaRollout.includes("workflow_dispatch")) errors.push("research production schema rollout is not manual-only");
if (!schemaRollout.includes("environment: production")) errors.push("research production schema rollout lacks production environment gate");
if (!schemaRollout.includes("if: ${{ inputs.apply }}")) errors.push("research schema mutation lacks explicit apply gate");
if (!schemaRollout.includes("npm run db:migrate")) errors.push("research schema rollout bypasses checksum-aware migrator");
if (!schemaPreflight.includes("expectedSourceVersion = 420")) errors.push("research schema rollout source-head guard missing");
if (!schemaPreflight.includes("expectedCurrentVersion = 415")) errors.push("research schema rollout starting-state guard missing");
if (!schemaPreflight.includes("Refusing a partial-state rollout")) errors.push("research schema partial-state guard missing");
if (!pkg.scripts?.["worker:research"]) errors.push("research worker script missing");

if (errors.length) {
  console.error(["Research survey ecosystem verification failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  schema: 420,
  tables: created.length + 6,
  migrationSha256: sha,
  suppressionMigrationSha256: suppressionSha,
  deliveryMigrationSha256: deliverySha,
  reminderMigrationSha256: reminderSha,
  analysisPlanMigrationSha256: analysisPlanSha,
  worker: pkg.scripts?.["worker:research"]
}));
