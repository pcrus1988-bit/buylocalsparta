# KONTA MOY Sport & Fit recommendation rules

Ruleset: `2026-10-02.5`

Sport & Fit recommendations are a KONTA MOY-owned deterministic expert system. They do not require an external recommendation API and they do not infer missing technical product facts.

## Decision order

1. **Commercial eligibility** — product is active, priced, visible and has fresh positive stock.
2. **Known-size eligibility** — when the requested footwear size is known and the product exposes sizes, a missing size is a hard rejection.
3. **Governed technical compatibility** — documented activity, surface, football outsole and fit conflicts are evaluated before generic catalogue heuristics.
4. **Technical requirement profile** — every footwear candidate is evaluated against weighted requirements and receives a separate `technicalScore` plus `technicalCoverage`. A documented match scores above an unknown fact; an unknown fact is never treated as verified compatibility.
5. **Sport-specific suitability rules** — running, walking, gym, football and the expanded sport paths apply their own technical matrix.
6. **Secondary preference scoring** — budget and softer catalogue signals can reorder candidates only after technical compatibility. They cannot rescue a hard incompatibility or outrank a materially stronger governed technical match.
7. **Complete My Kit** — apparel, socks and accessories are selected independently after the primary technical match.

Unknown facts remain unknown. A missing fact is not converted into a positive claim.

## Running

Primary inputs:

- surface;
- typical distance;
- weekly frequency;
- runner need;
- fit preference;
- cushioning and support facts;
- verified use case;
- verified weight / fit where available;
- requested size;
- fresh stock;
- technical evidence coverage across the selected running profile.

Examples:

| Situation | Rule behavior |
| --- | --- |
| Trail selected + verified road-only footwear | hard reject |
| Long distance + `long_run` | strong positive |
| Long distance + high/max cushioning | positive |
| Long distance + low/minimal cushioning | negative |
| High frequency + `daily_training` | positive |
| Guided-support need + guided/stability/max-support fact | strong positive |
| Guided-support need + verified neutral support | negative, not a medical judgment |
| Wide-fit need + verified narrow fit | hard reject |
| Speed need + `speed_training` / `race_day` | strong positive |
| Speed need + lower verified weight | secondary positive |

The system does not diagnose pronation, injuries or medical conditions. It only matches a user-stated preference to documented product properties.

## Football

Football footwear uses outsole-to-ground compatibility before general scoring.

| Selected ground | Compatible documented outsole codes |
| --- | --- |
| Natural grass | FG, MG |
| Artificial / turf | AG, MG, TF |
| Indoor / futsal | IN |

A known conflicting outsole code is a hard rejection. If the outsole code is unknown, no compatibility bonus is invented; other governed surface facts may still support the match.

## Gym

Gym recommendations use the training type instead of treating every gym shoe as interchangeable.

| Training type | Main technical preference |
| --- | --- |
| Strength | stability / control; `gym_strength`; avoid excessive cushioning |
| Functional / HIIT | general-training evidence; balanced stability and cushioning |
| Cardio | `gym_cardio`; medium-to-high cushioning can be positive |
| Treadmill | running/cardio logic plus treadmill/indoor/road compatibility |
| Mixed | all-round general-training evidence; no extreme bias |

For strength work, high/max cushioning receives a penalty because the rules prioritize stable footing. For cardio/treadmill work, cushioning becomes more valuable.

## Walking

Walking uses documented walking/hiking activity, selected surface, daily/all-day use cases, fit, distance, size and stock. Trail walking may accept documented hiking footwear. Road running does not inherit that compatibility.

The technical profile now separates:
- prolonged walking (long distance / high frequency);
- explicit cushioning priority;
- all-day / travel / daily-walking evidence;
- traction requests against documented surface compatibility;
- weather requests against documented weather-protection facts.

Low or missing evidence is not silently converted into comfort or weather protection.

## Hiking / outdoor

Hiking has its own terrain profile rather than reusing generic walking logic. Technical hikes look for exact `technical_hike` evidence or documented trail/mixed-terrain compatibility. Day-hike and urban-outdoor use cases remain distinct. Weather priority only receives a verified match when water/wind protection is documented, and traction priority is tied to documented terrain compatibility.

## Basketball, tennis, padel and volleyball

Court sports keep sport identity and surface as hard technical gates when those facts are known. The weighted technical profile additionally evaluates:
- lateral-stability preference from documented support/stability facts;
- cushioning/comfort preference from governed cushioning levels;
- traction preference from exact court-surface compatibility;
- high-frequency use from sport-specific training/match evidence.

A neutral support label is not treated as proof of poor lateral stability; it remains unknown for that requirement. Likewise, a missing cushioning or court-surface fact is not promoted to a positive match.

## Fit and size

- Exact known EU size or manufacturer-resolved measurement is checked against live variant sizes.
- A known footwear-size miss is excluded rather than merely penalized.
- Brand size guides remain isolated by brand.
- Verified width profiles can influence standard/wide/narrow preferences.
- A documented narrow model is rejected for an explicit wide-fit requirement.
- Unknown width or length fit is not treated as verified compatibility.

## Complete My Kit

Kit items now use their own weighted technical-confidence profile instead of inheriting near-perfect confidence from stock alone.

For socks, tops, bottoms, layers and accessories, the engine can evaluate:
- documented activity and exact use-case evidence;
- moisture-wicking evidence in higher-sweat / high-frequency contexts;
- breathability where frequent use or comfort makes it relevant;
- sock cushioning for comfort/cushioning requests;
- documented sock arch-support construction for a stability preference, without making a medical claim;
- weather protection for outdoor/weather-priority contexts;
- thermal evidence for hiking layers/socks;
- reflective details for frequent running contexts.

A missing performance fact stays `unknown`. A generic in-stock shirt or sock therefore no longer receives 100% technical confidence simply because availability is known. Documented cross-sport activity differences lower confidence but do not hard-reject versatile apparel; hard incompatibility remains reserved for categories such as footwear where the evidence supports a deterministic exclusion.

## Explainability

Each scored product carries:

- `technicalEligible`;
- `technicalScore` (0–100), based on the weighted technical requirement profile;
- `technicalCoverage` (0–100), showing how much of the requested technical profile is actually documented;
- `technicalRequirements`, with `match`, `conflict`, `unknown` or `not_applicable` state per requirement;
- `appliedRules` rule identifiers;
- concise customer-facing reasons;
- the ruleset version on the recommendation response.

Primary ranking is now ordered by `technicalScore`, then `technicalCoverage`, then the softer recommendation score. This prevents an aggressively worded catalogue title from beating a product with stronger governed evidence.

This makes rule changes testable and auditable without exposing raw evidence text to the storefront.

## Evidence precedence

The recommendation rules consume only the governed Sport & Fit knowledge layer:

1. exact manufacturer product evidence;
2. official brand guides / technical documentation;
3. direct vendor-feed claims where explicitly stated;
4. lower-confidence catalogue/title heuristics only when no stronger fact exists.

Blocked, conflicting, insufficient or weak-identity knowledge cannot drive hard technical decisions.
