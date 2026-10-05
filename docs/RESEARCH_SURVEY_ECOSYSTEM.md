# KONTA MOY Research / Survey Ecosystem

## Purpose

The research subsystem is deliberately separate from vendor acquisition, CRM and marketplace operations. A business may exist in a G.E.MI. population frame without being a KONTA MOY vendor, prospect or marketing lead. Research participation does not create commercial consent.

The first governed study is `greek-retail-2026`, instrument `0.2.0`.

## Evidence chain

Every publishable result must be reconstructable through:

`study -> frame snapshot -> strata -> sample draw -> sample unit -> invite -> consent -> response -> score/weight -> analysis run -> release snapshot`

Each object has a stable identifier. Methodological objects are never silently overwritten after they become part of fieldwork.

## Data domains

### Study governance

- `research_studies` — study identity, target population, lifecycle and field dates.
- `research_instruments` — immutable questionnaire versions and content hashes.
- `research_questions` — exact wording, type, routing/config and analysis key.
- A database trigger prevents question mutation once an instrument leaves `draft`.

### Population and sampling

- `research_frame_snapshots` — frozen target-population snapshots.
- `research_strata` — region / sector / size cells and target completes.
- `research_frame_units` — one eligible business per frame, referenced by an external-key hash.
- `research_sample_draws` — algorithm version, random seed and target n.
- `research_sample_units` — selection order, inclusion probability and base weight.

The scientific sample must be drawn from the frozen eligible population, not from the subset for which an email address happened to be found.

New draws use algorithm `stratified-hash-rank-v2`. When the requested sample size can support it, the allocation first places up to two selected units in every non-empty sampling stratum and then distributes the remainder proportionally to remaining stratum capacity. This deliberately permits mildly disproportionate allocation; the stored inclusion probability and base weight preserve the design. If the requested sample cannot cover that preferred floor, the allocator falls back to one-per-stratum when possible and then proportional allocation.

### Contact layer

- `research_contact_points` is intentionally separate from the response dataset.
- Email/phone/postal contact values have a companion SHA-256 hash for matching and suppression.
- Contactability never changes the frozen population definition.
- Invalid, bounced or suppressed contact points remain explicit non-response evidence rather than being silently removed from the denominator.
- `research_contact_suppression_events` is an append-only, hash-based cross-wave ledger. Participant research opt-outs, SES complaints and bounces therefore survive later frame rebuilds instead of being trapped inside one snapshot.
- Frame ingestion and send-time eligibility both consult the cross-wave ledger. A new G.E.MI. snapshot cannot silently reactivate a suppressed contact hash.
- Contactability is measured as distinct frozen-frame units with at least one usable active email, not raw email-row count.
- The admin sample planner combines frame contactability, a user-supplied expected invited-response rate and desired completes to show a feasibility estimate. It never silently changes the sample target.
- The frozen release stores overall and per-stratum email contactability. Low email coverage is therefore an explicit fieldwork limitation rather than being hidden inside the final response rate.
- The admin control centre exposes the live fieldwork funnel as selected sample → sent → delivered → opened → started → completed, with stage-specific conversion percentages and withdrawals. These are operational diagnostics, not a substitute for the governed release methodology or an AAPOR response-rate classification.
- The same admin view ranks sampling strata by completion shortfall and shows selected/sent/delivered/opened/started/completed counts for each frozen region/sector cell. This is an early non-response-balance warning: it helps fieldwork operators see where completion is lagging before weights are calculated, while keeping the full stratum list inspectable.
- Closing fieldwork now **seals the latest disposition for every selected unit in the active draw**. Started-but-unfinished responses are appended as `partial`; any remaining progress-state case is conservatively appended as `unknown_eligibility`. Existing terminal outcomes (complete, refusal, bounce, ineligible, withdrawal, etc.) are preserved. Open invitation identities are simultaneously expired.
- Fieldwork closeout is also a delivery boundary: queued invitation/reminder jobs are transactionally cancelled, and the close transition refuses to proceed while a contact-send worker is already running. The recorded fieldwork end therefore cannot precede a still-active governed send job.
- The release engine derives `greek-retail-2026-fieldwork-outcomes-v1` from those latest dispositions and refuses to build a release unless disposition coverage equals the selected sample and no progress-state disposition remains unresolved.
- The frozen release reports both gross selected-sample completion and a conservative net-sample completion rate. The net sample subtracts only cases known to be ineligible; unknown eligibility remains in the denominator. It also publishes the exact denominator definitions rather than labelling a bespoke metric as a standard AAPOR response rate.

### Pilot / main fieldwork isolation

Pilot testing and publishable main fieldwork are separate governed phases.

- Sample draws, invitation batches and canonical invitations carry an explicit `fieldwork_phase` of `pilot` or `main`.
- Pilot timing is stored in `pilot_started_at` / `pilot_ended_at`; `fieldwork_starts_at` now means the start of the publishable main fieldwork.
- Moving from pilot to main cancels queued pilot contact jobs, refuses the transition while a pilot sender is running, expires open pilot links and freezes the pilot exposure boundary.
- A main sample can be drawn only after the study is in `fielding`. The draw excludes every business that was actually sent a pilot invitation, matching by stable external business hash so the holdout survives a refreshed frame snapshot.
- Pilot responses remain auditable and may still receive consent-scoped thank-you/results communications, but they are excluded from QA gates for the publishable analysis, weighting, estimates and release fieldwork denominators.
- The release artifact discloses pilot start/end, pilot sent/started/completed counts, the number of pilot-exposed units removed from the current main frame, and the resulting main eligible population.
- Per-stratum and overall email contactability for the release use the post-pilot main eligible population rather than the pre-pilot frozen-frame denominator.

### Frozen sample-design evidence

The sample planner is part of the reproducibility chain rather than transient admin UI state.

- Every governed sample draw stores an immutable `research_sample_designs` record with the requested completion target, expected invited-response rate, phase-eligible population, active-email contactability, planned selected n, expected contactable n and expected completes.
- `research_sample_design_strata` freezes the corresponding per-stratum population, contactability, selected n and target-complete allocation. Fieldwork balance reads these frozen targets instead of relying on the legacy frame-level `target_complete_count`.
- Pilot and main designs are phase-bound to the exact sample draw by a composite foreign key, so a planner record cannot be attached to a draw from another study or fieldwork phase.
- The sample worker derives contactability from the same frozen frame and pilot-holdout boundary used for the draw. The assumptions and allocations are serialized as `kontamou.research.sample-design.v1` and SHA-256 fingerprinted.
- The public release artifact freezes the main sample-design fingerprint and summary assumptions, allowing readers to distinguish the planned fieldwork design from the response rate that actually occurred.
- Schema 0425 hardens this at the database boundary: design rows can only be inserted while their draw is still `draft`, draw/study/phase/target identity must match, each stratum must belong to the draw frame, and persisted selected counts must match the actual sample units before the draw can be locked.

### Protocol deviations and amendments

Study departures are now governed evidence rather than informal admin notes.

- Schema 0426 adds the append-only `research_protocol_events` ledger for deviations, amendments and resolutions across design, pilot, main fieldwork, analysis and publication.
- Every event records category, severity, description, optional rationale, impact assessment, corrective action, occurrence time and a canonical `kontamou.research.protocol-event.v1` SHA-256 fingerprint.
- Material and critical events require an impact assessment. Resolution events must reference an earlier event and include corrective action.
- Rows cannot be updated or deleted; corrections and resolutions are new evidence rows. Database triggers also prevent cross-study references.
- The admin research workspace can create and review protocol events. The immutable release re-verifies every stored event hash, freezes the public-safe event ledger, and publishes the count of unresolved material/critical events.
- This prevents protocol drift from being silently rewritten after fieldwork and gives later readers a direct record of departures from the planned study.

### Invitations

- `research_invites` stores only the SHA-256 hash of the random invitation token.
- The raw token is generated inside the research worker, exists only in memory while the SES message is assembled/sent, and is never returned by an admin API or persisted in plaintext.
- The raw token appears only in the link delivered to the selected business.
- No AFM, G.E.MI. number, email or company name is placed in the URL.
- `research_invite_events` records created/sent/delivered/opened/started/saved/completed/bounced/suppressed/expired events.
- A participant may decline the current study without creating a research response. They may independently request suppression from future KONTA MOY research invitations; that choice is not marketing consent and does not alter commercial permissions.
- If a participant withdraws after starting, the response moves to `withdrawn`, a negative research-participation consent event is appended, and the sample-disposition ledger records the withdrawal.

### Consent and response

- `research_responses` contains the response lifecycle.
- `research_consents` is an append-only event ledger and stores separate choices for:
  - research participation
  - results notification
  - thank-you code
  - KONTA MOY marketing
- Research participation is required to create a response.
- Completing the core study creates the thank-you reward entitlement. Reward eligibility does **not** depend on marketing consent or on asking to receive the code.
- Delivery of the thank-you code is a separate operational step and occurs only when the latest `thank_you_code` choice is granted. The reward code is deterministically derived with HMAC from the entitlement ID and a server-only secret; only its SHA-256 hash is persisted after successful delivery.
- The three post-survey choices are independent and optional. A later change or withdrawal creates a new consent event; prior evidence is never overwritten.
- The personal token link remains a privacy/preferences control after completion. Participants can change results-notification, thank-you-code and marketing choices without reopening or mutating the completed questionnaire. Revoking a participant-delivery consent cancels any planned/failed unsent delivery; already-sent messages remain immutable delivery evidence.
- `research_answers` stores raw versioned answers.
- A trigger blocks answer modification after the response is no longer `in_progress`.
- The participant UI does not collect IP address as research data.

### Experimental module

`research_experiment_assignments` stores the exact hypothetical profiles shown in each choice task. The generator is deterministic per response/task, so an assignment can be reproduced. The experimental module is optional and does not block completion of the core questionnaire.

Analysis v5 now carries those assignments and choices into the immutable dataset hash and derives weighted attribute-level marginal selection contrasts from the randomized profile exposures. Repeated profile evaluations are clustered by respondent, uncertainty is reported with 95% intervals, and raw p-values receive Benjamini–Hochberg FDR correction across the full EXP01 contrast family. The release publishes the contributing respondent/profile counts and the exact method identifier `randomized_profile_amce_clustered_v1`.

This experimental analysis is deliberately labelled `exploratory_not_preregistered`: EXP01 existed in the locked questionnaire, but its AMCE-style estimator was not in analysis-plan v1. The implementation therefore does not back-date the estimator into the preregistration.

Schema 0422 closes the experiment-integrity loop at the database boundary. The randomized task identity, seed and both hypothetical profiles are immutable after insertion; only `selected` and `answered_at` may change while the parent response remains `in_progress`. Once a response is completed or otherwise closed, the experiment choice is immutable as well. Direct execution of the trigger guard is revoked from `PUBLIC`, `anon` and `authenticated`.

### Derived scores

`research_response_scores` stores the scoring version and derived scores.

**Greek Retail Digital Readiness Score (0–100)**

Current scoring version `greek-retail-2026-v1`:
- operational capabilities (Q05): 70%
- digital sales share (Q04): 15%
- catalogue/stock update frequency (Q06): 10%
- presence across digital sales channels (Q03): 5%

Bands:
- 0–20 Mostly Offline
- 21–40 Digitally Visible
- 41–60 Digitally Selling
- 61–80 Omnichannel
- 81–100 Digitally Integrated

**Independent Retail Friction Index (0–100)**

Q07 values are normalized with `(answer - 1) / 4 * 100`. `Not applicable` is excluded from the denominator, not scored as zero. Dimensions are catalogue, growth and operations.

### Pre-fieldwork analysis plan

Schema 0420 adds `research_analysis_plans` as the immutable scientific contract that sits between the locked instrument and any analysis run.

For Greek Retail 2026, `greek-retail-2026-plan-v1` is locked before pilot or fieldwork can start. The plan freezes:

- the two primary outcomes: `digital_readiness.mean` and `retail_friction.mean`;
- the locked-questionnaire descriptive outputs as pre-specified secondary analyses;
- region/sector pairwise differences as explicitly exploratory analyses rather than retroactive primary hypotheses;
- the weighting method, variance estimator, 95% confidence level and interval-withholding rules;
- the minimum public unweighted base and small-cell disclosure rule;
- QA gating and the interpretation rule that design-based sampling error requires maintained probability sampling.

A locked plan is immutable and has its own SHA-256 fingerprint. `research_analysis_runs.analysis_plan_id` binds the code execution to that exact plan. The release snapshot embeds the plan version, lock timestamp, JSON contract and SHA-256 hash.

### Weighting

`research_weights` separates:
- base weight
- non-response adjustment
- calibration adjustment
- final weight
- weight version and metadata

Weight versions are not overwritten. A new weighting methodology creates a new version.
 Every succeeded analysis also freezes weight-dispersion diagnostics: weight count/sum/range/mean, coefficient of variation, Kish effective sample size, weighting design effect, and the minimum/maximum within-stratum non-response adjustment. These diagnostics quantify how much effective information is lost to unequal weights and make extreme non-response correction visible instead of hiding it behind a single weighted estimate.

### Variance and confidence intervals

Analysis version `greek-retail-2026-analysis-v4` is bound to the locked analysis plan and uses `stratified_srs_fpc_v1` for design-aware variance when the estimate is a whole-study, region or sector estimate that can be expressed as a union of the actual sampling strata. The estimator applies the finite-population correction within each contributing stratum and publishes a 95% normal confidence interval.

The engine deliberately withholds an interval when any of the following is true:
- a contributing stratum has fewer than two analyzed responses;
- the metric has item non-response inside a contributing stratum;
- later calibration has produced unequal final weights inside a stratum, which would invalidate this simple SRS-within-stratum formula;
- the requested segment is a post-hoc domain such as business-size band rather than a union of sampling strata.

This is a conservative disclosure rule: absence of an interval means the implemented design-based estimator does not justify one, not that uncertainty is zero.

For the two headline 0–100 indices, analysis v4 also creates exploratory pairwise differences across region and sector levels when both component estimates have design-supported standard errors. Because these domains are disjoint unions of sampling strata, the difference standard error is calculated from the two component variances. Each comparison freezes A−B, its 95% interval, z-score and raw two-sided normal p-value. Within each metric × comparison-dimension family, the engine also freezes a Benjamini–Hochberg false-discovery-rate adjusted q-value. The raw p-value is preserved separately, and the adjustment family/method are explicit in metadata. Pairwise output remains exploratory evidence and must be interpreted with effect size, uncertainty, sample bases and the number of comparisons rather than a mechanical threshold rule.

### Quality review

Automated completion checks can append a `review` decision without modifying the completed response. Analysis and release are blocked while any latest QA decision remains `review`. A `research.manage` administrator resolves the flag through the research admin surface by appending a new `include` or `exclude` decision; historical QA evidence is never overwritten. The review queue exposes only response ID, region/sector, duration, reason flags and derived scores—not contact values or raw answer payloads.

### Analysis and publication

- `research_analysis_runs` records the immutable analysis-plan ID together with code version, instrument version, weight version, parameters and dataset hash.
- `research_release_snapshots` records the exact analysis run, methodology JSON, dataset SHA-256, artifact SHA-256, public URL and release version.
- The frozen methodology embeds the locked analysis-plan version/hash/JSON, exact questionnaire wording/configuration, the recruitment template(s) actually used for the sampled fieldwork, overall and per-stratum sent/delivered/opened/started/completed/withdrawn counts, explicit conversion-rate denominators, and the latest final sample-disposition counts. These fieldwork facts therefore remain attached to the release even after the live study continues to evolve operationally.
- Publishing a release queues a results-notification worker. It selects only completed responses whose latest `results_notification` consent is granted; marketing consent is neither read nor required.
- `research_participant_deliveries` stores the operational state and content hashes for thank-you and results messages. `research_participant_delivery_events` is append-only evidence for planned/sending/sent/delivered/opened/bounced/complained/failed outcomes.
- A published chart/table must therefore be traceable to a release snapshot and analysis run.
- The public evidence endpoint `/api/research/:slug/release` reconstructs the exact canonical `kontamou.research.release.v1` artifact used for the stored artifact SHA-256. If reconstruction no longer hashes to the frozen fingerprint, the endpoint fails closed instead of serving a silently divergent artifact.
- Publication itself now uses the same reconstruction inside the publication transaction. A release cannot transition the study to `published` if its current methodology + estimate rows no longer reproduce the stored artifact SHA-256, so integrity is enforced before publication as well as during later download.
- The public results page exposes both the human-oriented results API and the canonical downloadable evidence JSON. The downloaded bytes can be hashed directly with SHA-256 and compared with the published Artifact SHA-256 fingerprint.

## Lifecycle

1. **Draft** — study and instrument may be edited.
2. **Instrument lock** — question rows become immutable for that version.
3. **Pilot** — tokenized field testing is allowed without declaring full fieldwork.
4. **Fielding** — requires both a frozen frame and locked/fielded sample draw.
5. **Closed** — response collection is closed and the instrument is retired.
6. **Analysis** — weighting, exclusions and statistical analysis are versioned.
7. **Published** — only after a release snapshot exists. Publishing is intentionally not an automatic consequence of finishing analysis.

Lifecycle transitions use `research.manage`, CSRF protection and the existing admin audit ledger.

## RBAC

- `research.read`: super_admin, compliance, auditor.
- `research.manage`: super_admin only.
- Public participants have no direct database role access to research tables.

## Database / API security

All research tables are RLS-enabled. `anon` and `authenticated` receive no direct privileges on the research tables. Public browser traffic only reaches server-side Next.js research routes. The service/database connection used by the application is never exposed to the browser.

Schema 0421 also removes unnecessary `SECURITY DEFINER` execution from the analysis-plan trigger functions, switches them to `SECURITY INVOKER`, revokes direct execution from `PUBLIC`, `anon` and `authenticated`, and explicitly limits execution to `bls_platform_runtime`. This keeps analysis-plan immutability enforcement inside the same server-only privilege boundary as the research tables.

Contact values and responses are kept in separate relational domains even though both reside in the research schema family. Admin surfaces should expose aggregate response information by default and require an explicit, audited workflow for contact-level access.

## Public routes

- `/research/greek-retail-2026` — public study overview.
- `/research/greek-retail-2026/methodology` — methodology and reproducibility statement.
- `/research/:slug/t/:token` — tokenized participant survey.
- `/api/research/:slug/results` — machine-readable published results with release fingerprints.
- `/api/research/:slug/release` — canonical downloadable evidence artifact whose response bytes match the stored artifact SHA-256.
- `POST /api/research/:slug/t/:token` — server-side consent/save/complete endpoint plus token-authenticated refusal, future-research opt-out, and post-completion optional-consent preference updates.

## Admin routes

- `/admin/research/surveys` — research control centre.
- `POST /api/admin/research/surveys/:slug/lifecycle` — audited lifecycle transition.
- `POST /api/admin/research/surveys/:slug/jobs` — audited frame, sample, invitation, reward-delivery, analysis, release and results-notification queue plus immutable recruitment-copy locking.
- `POST /api/webhooks/research-ses` — verified Amazon SNS endpoint for SES research delivery events.

Invitation delivery is intentionally gated. It requires a locked/fielded probability sample, a locked recruitment-template version, study status `pilot` or `fielding`, and explicit production enablement through `BLS_RESEARCH_EMAIL_DELIVERY_ENABLED=true`. The worker sends through the existing SES sender using the dedicated `BLS_RESEARCH_SES_CONFIGURATION_SET`; SES message tags carry only internal study/invite/batch identifiers, never the raw token.

### Governed reminder / recontact protocol

Schema 0419 deliberately separates the **canonical invitation identity** from later contact attempts:

- `research_invites` remains the one canonical sample-unit invitation. `research_responses.invite_id` still binds a participant to exactly one response identity.
- `research_invite_access_tokens` stores only SHA-256 hashes of reminder/reissue tokens. The raw token exists only in worker memory while the email is assembled.
- `research_invite_messages` records each initial/reminder/reissue contact attempt, its locked recruitment template, selected contact point, sequence number, SES provider ID and delivery state.
- A reminder resolves back to the canonical invite before any response is loaded or saved. It cannot create a second response row and it never increments the invitation denominator.
- Reminder jobs are explicitly queued with a batch limit, minimum age of the original invitation, minimum inter-reminder gap and per-invite cap. Completed, withdrawn, excluded, expired, suppressed or globally suppressed contacts are ineligible.
- A failed or uncertain attempt is not automatically resent inside the same reminder job. This is fail-closed to reduce accidental duplicate email; a later governed job is an explicit new contact decision.
- The release snapshot freezes both the reminder copy actually used and contact-attempt paradata, while the fieldwork funnel remains based on distinct canonical invites.

The admin control centre treats invitation copy and reminder copy as separate versioned templates. SES tags may include an internal `research_attempt` UUID so a signed SNS callback can reconcile a delivery/open/bounce even if it arrives before the worker has persisted the SES provider message ID; no raw survey token is placed in SES tags.


The SNS endpoint requires `BLS_RESEARCH_SES_SNS_TOPIC_ARN`, rejects messages for any other topic, validates the AWS signing-certificate URL and SNS signature, and writes delivery/open/bounce/complaint outcomes back into either the invitation ledgers or the participant-delivery ledger by SES provider message ID. Bounces and complaints suppress every matching research contact row and append the normalized contact hash to the cross-wave suppression ledger. A future-research opt-out alone does not cancel a separately requested thank-you or results message; a bounce, complaint or invalid contact does.

## G.E.MI. integration boundary

The existing G.E.MI. export/search capability is a source adapter, not the study database. A frame-build job should:
1. store the exact G.E.MI. filters and source timestamp,
2. normalize eligible units,
3. hash the stable external key,
4. assign strata,
5. calculate population counts,
6. freeze the snapshot and calculate its content hash.

Later source updates never mutate a frozen frame. They create a new snapshot.

## Repeat waves

2027 and later waves should create new study/instrument/frame/sample records while preserving stable analysis keys for longitudinal measures. Wording changes require a new instrument version and must be called out in the methodology. Cross-wave contact suppression is checked during frame ingestion and again immediately before delivery, so a later wave does not override an earlier research opt-out, complaint or bounce.

## Release checklist

A release is not scientifically ready until it has:
- target population definition
- frame source/date and frozen population count
- eligibility/exclusion rules
- sampling algorithm + seed + inclusion probabilities
- field dates
- invitations / starts / completes / response disposition counts
- questionnaire version, exact wording, response configuration and analysis keys
- recruitment copy/version/hash used during fieldwork
- reminder/recontact copy plus attempt counts by attempt kind and delivery state
- explicit denominator rule proving reminders do not create additional invitation identities
- overall and per-stratum fieldwork funnel, explicit denominators and final disposition counts
- sealed final-disposition coverage for every selected sample unit, plus versioned gross/net completion and participation denominator definitions
- weighting version and diagnostics
- unweighted and weighted bases for published estimates
- quality/exclusion rules
- locked pre-fieldwork analysis-plan version + SHA-256 fingerprint
- primary/secondary/exploratory classification of published analyses
- analysis code version + dataset hash
- weighting dispersion / Kish effective sample size diagnostics
- pairwise comparison method, intervals, raw p-values, FDR-adjusted q-values and explicit adjustment family where comparative inference is published
- limitations
- release artifact hash

If probability sampling is not successfully maintained, do not present a conventional margin of sampling error as though the study were a probability sample.


## Production schema rollout

The research schema is deployed through the repository's checksum-aware migration ledger, not by applying the SQL files independently through a second migration system.

`.github/workflows/research-survey-schema-rollout.yml` is a manual-only production workflow. Its default execution is preflight-only. Before any mutation it:

- verifies the immutable migration checksum manifest;
- requires the repository migration head to be exactly 425;
- requires the production application ledger to be either clean schema 415 or already-complete schema 425;
- rejects a schema-415 database if any key research table already exists, preventing a partial-state rollout;
- uses the protected `production` environment and its `DATABASE_URL` secret.

Only an explicit workflow dispatch with `apply=true` runs `npm run db:migrate`. The existing migrator applies missing SQL and inserts the exact filename/SHA-256 into `public.schema_migrations` in the same guarded migration transaction. Postcheck then requires schema 425 and the key research relations, including the locked analysis-plan and immutable sample-design tables, before application readiness is evaluated.

The rollout workflow does not enable research email delivery or start fieldwork. Those remain separate governed actions. Pilot and fielding transitions additionally fail closed unless a locked analysis plan exists for the active instrument.

## Production research-delivery configuration

Required before any research invitation job can send:

- `BLS_RESEARCH_EMAIL_DELIVERY_ENABLED=true`
- `BLS_RESEARCH_SES_CONFIGURATION_SET=<dedicated research configuration set>`
- `BLS_RESEARCH_SES_SNS_TOPIC_ARN=<SNS topic used by that configuration set>`
- `BLS_RESEARCH_REWARD_SECRET=<at least 32 random characters>` for deterministic thank-you code derivation without plaintext code storage
- AWS SES credentials already used by the admin-mail SES runtime
- optional `BLS_RESEARCH_SES_FROM` and `BLS_RESEARCH_SES_REPLY_TO` (default: `partners@kontamou.site`)

The SES configuration set should publish at least Delivery, Bounce and Complaint events to the configured SNS topic. Open events may also be enabled for fieldwork diagnostics; Click events are deliberately ignored by the research persistence layer.


## Post-participation delivery invariants

- Reward eligibility is completion-based; reward **delivery** is consent-based.
- Results notification is release-based and consent-based.
- Neither path reads or depends on KONTA MOY marketing consent.
- Already-sent messages are idempotently skipped by unique delivery keys.
- SES message content is not persisted; only subject/body SHA-256 hashes and provider message IDs are stored.
- The worker may retry a failed reward email with the same derived code because the code can be regenerated from the entitlement ID and server-only HMAC secret.
- No monetary discount percentage or credit amount is hard-coded in the research engine. Commercial reward terms remain a separately governed KONTA MOY decision.
