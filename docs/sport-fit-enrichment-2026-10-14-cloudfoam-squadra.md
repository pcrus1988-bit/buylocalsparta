# Sport & Fit governed knowledge batch — 14 October 2026

## Scope and architectural continuity

This batch extends **existing** `attribute_definitions`, `attribute_values`, `product_family_attribute_values`, `sport_product_fact_evidence`, `sport_knowledge_sources`, `sport_product_knowledge`, `sport_knowledge_enrichment_queue` and `bls_private.refresh_sport_product_knowledge`. Technical knowledge remains on the canonical family, not on individual vendor offers.

Earlier work on development PR #1330 used migration numbers 0416–0426, but those numbers have since been assigned to research migrations on main. The independently checked and successfully rehearsed Cloudfoam/fit subset has therefore been **re-based as 0448**, rather than merging that stale chain. Migration 0449 fixes three still-live football apparel evidence conflicts.

## 0448 — 10 exact adidas footwear families

Original exact-code curated manufacturer batch from the existing Sport & Fit branch, reverified against current production targets via transactional SQL guards:

* KJ1750 and KJ1757 (Response 2) — Cloudfoam+
* JP6592 (Galaxy 7), IH9808 (Galaxy 8), KJ9916/IE8898 (Ultimashow 2), HP7006 (Cloudfoam Flex Rapidfit), JP5157 (Runfalcon 5), KJ7282 (Cloudfoam Flex Laces) — Cloudfoam
* IG9166 (Advantage 2) — Cloudfoam Comfort

Ten named footwear technology facts and seven explicit manufacturer `Regular fit` facts; 17 attached exact manufacturer evidence rows. This deliberately preserves `Regular fit` as a distinct qualitative label, without reclassifying width (`narrow/standard/wide`) or true-to-size length. **Do not infer cushioning level or support level from the Cloudfoam technology name.** The original first-party source identity and URLs are preserved, not duplicated.

The migration registers two governed catalogue attributes and four controlled values on the existing footwear product types. It fails closed if a target family, official source, sellable approved offer, controlled target slot, or identity contract has drifted.

Independent first-party spot-check on 14 Oct 2026:
* `JP6592` Galaxy 7 adidas product page: explicit Cloudfoam midsole, Regular fit, road running and published 6 mm reference drop (existing geometry retained).
* `KJ1757` Response 2 adidas product page: explicit Cloudfoam+ midsole, Regular fit, 256 g and 8 mm drop (existing geometry retained).

## 0449 — three exact Squadra 25 football jacket conflicts

* JV6067, JP3389, JE2774.
* Each had an existing high-confidence adidas `sport_activity=football` fact and first-party evidence, but a simultaneously active, lower-tier catalogue `general_training` observation.
* **No new football claim is created.** The three weaker active observations are preserved as inactive audit history with `superseded_by` pointing to the exact adidas evidence.
* Calls the existing knowledge refresh routine so these three are no longer in conflict, while preserving unresolved technical fields as unknown and removing only already-resolved queue fields.

## Verification performed

Ran each exact SQL migration **inside a live-catalogue transaction ending with ROLLBACK**, then ran both exact files concatenated inside a single rolled-back transaction. All migration guards passed, including identity, sellable offer, expected 10 technology + 7 fit + 17 manufacturer evidence cardinalities, 3 source supersessions, 3 non-conflicting Squadra states, and no change in graded cushioning/support/width/length fact counts. Production tables were not modified by these rehearsals.

Checksums for both checked-in migrations are recorded in `checksums.0448.json` and `checksums.0449.json`. The existing PostgreSQL runtime schema gate is advanced from **447 to 449** in the same branch, matching the migration manifest invariant. The Squadra 25 family-specific reconciliation fails closed in a populated production catalogue but is intentionally a no-op in the empty-catalogue CI bootstrap. The final checked-in chain was re-executed on the live populated catalogue with a terminating `ROLLBACK` after these CI-compatibility changes. These are deployment-ready migration **proposals**, not proof of production application. Apply through the existing repo migration pipeline only after code review and CI pass.

## Explicitly unknown / next work

* Technical cushioning/support grades are **not** derived from Cloudfoam, AEROREADY or a vague comfort phrase.
* Exact width and toe-box geometry remain unknown unless separately documented.
* App-wide compatibility graph relationships, size-guide-to-live-variant binding and cross-sport zero-survivor cases are not changed in this batch.
* Next high-value group: targeted first-party classification / fit verification for sellable Galaxy 8, Adizero SL2, Anylander and Cloud X 5; then recommendation hard-rejection regression scenarios and stock-size integration.
