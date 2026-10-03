# Sport & Fit Knowledge Layer

## Purpose

The Sport & Fit knowledge layer turns catalogue products into evidence-backed recommendation candidates without making technical claims from weak signals.

The core rule is:

> Product facts belong to the canonical product family/variant. Evidence explains why a fact is trusted. Titles and taxonomy may create research signals, but they do not become precise technical specifications by themselves.

This layer is intentionally vendor-independent. Kerasiotis is the first pilot catalogue, but the same family-level knowledge can be reused when another vendor sells the same canonical product.

## Data layers

### 1. Normalized product facts

Sports facts use the existing governed catalogue tables:

- `attribute_definitions`
- `attribute_values`
- `product_type_attributes`
- `product_family_attribute_values`
- `canonical_variant_attribute_values`

Examples:

- sport/activity
- surface
- use case
- cushioning
- support
- heel-to-toe drop
- stack height
- shoe weight
- width/fit profile
- football outsole code
- weather protection
- sock cushioning
- moisture management
- thermal/breathability signals

Family-level facts describe a model. Variant-level facts remain appropriate for size, colour or a genuine variant-specific specification.

### 2. Evidence and provenance

`sport_knowledge_sources` records where information came from.

`sport_product_fact_evidence` links a normalized fact to its evidence, including:

- source
- source locator
- evidence excerpt
- extraction method
- fact confidence
- exact-product identity confidence
- whether the evidence is direct, manufacturer-provided, independently measured, catalogue-level or derived

Multiple pieces of evidence may coexist. Conflicting high-confidence evidence must remain visible rather than silently overwriting another source.

### 3. Knowledge state

`sport_product_knowledge` tracks the family-level lifecycle:

- pending
- researching
- partial
- verified
- conflict
- insufficient

It also records completeness, evidence quality, source count and conflict count.

### 4. Enrichment queue

`sport_knowledge_enrichment_queue` is the durable work queue for missing facts.

Each family carries:

- product role
- priority
- requested fields
- source hints
- attempts / lease
- failure state

The first priority is footwear because shoe recommendations depend most heavily on technical product facts.

## Evidence hierarchy

### Tier 1 — existing catalogue/vendor evidence

Use for identity and direct claims already present in the feed:

- GTIN/EAN
- MPN/style code
- exact product title/model
- brand
- manufacturer colour
- size
- source description
- source category

Do not infer technical measurements that are absent from the feed.

### Tier 2 — exact manufacturer product page

Preferred source for:

- intended activity
- intended surface
- official product weight
- stated heel-to-toe drop
- stated cushioning/support classification
- plate technology
- waterproof/windproof claims
- official football surface code
- official fit/width information

An external page is accepted only after strong product identity matching.

### Tier 3 — brand technical / size guides

Use for:

- definition of brand-specific technologies
- size conversions
- width nomenclature
- product-family fit guidance
- surface-code semantics

A generic brand guide must not be used to claim a fact about a specific product unless the guide explicitly covers that model/family.

### Tier 4 — independent measurement / lab

Useful when the exact product identity is strong, especially for:

- measured weight
- stack height
- heel-to-toe drop
- forefoot/toe-box dimensions
- measured flexibility or other lab properties

Independent measurements must retain the test methodology/reference size.

### Tier 5 — deterministic inference

Allowed only for broad discovery signals such as:

- running category -> running activity
- fitness-accessories category -> gym/fitness activity
- team-sports category -> team-sports activity

Do not derive drop, stack, support, weight, width, waterproofing or surface code from vague marketing language.

## Pilot findings: Kerasiotis

The current XML feed provides useful identity and commerce fields across the imported catalogue:

- brand
- title
- vendor SKU
- item group
- size on most rows
- colour on a subset
- description on a subset
- MPN on a smaller subset
- images
- price
- stock
- source category

The current normalized sports catalogue has strong size coverage, but the queried running-shoe, sneaker, activewear and sock groups do not yet have normalized sports descriptions/specifications. Therefore the initial Sport & Fit engine must not pretend it knows precise cushioning, drop, support or surface.

Many running titles already contain useful identity/technology tokens such as model/style codes and names (for example adidas Duramo, Galaxy, Response, Lightmotion or Cloudfoam). These are research keys, not sufficient technical evidence on their own.

## Initial enrichment priorities

1. Running shoes
   - exact model identity
   - sport/activity
   - road/trail/treadmill/mixed use
   - cushioning
   - support
   - weight
   - heel-to-toe drop
   - fit length/width
   - weather protection
   - plate where relevant

2. Football footwear
   - exact model identity
   - FG / AG / MG / TF / IN
   - corresponding playing surface
   - fit/width
   - upper/material claims where useful

3. Sports socks
   - size range
   - height
   - cushioning
   - moisture management
   - compression where explicitly stated

4. Activewear
   - activity/use
   - moisture management
   - breathability
   - thermal level
   - weather protection
   - reflective details

5. Fitness/team-sport equipment
   - exact sport/activity
   - surface/use where relevant
   - equipment-specific attributes remain in the general catalogue attribute model

## Recommendation safety rules

- Unknown is better than invented.
- No medical claims are derived from support/cushioning data.
- User foot pain, injury, pronation diagnosis or medical conditions are not inferred from product data.
- A model can be recommended because its documented properties match the user's stated preferences; that is not a medical prescription.
- Weak identity web matches remain `insufficient` and do not publish normalized facts.
- Conflicting high-confidence sources set the knowledge state to `conflict` until resolved.


## Verified pilot knowledge currently encoded

The pilot now contains exact manufacturer evidence for a small set of current Kerasiotis adidas products. This is intentionally a governed seed, not a claim that every sports product is fully enriched.

### Footwear

- Duramo RC2 `JQ8077`: running, road/track, daily training, reference weight, heel-to-toe drop and heel/forefoot stack.
- Duramo RC2 `JS4435`: running, road/track, daily training, reference weight, heel-to-toe drop and heel/forefoot stack.
- Terrex Skychaser AX5 `JQ2217`: hiking, trail/technical terrain, reference weight, heel-to-toe drop and heel/forefoot stack.
- Duramo SL 2 `JP9203`: manufacturer evidence exists, but the product code currently resolves to two canonical families. Both families are blocked from Sport & Fit enrichment until catalogue identity is reconciled.
- Duramo SL 2 `JQ0604`: running/training, reference weight, 8 mm drop and 31/23 mm heel/forefoot stack from the exact adidas product page.
- Duramo SL 2 `JP9217`: women’s running/training, reference weight normalized from the published 8.7 oz value, 8 mm drop, 31/23 mm stack and explicit true-to-size guidance.

The duplicate-family case is deliberate evidence that the knowledge layer fails closed: a high-quality external source does not override ambiguous internal identity.

### Socks

- Essentials CLIMACOOL Low Cut `JC6452`: low-cut height, gym/training context, explicit moisture-wicking claim and explicit arch support.
- Thin & Light Sportswear Ankle `JZ0528`: ankle height, gym/training context and explicit arch support.
- Think Linear Ankle `IC1306`: ankle height only where the manufacturer statement is unambiguous.

Marketing terms such as “cushioned”, “soft” or “stable” are not automatically converted to normalized cushioning/support levels unless the source provides a sufficiently clear classification.

## Size-guide knowledge

Schema version 306 adds a separate governed sizing layer:

- `sport_size_guides`
- `sport_size_guide_translations`
- `sport_size_guide_entries`
- `sport_size_guide_labels`

Schema 306 introduced the official adidas adult/unisex footwear heel-to-toe chart. Schema 309 adds the official adidas kids footwear chart. The database stores manufacturer measurement points and size-system labels rather than embedding conversions in UI code. The kids guide contains 36 heel-to-toe rows and 108 audience-scoped EU, UK and US labels.

The deterministic resolver follows these rules:

1. An exact heel-to-toe measurement returns the exact chart row.
2. A measurement between two rows returns both adjacent chart sizes instead of guessing.
3. Audience-specific guides take priority over a unisex guide. For example, a kids profile uses the kids chart when present; adult audiences may fall back to the unisex chart when no exact audience guide exists.
4. Within a selected guide, audience-specific labels, such as US Women, take priority over a unisex fallback for that size system.
5. Measurements outside the chart range return no automatic size.
6. A brand guide only affects products of that brand. An adidas result must not penalize another brand.
7. Product-specific fit adjustments remain separate evidence. A generic brand chart never proves that a particular model runs short, true-to-size or long.

The Sport & Fit Studio accepts optional foot length in centimetres. The server converts it to millimetres, resolves it against the stored guide and sends brand-scoped size hints into the recommendation engine. Manual EU size remains available and is used for brands without a resolved guide.


## Schema 307 enrichment

Migration `0307_sport_fit_verified_duramo_sl2_seed.sql` extends the exact-code manufacturer seed with current Kerasiotis Duramo SL 2 families `JQ0604` and `JP9217`. It deliberately leaves normalized cushioning/support level unknown: phrases such as “light, stable cushioning” remain source evidence until a governed brand-technology mapping can translate them without overstating the manufacturer claim.


## Schema 308–309 enrichment

Migration `0308_sport_fit_verified_kerasiotis_footwear_batch2.sql` adds a second exact-code adidas footwear batch:

- Duramo SL 2 `KJ4150`: running, road/track, short-to-mid-distance training and race-day use, true-to-size guidance, reference weight, drop and heel/forefoot stack.
- Duramo RC2 `KJ4189`: running, competition/short-distance use, true-to-size guidance, reference weight and drop.
- Duramo SL 2 `JS4403`: running/training, reference weight, drop and heel/forefoot stack.
- Adizero SL2 `IF6748`: kept in research/reconciliation state because current official adidas regional pages disagree on technical measurements and fit advice. No disputed value is normalized.

Migration `0309_sport_fit_adidas_kids_size_guide.sql` adds the official adidas kids footwear size chart as a separate `kids` audience guide. The server deterministically prefers an exact audience guide over a unisex fallback, which prevents the adult chart from becoming the primary measured-size source for a child profile.

The current runtime schema gate is 318. All migrations through 0317 have immutable checksum manifests.


## Live brand identity bridge

The Kerasiotis sports catalogue currently carries direct vendor-feed brand values even where the canonical family/variant brand relation has not yet been normalized. The Sport & Fit catalogue loader therefore resolves brand in this order:

1. governed catalogue metadata brand;
2. canonical family/variant brand;
3. latest non-empty vendor-feed `source_payload.brand` for the same canonical variant.

The third path is an identity fallback, not a technical-specification inference. It enables brand-scoped size guides to attach to the correct live products while the broader catalogue brand backfill is still incomplete. Technical Sport & Fit facts still require the normal evidence policy and strong exact-product identity.


## Schema 310 — Reebok sizing

Migration `0310_sport_fit_reebok_size_guide.sql` adds the official Reebok adult/unisex footwear heel-to-toe table:

- 21 manufacturer measurement rows;
- EU and UK unisex labels;
- US Men and US Women labels;
- JP labels;
- between-row resolution remains deterministic and returns both adjacent choices.

The candidates API no longer hard-codes adidas. It discovers active footwear size-guide brands from the governed database, intersects them with footwear brands present in the current catalogue, and resolves only those guides. Brand hints remain isolated per brand.

The live Kerasiotis Sport & Fit scope currently has vendor-feed brand identity for all 528 queried variants, while the same queried set has no normalized canonical brand relation yet. The vendor-feed identity fallback therefore remains necessary for the measured-size layer to reach the intended products.

Reebok's official kids chart is intentionally **not** mapped to EU stock sizes here because the currently verified US kids chart publishes heel-to-toe measurements with US labels but does not provide the EU conversion needed by the present storefront-size matching path. A kids profile never falls back to an adult/unisex guide when an exact kids guide is unavailable.


## Schema 311 — verified mixed-terrain footwear

Migration `0311_sport_fit_verified_kerasiotis_footwear_batch3.sql` extends exact-code adidas evidence for current Kerasiotis mixed-terrain footwear:

- Terrex Anylander `JR6599`: hiking, trail use, reference weight, 10 mm drop and 27/17 mm heel/forefoot stack.
- Terrex Anylander RAIN.RDY `JR9087`: hiking, trail use, explicit true-to-size guidance, water-resistant weather protection, reference weight, 10 mm drop and 27/17 mm stack.
- Ultrarun 5 TR `JQ6920`: running across road/trail surfaces, explicit true-to-size guidance, water-resistant upper, reference weight, 11 mm drop and 35/24 mm stack.

As with the earlier seeds, only exact manufacturer claims are normalized. The mixed-terrain facts can influence trail/mixed walking or running recommendations without turning general marketing language into unsupported technical values.


## Schema 312 — verified Reebok walking/work footwear

Migration `0312_sport_fit_verified_reebok_work_n_cushion.sql` adds exact manufacturer evidence for Kerasiotis Reebok Work N Cushion 4.0 `100001162`:

- the style resolves to exactly one canonical family before facts can publish;
- `walking` is normalized from Reebok's explicit walking/work positioning;
- a governed `all_day_standing` use case captures Reebok's long-shift / all-day-on-feet claim;
- generic support and cushioning wording remains source evidence only and is **not** converted into a normalized support/cushioning level.

This gives the walking guide manufacturer-backed knowledge for a current work/standing shoe while preserving unknown technical fields in the enrichment queue.


## Schema 313 — verified Skechers training footwear

Migration `0313_sport_fit_verified_skechers_bountiful.sql` adds exact official evidence for Skechers Bountiful `12606-BKRG`:

- the full style/color code is required because the shorter `12606` identifier spans multiple catalogue families/colorways;
- the exact `12606-BKRG` identity resolves to one canonical family;
- `general_training` is normalized from Skechers' explicit workout/training description;
- Memory Foam, supportive and shock-absorbing wording is preserved as evidence but does not create an invented cushioning or support level.

The runtime schema gate is now 319.


## Schema 314 — Skechers activity and taxonomy conflict handling

Migration `0314_sport_fit_skechers_training_and_taxonomy_conflicts.sql` adds three exact Skechers training identities and explicitly blocks three products whose official manufacturer classification conflicts with the current KONTA MOY running-shoe taxonomy.

Verified training identities:

- Bountiful `12606-TPE`;
- Bountiful `12606-BBK`;
- Skech-Air Dynamight 2.0 - New Heights `150370-BKRG`.

Blocked classification conflicts:

- BOBS Sport B Flex Hi - Flying Hi `117385-LIL`;
- BOBS Sport Squad Waves - Just Wading `117485-BBK`;
- BOBS Moda Flex - Mellow Dawn `117731-BBK`.

The conflict path deliberately fails closed: an exact official casual/fashion classification prevents the family from being recommended as running footwear until the catalogue taxonomy is reconciled.


## Schema 315 — Galaxy 8 and Response 2 running knowledge

Migration `0315_sport_fit_verified_kerasiotis_running_batch4.sql` extends exact-code manufacturer evidence for current Kerasiotis adidas running footwear:

- Galaxy 8 `IH9808`: running plus walking, daily-walking context, 326 g reference weight, 5 mm drop and 37/32 mm heel/forefoot stack.
- Response 2 Men `KJ1750`: running, road surface, easy-run and long-run use cases, 301 g reference weight, 8 mm drop and 32/24 mm heel/forefoot stack.
- Response 2 Women `KJ1757`: running plus exact manufacturer true-to-size guidance.

Cloudfoam / Cloudfoam+ comfort language is preserved in source evidence but is not converted into a normalized cushioning level. Generic support language likewise remains unnormalized unless adidas publishes an explicit governed level.

The live catalogue identity check resolves each of `IH9808`, `KJ1750` and `KJ1757` to exactly one canonical family before migration 0315 is allowed to publish facts.

The runtime schema gate is 319.


## Schema 316 — GSA vendor-feed sock knowledge

Migration `0316_sport_fit_gsa_vendor_feed_sock_facts.sql` promotes only direct claims from the connected Kerasiotis XML into governed GSA sock facts. Vendor-feed evidence remains lower tier than first-party manufacturer evidence.

Exact families covered:

- GSA `81-16073-01`: explicit invisible/no-show construction → `sock_height=no_show`.
- GSA `81-19103`: explicit daily exercise positioning indoors/outdoors → `sport_activity=general_training`.
- GSA `81-19109`: explicit low-cut performance training, GSA HYDRO dry-feel claim and high breathability → `general_training`, `sock_height=ankle`, `moisture_wicking=true`, `breathability_level=high`.
- GSA `81-1981-51` and `81-1981-52`: explicit thermal winter-sports construction and dry-feet/moisture claim → `thermal_level=thermal`, `moisture_wicking=true`.
- GSA `82-16143-01` and `82-16143-02`: direct keep-feet-dry claim → `moisture_wicking=true`.
- GSA `82-19109`: explicit athletic training and low-cut construction → `general_training`, `sock_height=ankle`.

The XML also contains marketing phrases such as “extra cushioned” and compression wording without a governed intensity. Those claims remain unnormalized evidence instead of being forced into `max`, `medium`, or another invented level.

Sport & Fit runtime knowledge now exposes sock breathability, thermal and compression fields in addition to height, cushioning, moisture-wicking and arch-support fields.

## Trusted live brand aliases

Kerasiotis currently supplies the misspelling `Sketchers` for Skechers products. Sport & Fit normalizes only this verified alias to `Skechers` for display/identity and to the `skechers` size-guide key. Other brand names are not rewritten by heuristic similarity.


## Schema 317 — verified adidas footwear batch 5

Migration `0317_sport_fit_verified_adidas_footwear_batch5.sql` extends exact manufacturer evidence for four current Kerasiotis adidas families:

- Eclyptix 2000 `JH6911`: adidas classifies the exact product as Sportswear with retro-running styling and everyday-comfort positioning. Sport & Fit removes the earlier broad taxonomy-derived running activity and keeps only explicit true-to-size guidance; retro styling is not treated as performance-running evidence.
- Response 2 Women `KJ1757`: running, road/trail use, daily and long-run use cases, neutral support, true-to-size guidance, 256 g reference weight, 8 mm drop and 31/23 mm heel/forefoot stack.
- Galaxy 7 Women `JP6592`: road running, short-to-mid-distance training, neutral support, true-to-size guidance, 278 g reference weight, 6 mm drop and 34/28 mm stack.
- Terrex Eastrail 3 `JR4007`: hiking, trail / uneven terrain, 337.6 g reference weight and 9 mm drop.

Schema 317 is another example of manufacturer evidence being allowed to **remove** an overly broad catalogue inference instead of only adding positive facts.


## Schema 318 — verified adidas sock and running-apparel facts

Migration `0318_sport_fit_verified_adidas_sock_apparel.sql` adds exact first-party adidas evidence for two current Kerasiotis families:

- Essentials CLIMACOOL Crew Socks 3 Pairs `JD9571`: Gym & Training activity, crew height, explicit CLIMACOOL sweat-wicking, and explicit arch support.
- adi365 Running Essentials Tank `KB5970`: running activity, explicit CLIMACOOL sweat-management evidence, and an explicit reflective Performance logo.

The migration intentionally does **not** map the generic word “cushioned” on `JD9571` to `sock_cushioning=light|medium|max`, and it does not invent a breathability level from CLIMACOOL marketing language. Those fields remain open until a governed manufacturer mapping or an exact level claim exists.

Both style codes were checked against the live Kerasiotis catalogue and resolve to exactly one active canonical family before the migration can publish facts.

The runtime schema gate is 319.


## Schema 319 — verified adidas football apparel

Migration `0319_sport_fit_verified_adidas_football_apparel.sql` adds exact first-party adidas evidence for three current Kerasiotis Squadra 25 Training Jacket families:

- `JE2774`: football activity, football-training use case and explicit AEROREADY moisture-management evidence.
- `JP3389`: football activity and football-training use case from the exact manufacturer product classification/title.
- `JV6067`: football activity and football-training use case from the exact manufacturer product classification/title.

The technology rule is deliberately colorway-specific. Moisture-wicking is normalized only for `JE2774`, whose exact adidas page publishes the AEROREADY moisture-management claim. The migration does not transfer AEROREADY, breathability, thermal or weather-protection claims to `JP3389` or `JV6067` merely because they share the Squadra 25 model name.

All three style codes must resolve to exactly one active canonical family before any fact is published.

The runtime schema gate is 319.


## Schema 320 — verified adidas Terrex Rockadia

Migration `0320_sport_fit_verified_adidas_rockadia.sql` adds exact-code first-party adidas evidence for two current Kerasiotis Rockadia families:

- `KJ0410`: hiking activity and explicit true-to-size guidance from the exact adidas product page.
- `KJ0411`: hiking and walking activity, trail and road/city-street use, daily-walking context, wide fit and explicit true-to-size guidance from the exact adidas product page.

The migration deliberately does **not** copy KJ0411's richer fit or terrain details to KJ0410 merely because both are Rockadia colorways. It also does not translate EVA cushioning wording into `cushioning_level`; normalized cushioning intensity remains unresolved until an exact governed claim or measurement supports it.

Both style codes were checked against the live catalogue and resolve to one active canonical family each before the migration was committed. The migration repeats that uniqueness check at execution time and fails closed if catalogue identity changes.

The runtime schema gate is 320.


## Schema 321 — direct Kerasiotis running activity

Migration `0321_sport_fit_kerasiotis_running_activity.sql` closes two current catalogue activity gaps without weakening the evidence model:

- `IH1838` (Runfalcon 6 ATR W): the connected Kerasiotis feed title explicitly states running use.
- `KJ4808` (Cloudfoam Flex-Laces): the connected Kerasiotis feed title explicitly states running use.

These are stored as direct vendor-feed evidence at lower confidence than an exact manufacturer product page. The migration intentionally does not convert `Cloudfoam` into a cushioning intensity and does not convert the `ATR` token into a surface/terrain classification. Those fields remain queued for exact manufacturer research.

Both MPNs were confirmed as active, approved, visible Kerasiotis catalogue identities before the migration was committed, and the migration requires each code to resolve to exactly one active canonical family.

The runtime schema gate is 321.


## Schema 322 — verified adidas Duramo RC2 KJ6635

Migration `0322_sport_fit_verified_adidas_duramo_rc2.sql` adds first-party adidas evidence for current Kerasiotis style `KJ6635`.

The exact manufacturer page supports:
- `sport_activity=running`
- `sport_surface=road`

The same page uses generic “cushioned”, “stable”, “support” and “regular fit” language. Those phrases are preserved in source evidence but are not converted into `cushioning_level`, `support_level` or `footwear_width_profile` without a controlled adidas-specific mapping.

The live catalogue was checked before commit and KJ6635 resolves to one active canonical family; the migration repeats that guard at execution time.

The runtime schema gate is 322.


## Activity and use-case expansion (schema 323)

Sport & Fit now treats these as first-class customer paths:

- Running
- Walking
- Gym / fitness
- Football
- Hiking / outdoor
- Basketball
- Tennis
- Padel
- Volleyball

The expansion adds governed activity values, court/outdoor surfaces, and use cases rather than treating the sports as generic catalogue filters. New surface vocabulary includes hard court, clay, indoor court, outdoor court, artificial court and sand/beach. New use cases include all-day standing, travel walking, functional/HIIT, day hike, technical hike, urban outdoor, and training-versus-match modes for basketball, tennis, padel and volleyball.

For the newly added sports, recommendation eligibility is evidence-gated. A product with governed activity facts must contain the specific requested sport. If governed activity facts are not yet available, only strong sport identity in the product title/category can admit the product. Descriptive lifestyle copy such as “basketball-inspired” is not sufficient by itself. This preserves the existing rule that externally researched facts only influence recommendations after exact product identity and evidence checks.

Ruleset version: `2026-10-02.2`.

Expansion vocabulary migration: `0323`. Current branch runtime schema gate: `324` after the subsequent exact Runfalcon 6 ATR enrichment (`0324`).


## Schema 323 — expanded activity and court vocabulary

Migration `0323_sport_fit_activity_use_case_expansion.sql` aligns the governed database vocabulary with the expanded deterministic Sport & Fit engine. It adds first-class hiking, basketball, tennis, padel and volleyball activity semantics, racket-sport grouping, court and sand surfaces, and controlled walking, gym-functional, hiking and court-sport use cases. This migration adds vocabulary only: product-level suitability still requires normal evidence/provenance before it can influence a recommendation.

## Schema 324 — adidas Runfalcon 6 ATR IH1838

Migration `0324_sport_fit_verified_adidas_runfalcon6atr.sql` upgrades current Kerasiotis style `IH1838` from lower-tier vendor-feed activity evidence to exact adidas manufacturer evidence. The exact product page supports running classification, true-to-size guidance, 254 g reference weight, 9 mm heel-to-toe drop, 36 mm heel stack and 26 mm forefoot stack.

Cloudfoam wording remains descriptive evidence and is not converted into a normalized cushioning or support level. Exact surface/use-case classification also remains open until first-party exact-code evidence supports it.

The runtime schema gate is now **324**.


## Schema 325 — handball and badminton governed vocabulary

Migration `0325_sport_fit_handball_badminton_vocabulary.sql` extends the controlled Sport & Fit vocabulary with first-class `handball` and `badminton` activities plus `handball_training`, `handball_match`, `badminton_training` and `badminton_match` use cases.

The migration is vocabulary-only. It does not assign either activity to any product family and does not weaken evidence/provenance requirements. Handball can use the existing governed `team_sports` broad class and badminton can use `racket_sports`; exact sport evidence remains more specific in recommendation ranking.

The runtime schema gate is now **325**.


## Schema 326 — verified adidas sock training and fit batch

Migration `0326_sport_fit_verified_adidas_sock_batch.sql` adds exact first-party adidas evidence for nine current Kerasiotis sock families. It supersedes the earlier unmerged sock-only schema-325 proposal after schema 325 was assigned to the handball/badminton vocabulary expansion.

Governed facts added:
- `JZ0529`: `sport_activity=gym_training`, explicit arch support; manufacturer “mid-cut” remains unmapped because there is no exact controlled `mid_cut` value.
- `KC9613`: gym training, ankle height, arch support.
- `KC9614`: gym training, ankle height, arch support.
- `KC9628`: low-cut height, arch support; no sport activity inferred from its everyday/casual positioning.
- `JD9568`: gym training, quarter height, CLIMACOOL moisture-wicking, arch support.
- `JC6453`: gym training, quarter height, CLIMACOOL moisture-wicking, arch support.
- `IC1303`: gym training and ankle height.
- `IC1294`: quarter height only; day-to-day positioning is not promoted to a sport activity.
- `IC1299`: low-cut height only; everyday sneaker positioning is not promoted to a sport activity.

Generic “cushioned”, “thin/light” and descriptive breathability wording remains evidence text only. It is not converted into `sock_cushioning`, `compression_level`, `thermal_level` or `breathability_level` without an exact controlled claim or governed manufacturer mapping.

Additional exact-code coverage in the same migration includes:
- `KQ6773`: crew height and fitted arch support only. Adidas regional pages disagree between Gym & Training and Lifestyle classification, so activity is intentionally left unknown.
- `KQ9439`: gym training, crew height and fitted arch support.
- `KQ9227`: ankle height and arch support only; active-kid/daily wording is not promoted to a governed sport.
- `KQ9229`: crew height and arch support only; customer-review activity claims are ignored.
- `KX1277`: gym training and crew height from manufacturer workout-ready positioning.

The migration verifies that all fourteen product codes resolve to exactly one active canonical family before publishing facts and includes post-write assertions for eight gym-training facts, thirteen controlled height facts, ten arch-support facts and two moisture-management facts.

The runtime schema gate is now **326**.

## Schema 327 — second verified adidas sock batch and canonical identity bridge

Migration `0327_sport_fit_verified_adidas_sock_batch2.sql` adds exact first-party adidas evidence for thirteen additional current Kerasiotis sock families. Where `canonical_variants.mpn` is not yet populated, identity bridges through an exact hyphen-bounded adidas style-code token already present in `canonical_variants.slug`, and only when that code resolves to exactly one active canonical family. This avoids scanning the much larger vendor-feed table during migration.

Governed facts added:
- `IC1301`: gym training + crew height.
- `IC1302`: gym training + crew height.
- `JF8541`: gym training + ankle height.
- `JF8542`: gym training + ankle height.
- `JW9794`: gym training + crew height; anti-slip remains evidence only because no governed anti-slip attribute exists yet.
- `HT3451`: ankle height only.
- `JX1095`: explicit moisture-wicking only; Terrex naming alone is not promoted to a sport activity.
- `KC9617`: gym training + explicit arch support; manufacturer mid-cut wording remains unmapped.
- `KC9639`: crew height + arch support.
- `KE5503`: crew height + arch support.
- `KR2352`: crew height only; Minecraft/lifestyle wording is not promoted to a sport activity.
- `KR4903`: exact `sock_cushioning=none` only. Official adidas regional pages conflict on height and category placement, so height and sport activity remain intentionally unknown.
- `KD1727`: explicit arch support only; mid-height and generic cushioning wording remain ungraded.

The batch preserves the fail-closed rule for identity and keeps generic “cushioned”, “soft”, “light/thin”, lifestyle positioning and conflicting regional merchandising out of governed technical fields.

The runtime schema gate is now **327**.

## Schema 328 — adidas footwear identity reconciliation

Migration `0328_sport_fit_adidas_footwear_reconciliation.sql` combines exact first-party adidas enrichment with catalogue-identity correction for three current Kerasiotis footwear families.

- `JP9203` (Duramo SL 2): the historical duplicate-canonical-family blocker is cleared only after the exact manufacturer code resolves to one active canonical family. Governed facts are running, road + track, short-to-mid-distance training, race-day context, neutral support, true-to-size guidance, 291 g reference weight, 9 mm drop and 33/24 mm heel/forefoot stack.
- `KJ9916` (Ultimashow 2.0): exact adidas classification is Sportswear with explicit workout positioning. The earlier KONTA MOY running fact came only from the broad running-shoe taxonomy, so that taxonomy evidence is removed and replaced with `sport_activity=general_training` plus explicit true-to-size guidance.
- `KJ7282` (Cloudfoam Flex Laces): exact adidas classification is Sportswear with explicit daily-walking positioning. The taxonomy-only running evidence is removed and replaced with `sport_activity=walking`, `sport_use_case=daily_walking` and explicit true-to-size guidance.

The correction is deliberately evidence-scoped. It removes only `kontamou_catalog_taxonomy` / `taxonomy_mapping` running evidence for the two exact products whose manufacturer classification is more specific. It does not create negative activity facts, and it does not translate Cloudfoam, LIGHTMOTION, generic stability, arch-reinforcement or comfort wording into governed cushioning/support intensity.

The migration was executed against the live KONTA MOY schema inside a transaction ending in `ROLLBACK`. Exact-code uniqueness guards, historical JP9203 unblock logic, taxonomy-evidence replacement, knowledge refresh and post-write assertions all passed without persisting production changes.

The runtime schema gate is now **328**.

## Schema 329 — lifestyle exclusion classification and Rockadia hiking enrichment

Migration \`0329_sport_fit_lifestyle_hiking_reconciliation.sql\` adds a governed non-sport activity classification and one additional exact-code adidas hiking family.

- Ultimashow 2.0 \`IE8898\`: the previous conflict represented an exact adidas lifestyle/errands statement against a broad KONTA MOY running-shoe taxonomy fact. Schema 329 removes the taxonomy-only running fact and the temporary conflict evidence, adds \`sport_activity=casual_lifestyle\`, and preserves explicit true-to-size guidance. \`casual_lifestyle\` is marked non-selectable for Sport & Fit; it exists so a known manufacturer use can produce a deterministic activity mismatch instead of allowing title/category heuristics to reintroduce the product as performance running footwear.
- Terrex Rockadia \`KZ9174\`: exact adidas evidence adds \`sport_activity=hiking\` and \`fit_length_profile=true_to_size\`. Surface, hiking use-case, cushioning, support, geometry, width and weather protection remain unknown until exact evidence is available.

The new \`casual_lifestyle\` activity value is evidence infrastructure, not a new Studio sport. It is intentionally outside the user-selectable activity set. This lets the recommendation rules distinguish “unknown sport use” from “manufacturer-documented non-sport/lifestyle use” without inventing walking or running suitability.

As with the preceding batches, Cloudfoam and generic comfort wording are retained only in provenance and are not mapped to cushioning/support intensity.

Schema 329 was executed against the live KONTA MOY schema inside a transaction ending in \`ROLLBACK\`. Exact-code uniqueness guards, IE8898 conflict replacement, KZ9174 enrichment, knowledge refresh and post-write assertions all passed, and a post-rehearsal read confirmed that no schema-329 rows were persisted.

The runtime schema gate is now **329**.


## Schema 330 — Skechers lifestyle reconciliation

Migration `0330_sport_fit_skechers_lifestyle_reconciliation.sql` resolves the three highest-priority remaining Kerasiotis footwear classification blockers created by schema 314. Each exact Skechers base style code resolves to one active canonical family before any fact is changed.

- `117385` (BOBS Sport B Flex Hi - Flying Hi): exact Skechers classification is casual/fashion rather than performance running.
- `117485` (BOBS Sport Squad Waves - Just Wading): exact Skechers classification is casual/fashion rather than performance running.
- `117731` (BOBS Moda Flex - Mellow Dawn): exact Skechers description identifies the product as a casual design rather than performance running footwear.

For each family, schema 330 removes only the temporary schema-314 manufacturer conflict row and the broad `kontamou_catalog_taxonomy` running evidence, removes the normalized `running` activity, and replaces it with the schema-329 governed `sport_activity=casual_lifestyle` value. The queue is then marked complete as a non-sport exclusion classification, so the Studio treats these families as deterministic activity mismatches instead of repeatedly requesting performance-running specifications.

The migration fails closed if a style resolves to zero or multiple active canonical families, or if any unexpected third source has active `sport_activity` evidence. Memory Foam, comfort, flexibility and traction wording remain provenance only; no cushioning, support, drop, stack, width, toe-box or weather-protection fact is inferred from those claims.

Schema 330 was executed against the live KONTA MOY schema inside a transaction ending in `ROLLBACK`, with a temporary schema-329 prerequisite value created inside that same transaction because production has not yet applied schema 329. Identity guards, evidence-source guards, activity replacement, knowledge refresh, queue completion and post-write assertions passed. A post-rehearsal read confirmed that `casual_lifestyle` and all schema-330 changes were rolled back and the three live queue rows remain blocked until the migration chain is deployed.

The runtime schema gate is now **330**.


## Schema 331 — Adizero SL2 stable-fact reconciliation

Migration `0331_sport_fit_adizero_sl2_safe_reconciliation.sql` revisits exact adidas style `IF6748` (Adizero SL2) after schema 317 deliberately left the family without normalized facts because official adidas regional pages disagree on fit advice and technical measurements.

The migration separates stable facts from disputed ones:
- `sport_activity=running` is explicit on official adidas Australia, Egypt and Brazil product pages.
- The Brazil product page explicitly positions IF6748 for fast training and competitions, mapped to `sport_use_case=speed_training` and `sport_use_case=race_day`.
- Fit remains unknown. Australia and Brazil recommend the usual size, while Egypt advises ordering at least one size larger.
- Weight/drop/stack remain unknown at the governed family level. Australia/Egypt report 238 g, 9.5 mm drop and 36.9/27.4 mm heel/forefoot stack for UK 8.5, while Brazil reports a different measurement set/reference size.
- Lightstrike Pro is retained as manufacturer provenance but is not converted into a governed cushioning intensity.

Schema 331 fails closed if IF6748 does not resolve to exactly one active canonical family or if any disputed fit/geometry field has already been normalized before the migration. It lowers the enrichment priority from the manual-reconciliation blocker level only after publishing the stable running/use-case facts; disputed fields remain explicitly requested with `normalizeDisputedFields=false`.

Schema 331 was executed against the live KONTA MOY schema inside a transaction ending in `ROLLBACK`. Exact identity, disputed-field guards, fact insertion, knowledge refresh, queue reprioritization and post-write assertions passed. A post-rehearsal read confirmed the production queue remained at its pre-migration priority/state because no test changes were persisted.

The runtime schema gate is now **331**.


## Schema 332 — handball and badminton vocabulary

Migration `0332_sport_fit_handball_badminton_vocabulary.sql` extends the controlled Sport & Fit vocabulary without assigning product-level suitability.

- `sport_activity=handball` and `sport_activity=badminton` are first-class controlled activities.
- Handball receives `handball_training` and `handball_match` use cases.
- Badminton receives `badminton_training` and `badminton_match` use cases.
- Product-level facts still require the normal governed evidence/provenance workflow; the vocabulary migration alone cannot make a product recommendable for either sport.

The runtime schema gate is now **332**.

## Schema 333 — direct Kerasiotis feed refinements

Migration `0333_sport_fit_direct_kerasiotis_refinements.sql` strengthens four exact live canonical families using literal claims from the connected Kerasiotis XML feed.

- `JR9720` Terrex Anylander J: exact feed title/description adds `sport_activity=hiking`. Traxion and generic uneven-surface wording remain provenance only; no specific trail surface is inferred.
- `KK4280` Response 2 M: exact feed title/description confirms `sport_activity=running` and explicitly states asphalt use, normalized as `sport_surface=road`. Cloudfoam+ and generic support wording do not create cushioning/support levels.
- `KQ9728` Essentials Climacool: direct feed wording confirms `sport_activity=general_training` and `moisture_wicking=true`.
- `KR2147` Essentials Climacool: direct feed wording confirms `sport_activity=general_training` and `moisture_wicking=true`.

Existing catalogue-taxonomy evidence is preserved. Schema 333 adds direct vendor-feed provenance and strengthens the normalized fact source/confidence where the value is the same. It fails closed if any target code does not resolve to exactly one active canonical family or if an unexpected normalized value is already present.

Generic technology and marketing wording remains conservative: Cloudfoam is not converted into cushioning/support intensity, Traxion is not converted into a specific surface without an explicit surface claim, and generic ventilation wording is not converted into a breathability level.

The migration was rehearsed against the live KONTA MOY catalogue inside a transaction ending in `ROLLBACK`. Identity guards, expected-state guards, evidence/fact writes, knowledge refresh, queue updates and post-write assertions passed. A post-rehearsal read confirmed that no schema-333 source or normalized fact persisted.

The runtime schema gate is now **333**.


## Schema 334 — conflict-aware direct evidence

Migration `0334_sport_fit_conflict_aware_direct_evidence.sql` extends the governed knowledge layer with missing exact facts while preserving source disagreements instead of flattening them.

- `KJ0410` Terrex Rockadia M keeps its existing exact manufacturer-backed hiking and size guidance. Literal Kerasiotis feed claims add walking, trail + city-road coverage, daily walking and a wide fit. EVA/cushioning language remains ungraded.
- `JQ6920` Ultrarun 5 TR gains `reflective_details=true` from the existing exact adidas manufacturer source. Bounce remains descriptive provenance and does not become a cushioning intensity.
- `JR9087` Terrex Anylander R.RDY remains normalized to the current first-party adidas measurements (390 g at UK 8.5, 10 mm drop, 27/17 mm stack and conservative `water_resistant`). The connected Kerasiotis feed publishes a different reference set (330 g at EUR 38 2/3, 9 mm, 26/17 mm and waterproof wording). Schema 334 retains those direct-feed claims as active evidence, refreshes the family into a conflict state and blocks automatic reconciliation; it does **not** overwrite the stronger manufacturer normalization.

This makes an important provenance rule explicit: differing source/reference-size measurements remain independently auditable. A lower-tier source cannot silently replace a first-party normalized fact, and a real cross-source disagreement is surfaced for review rather than converted into false certainty.

Schemas 333 and 334 were rehearsed together against the live KONTA MOY catalogue inside one transaction ending in `ROLLBACK`. The first rehearsal exposed that `reflective_details` was governed globally but not yet allowed on the `running_shoe` Product Type; schema 334 now extends that contract explicitly. The second rehearsal passed all identity, Product Type, evidence, conflict-refresh and post-write assertions. A post-rehearsal read confirmed that no source, Product Type mapping, normalized fact or conflict state persisted.

The runtime schema gate is now **334**.


## Schema 335 — verified adidas basketball apparel JN4724

Migration `0335_sport_fit_verified_adidas_basketball_jn4724.sql` onboards the first exact live basketball apparel family into the governed Sport & Fit product knowledge layer.

- `JN4724` adidas Basketball All-World Sleeveless Tank Top resolves to one current canonical family through its exact product-code token.
- The exact adidas product page supplies `sport_activity=basketball`.
- adidas explicitly describes AEROREADY as moisture-managing and keeping the wearer dry during play, normalized as `moisture_wicking=true`.
- The family is newly inserted into `sport_product_knowledge` with role `apparel` and strong identity, then refreshed through the normal completeness/evidence rules.
- Breathability and thermal intensity remain unknown; AEROREADY is not promoted into either field.
- Customer-review claims are excluded from evidence.

This turns the basketball vocabulary into real product-level recommendation evidence rather than leaving it as taxonomy-only capability.

The runtime schema gate is now **335**.


## Schema 336 — verified adidas football apparel

Migration `0336_sport_fit_verified_adidas_football_apparel.sql` onboards two live Entrada26 families that existed in the canonical catalogue but were absent from the governed Sport & Fit layer.

- `JZ2505` Entrada26 Jersey: exact adidas evidence adds `sport_activity=football`, `football_training`, `football_match` and `moisture_wicking=true`.
- `KE9848` Entrada26 Training Pants: exact adidas evidence adds `sport_activity=football`, `football_training` and `moisture_wicking=true`.
- Both families are inserted into `sport_product_knowledge` as strong-identity apparel and queued only for unresolved performance fields.
- CLIMACOOL sweat-management wording supports moisture management only. It does not create a breathability or thermal intensity.
- Customer-review claims are excluded.

Schemas 333 through 336 were rehearsed together against the live KONTA MOY catalogue inside one transaction ending in `ROLLBACK`. All identity, Product Type, normalized-fact, evidence, conflict, queue and post-write assertions passed, and post-rollback reads confirmed that no schema-336 sources/knowledge/queue rows persisted.

The runtime schema gate is now **336**.

## Schema 337 — exact mid-cut sock-height vocabulary

Migration `0337_sport_fit_mid_cut_sock_height.sql` resolves a deliberate vocabulary gap left by schemas 326–327.

- The controlled `sock_height` vocabulary now includes `mid_cut` between quarter and crew instead of forcing manufacturer “mid-cut” wording into a nearby but non-equivalent height.
- adidas `JZ0529` and `KC9617` now receive `sock_height=mid_cut` from their already-verified exact manufacturer sources.
- Their existing gym-training / arch-support evidence is preserved; schema 337 adds only the missing height fact.
- Generic “cushioned” wording still does not create a governed cushioning intensity, and no compression, breathability or thermal level is inferred.
- The enrichment queue removes `sock_height` from these two exact families while retaining unresolved performance fields.
- Source metadata records that the former “do not map mid-cut without a controlled rule” guard has been resolved by the explicit `mid_cut` value.

Schema 337 was rehearsed against the live KONTA MOY database inside a transaction ending in `ROLLBACK`. Identity guards, vocabulary registration, normalized facts, evidence writes, queue cleanup and no-extra-inference assertions all passed. A post-rollback read confirmed that no `mid_cut` value persisted.

The runtime schema gate is now **337**.

## Schema 338 — verified adidas apparel batch 2

Migration `0338_sport_fit_verified_adidas_apparel_batch2.sql` extends the governed apparel knowledge layer with three current Kerasiotis adidas families whose exact style-code identities resolve to one active canonical family each.

- `HF6619` Training Essentials 7/8 Leggings (Maternity): the exact adidas page classifies the product as workout/training apparel, normalized as `sport_activity=general_training`. The connected Kerasiotis feed independently and explicitly states AEROREADY moisture absorption, normalized as `moisture_wicking=true` at vendor-feed confidence.
- `IA1808` Terrex Trail Running Wind Jacket: exact adidas evidence adds `sport_activity=running`, `sport_surface=trail`, and both `weather_protection=water_resistant` and `wind_resistant`. DWR/light-rain wording is deliberately not upgraded to waterproof.
- `IJ5427` Own the Run Allover Print Running Windbreaker: exact adidas evidence adds `sport_activity=running`, `weather_protection=water_resistant`, `wind_resistant`, and `reflective_details=true`.

All three families are newly onboarded into `sport_product_knowledge` as strong-identity apparel and remain partial while unresolved fields stay queued. Customer reviews are excluded. No breathability, thermal or compression intensity is inferred from generic marketing language, and water repellency never becomes a waterproof claim.

Schema 338 was rehearsed against the live KONTA MOY catalogue inside a transaction ending in `ROLLBACK`. Exact-family identity, approved Kerasiotis bridge, Product Type contract, normalized fact/evidence, refresh, queue and forbidden-inference assertions all passed. A post-rollback read confirmed zero schema-338 sources or knowledge rows persisted, while production remained at schema 332.

The runtime schema gate is now **338**.


## Schema 339 — exact adidas football taxonomy correction

Migration `0339_sport_fit_verified_adidas_football_taxonomy_correction.sql` resolves a source-precedence problem in four live Squadra/Entrada apparel families.

- `JV6067` Squadra 25 Training Jacket keeps its already-normalized `sport_activity=football` and `football_training` facts, gains manufacturer-backed `moisture_wicking=true`, and has the older broad `general_training` catalogue-taxonomy evidence marked inactive/superseded.
- `JD2978` Squadra 25 Training Jacket is corrected from broad `general_training` to exact `football`, gains `football_training`, and gains `moisture_wicking=true`.
- `H57525` Entrada 22 Track Jacket is corrected from broad `general_training` to exact women’s football/soccer classification. Moisture and use-case fields remain unresolved rather than inferred.
- `HI2135` Entrada 22 Training Jacket is corrected from broad `general_training` to exact `football`, gains `football_training`, and gains `moisture_wicking=true`.

The older KONTA MOY taxonomy evidence is not deleted: schema 339 preserves it for audit, links it to the first-party replacement through `superseded_by`, and deactivates it so the refresh engine no longer treats the broad classification as a live conflict. AEROREADY wording is used only where the exact adidas page explicitly describes moisture management; it is not promoted into breathability or thermal intensity.

Schema 339 was rehearsed against the live KONTA MOY catalogue inside a transaction ending in `ROLLBACK`. Exact identity, governed apparel state, normalization, evidence supersession, knowledge refresh, queue updates and forbidden-inference assertions passed. A post-rehearsal read confirmed no new source persisted and the four legacy taxonomy activity rows remained active in production.

The runtime schema gate is now **339**.
