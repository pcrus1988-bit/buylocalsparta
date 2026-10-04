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

### Contact layer

- `research_contact_points` is intentionally separate from the response dataset.
- Email/phone/postal contact values have a companion SHA-256 hash for matching and suppression.
- Contactability never changes the frozen population definition.
- Invalid, bounced or suppressed contact points remain explicit non-response evidence rather than being silently removed from the denominator.

### Invitations

- `research_invites` stores only the SHA-256 hash of the random invitation token.
- The raw token appears only in the link delivered to the selected business.
- No AFM, G.E.MI. number, email or company name is placed in the URL.
- `research_invite_events` records created/sent/delivered/opened/started/saved/completed/bounced/suppressed/expired events.

### Consent and response

- `research_responses` contains the response lifecycle.
- `research_consents` is an append-only event ledger and stores separate choices for:
  - research participation
  - results notification
  - thank-you code
  - KONTA MOY marketing
- Research participation is required to create a response.
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
- `POST /api/research/:slug/t/:token` — server-side consent/save/complete endpoint.

## Admin routes

- `/admin/research/surveys` — research control centre.
- `POST /api/admin/research/surveys/:slug/lifecycle` — audited lifecycle transition.

The invitation-batch runtime exists but should be connected to the approved outbound-mail workflow only after the study has a locked sample and the invitation communication/legal basis has been approved.

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

2027 and later waves should create new study/instrument/frame/sample records while preserving stable analysis keys for longitudinal measures. Wording changes require a new instrument version and must be called out in the methodology.

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
