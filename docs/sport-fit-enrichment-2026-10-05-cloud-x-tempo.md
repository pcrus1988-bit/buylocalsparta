# Sport & Fit enrichment — Cloud X Tempo hybrid training

Date: 2026-10-05
Schema: 412

## Batch

This batch enriches four currently sellable On Cloud X Tempo canonical families identified by exact manufacturer style code:

- 3MG30110969
- 3MG30116013
- 3WG30090969
- 3WG30095084

The existing knowledge already governs gym training + running activity, gym functional use, true-to-size fit, 8 mm drop, and sex-specific reference weight.

## New governed facts

On's current product pages describe Cloud X Tempo as a hybrid-training shoe built for workouts where strength meets cardio. The previous normalization retained only `gym_functional`, which made strength/cardio requests lose exact use-case evidence.

Schema 412 preserves all three compatible use contexts instead of collapsing the source claim:

- `gym_functional`
- `gym_strength`
- `gym_cardio`

The migration adds 8 family facts and 8 exact-source evidence rows: two new use-case facts for each of four families.

## Deliberately unresolved

The source also uses qualitative language such as soft/responsive cushioning, stability, secure fit and breathability. This batch does **not** translate those phrases into the controlled `cushioning_level`, `support_level`, `footwear_width_profile` or `toe_box_profile` fields. Stack heights, plate type, governed surface and weather protection also remain unknown unless a separate exact source verifies them.

This is intentional: unknown remains unknown.

## Recommendation behavior

The rule engine already supports `gym_strength`, `gym_cardio` and `gym_functional`. With the additional governed facts:

- strength requests can receive an exact gym-training-type match without inferring stability/cushioning;
- cardio requests can receive an exact gym-training-type match without inferring cushioning intensity;
- functional requests retain their existing exact match;
- running remains a separately governed activity;
- unrelated sports remain excluded by the existing hard activity mismatch rule.

Regression coverage in `sport-fit-technical-profiles.test.ts` verifies the strength/cardio behavior and verifies that cushioning/support remain unset.

## Provenance

Primary evidence: exact/current On Cloud X Tempo manufacturer product pages and current On training classification, retrieved 2026-10-05. Each normalized fact is linked to the exact product-source record already stored in `sport_knowledge_sources`.

No vendor-offer technical facts are introduced. Commercial availability remains on variants/offers; technical knowledge remains on the canonical family layer.
