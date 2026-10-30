# Greek Retail 2026 — public disclosure base amendment (30 October 2026)

## Decision
The study owner requested reducing the **minimum unweighted public descriptive base** from **30 to 5** to allow more historic prefectures (νομοί) to display their real metric values before the scheduled 1 November release.

This is a **during-fieldwork, prepublication disclosure amendment**, not part of the original preregistration. Preserve the original locked plans unmodified. Do not relabel this as a pre-fieldwork decision.

## Live database evidence
- Study: `greek-retail-2026`; wave: `1b1bc971-705a-4b97-92c5-202600000101`
- Superseded locked plan: `ca739396-b2ba-4aef-8ed5-4aa2b39acad5` (`greek-retail-2026-plan-v2-rmuzikzgj`)
- New locked plan: `8478d935-aead-410c-b52f-903052113340` (`greek-retail-2026-plan-v3-public-n5-20261030`)
- New SHA-256: `00cf6a9a04f9f519845ced6e5c6d51aacebc46d963bd0f0a75ed7b2295813d05`
- Supersession recorded append-only in `research_analysis_plan_supersessions`.

## Scope and safeguards
- One-dimensional public descriptive indicators for a county: `n >= 5`, metric-specific, using the **actual number of valid responses for the metric**.
- `n < 5`: no publishable estimate. The county may still be listed with an unavailable state.
- Confidence intervals for post-hoc county domains continue to be withheld when unsupported.
- A county's five-response estimate is **not representative of its whole county**. Clearly label `n=5–29` as unstable/exploratory.
- Cross-tab disclosure retains its independent approval requirement and `n >= 50`.
- Experimental contrasts retain the original minimum arm base of 30 and remain excluded from the public result adapter.
- Survey closure and publication clocks are unchanged.

## Implementation
The analysis runtime reads the newest compatible locked plan and fails closed if code/plan minimums differ. `research-disclosure-policy.ts` defines the descriptive base. The public serialization adapter validates both the new threshold and approval metadata for single-prefecture aggregates. Public graphical UI annotates small bases.

## Verification
Check both plan and app deployment prior to the scheduled analysis. Confirm production runs record `parameters.publicMinimumBase=5`, the new `analysis_plan_id`, and that county results with n=5 are present while n=4 and unapproved cross-tabs are withheld. No public result should be visible before the existing release gate.
