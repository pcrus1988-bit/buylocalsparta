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
- The three post-survey choices are independent and optional. A later change or withdrawal creates a new consent event; prior evidence is never overwritten.
- `research_answers` stores raw versioned answers.
- A trigger blocks answer modification after the response is no longer `in_progress`.
- The participant UI does not collect IP address as research data.

### Experimental module

`research_experiment_assignments` stores the exact hypothetical profiles shown in each choice task. The generator is deterministic per response/task, so an assignment can be reproduced. The experimental module is optional and does not block completion of the core questionnaire.

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

### Weighting

`research_weights` separates:
- base weight
- non-response adjustment
- calibration adjustment
- final weight
- weight version and metadata

Weight versions are not overwritten. A new weighting methodology creates a new version.

### Variance and confidence intervals

Analysis version `greek-retail-2026-analysis-v2` uses `stratified_srs_fpc_v1` for design-aware variance when the estimate is a whole-study, region or sector estimate that can be expressed as a union of the actual sampling strata. The estimator applies the finite-population correction within each contributing stratum and publishes a 95% normal confidence interval.

The engine deliberately withholds an interval when any of the following is true:
- a contributing stratum has fewer than two analyzed responses;
- the metric has item non-response inside a contributing stratum;
- later calibration has produced unequal final weights inside a stratum, which would invalidate this simple SRS-within-stratum formula;
- the requested segment is a post-hoc domain such as business-size band rather than a union of sampling strata.

This is a conservative disclosure rule: absence of an interval means the implemented design-based estimator does not justify one, not that uncertainty is zero.

### Quality review

Automated completion checks can append a `review` decision without modifying the completed response. Analysis and release are blocked while any latest QA decision remains `review`. A `research.manage` administrator resolves the flag through the research admin surface by appending a new `include` or `exclude` decision; historical QA evidence is never overwritten. The review queue exposes only response ID, region/sector, duration, reason flags and derived scores—not contact values or raw answer payloads.

### Analysis and publication

- `research_analysis_runs` records code version, instrument version, weight version, parameters and dataset hash.
- `research_release_snapshots` records the exact analysis run, methodology JSON, dataset SHA-256, artifact SHA-256, public URL and release version.
- A published chart/table must therefore be traceable to a release snapshot and analysis run.

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

Contact values and responses are kept in separate relational domains even though both reside in the research schema family. Admin surfaces should expose aggregate response information by default and require an explicit, audited workflow for contact-level access.

## Public routes

- `/research/greek-retail-2026` — public study overview.
- `/research/greek-retail-2026/methodology` — methodology and reproducibility statement.
- `/research/:slug/t/:token` — tokenized participant survey.
- `POST /api/research/:slug/t/:token` — server-side consent/save/complete endpoint plus token-authenticated refusal / future-research opt-out action.

## Admin routes

- `/admin/research/surveys` — research control centre.
- `POST /api/admin/research/surveys/:slug/lifecycle` — audited lifecycle transition.
- `POST /api/admin/research/surveys/:slug/jobs` — audited frame, sample, invitation and analysis job queue plus immutable recruitment-copy locking.
- `POST /api/webhooks/research-ses` — verified Amazon SNS endpoint for SES research delivery events.

Invitation delivery is intentionally gated. It requires a locked/fielded probability sample, a locked recruitment-template version, study status `pilot` or `fielding`, and explicit production enablement through `BLS_RESEARCH_EMAIL_DELIVERY_ENABLED=true`. The worker sends through the existing SES sender using the dedicated `BLS_RESEARCH_SES_CONFIGURATION_SET`; SES message tags carry only internal study/invite/batch identifiers, never the raw token.

The SNS endpoint requires `BLS_RESEARCH_SES_SNS_TOPIC_ARN`, rejects messages for any other topic, validates the AWS signing-certificate URL and SNS signature, and writes delivery/open/bounce/complaint outcomes back into the invitation event and sample-disposition ledgers. Bounces and complaints suppress every matching research contact row and append the normalized contact hash to the cross-wave suppression ledger.

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
- questionnaire version and exact wording
- weighting version and diagnostics
- unweighted and weighted bases for published estimates
- quality/exclusion rules
- analysis code version + dataset hash
- limitations
- release artifact hash

If probability sampling is not successfully maintained, do not present a conventional margin of sampling error as though the study were a probability sample.


## Production research-delivery configuration

Required before any research invitation job can send:

- `BLS_RESEARCH_EMAIL_DELIVERY_ENABLED=true`
- `BLS_RESEARCH_SES_CONFIGURATION_SET=<dedicated research configuration set>`
- `BLS_RESEARCH_SES_SNS_TOPIC_ARN=<SNS topic used by that configuration set>`
- AWS SES credentials already used by the admin-mail SES runtime
- optional `BLS_RESEARCH_SES_FROM` and `BLS_RESEARCH_SES_REPLY_TO` (default: `partners@kontamou.site`)

The SES configuration set should publish at least Delivery, Bounce and Complaint events to the configured SNS topic. Open events may also be enabled for fieldwork diagnostics; Click events are deliberately ignored by the research persistence layer.
