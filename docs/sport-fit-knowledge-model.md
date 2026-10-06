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
- named footwear technology (for example Cloudfoam / Cloudfoam+)
- manufacturer fit profile (for example Regular fit)
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

When an exact, approved source product contradicts itself, prefer the more specific direct claim only when identity is strong and the contradiction can be preserved explicitly. A broad SEO/title/category label must not override a detailed exact-product description that directly states the intended activity or fit. Superseded evidence remains in the audit trail rather than being deleted.

### Tier 2 — exact manufacturer product page

Preferred source for:

- intended activity
- intended surface
- official product weight
- stated heel-to-toe drop
- stated cushioning/support classification
- named manufacturer technologies and the component they are applied to
- explicit manufacturer fit labels such as Regular fit
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

Descriptive adjectives such as “cushioned”, “soft” or “stable” are not automatically converted to normalized cushioning/support levels unless the source provides a sufficiently clear classification. Named manufacturer technologies are different: a source that explicitly identifies Cloudfoam, Cloudfoam+ or another technical system may support a structured technology fact even when cushioning/support intensity remains unknown.

## Technology and fit semantics

Named manufacturer technologies are first-class technical knowledge. The database stores the technology identity separately from any performance grade.

- `footwear_technology=cloudfoam` means the exact product is documented as using adidas Cloudfoam technology.
- `footwear_technology=cloudfoam_plus` preserves the specific Cloudfoam+ variant rather than collapsing it to generic Cloudfoam.
- `footwear_technology=cloudfoam_comfort` preserves Cloudfoam Comfort where the manufacturer identifies that system, including sockliner applications.
- A Cloudfoam fact may support an explanation that the model uses that technology, but it does not automatically create `cushioning_level=high`, `support_level=...` or another graded fact unless separate evidence supports the grade.
- Technology component/location belongs in evidence and value metadata when known (for example midsole or sockliner).

Manufacturer fit wording is also preserved without conflating different fit dimensions.

- Explicit `Regular fit` is normalized as `footwear_fit_profile=regular`.
- `footwear_fit_profile` is separate from `footwear_width_profile`; Regular fit is not automatically rewritten as standard width.
- `footwear_fit_profile` is separate from `fit_length_profile`; Regular fit is not a substitute for true-to-size/short/long sizing advice.
- When a manufacturer separately publishes Regular fit, Wide fit and/or true-to-size guidance, those facts may coexist because they describe different aspects of fit.

Schema 417 applies this policy to current exact adidas families with first-party evidence, while regression guards require cushioning, support, width and length facts to remain unchanged by the technology/fit backfill.

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

## Schema 391 — hiking knowledge deepening and queue hygiene

Migration `0391_sport_fit_hiking_knowledge_deepening.sql` continues the governed Sport & Fit knowledge layer after the production-wide schema sequence reached 390.

- Terrex Eastrail 3 `JR4007`: exact adidas manufacturer evidence adds `fit_length_profile=true_to_size` and `sport_use_case=technical_hike`. The technical-hike normalization is grounded in the exact manufacturer description of mountain-trail use with traction/stability on steep, uneven terrain. Existing hiking, trail, weight and drop facts remain intact.
- Terrex Rockadia `KZ9174`: exact adidas identity and true-to-size guidance remain the highest-tier facts. Exact-code secondary references add walking, trail + road use, daily walking, wide fit and a 320.4 g reference weight at deliberately lower confidence. No cushioning/support intensity or weather-protection claim is inferred.
- Hiking enrichment queue: non-blocked hiking footwear no longer re-requests facts already normalized on the family, and `football_surface_code` is removed from hiking-only families. Conflict/blocked rows are left untouched so a known disagreement can still be researched deliberately.

The migration is vendor-independent at the fact layer: all normalized technical facts remain attached to canonical families, while sellability and stock stay in vendor offers.

The exact committed schema-391 migration was first replayed against production inside a transaction ending in `ROLLBACK`; identity guards, fact/evidence inserts, knowledge refresh, queue cleanup and post-write assertions passed without persisting test rows. After merge, the same governed migration was applied to production together with app migration-ledger version 391 and re-verified against the live knowledge tables.

The global runtime schema gate and production database are now **391**.

## Schema 392 — sellable Duramo RC2 fit and race-use deepening

Migration `0392_sport_fit_duramo_rc2_evidence_deepening.sql` deepens three currently sellable adidas Duramo RC2 canonical families using exact-code first-party manufacturer pages.

- `JS4435`: adds `fit_length_profile=true_to_size`, `support_level=neutral` from the explicit manufacturer pronation classification, and `sport_use_case=race_day` from the explicit “Best for Racing” classification. Existing running, daily-training, road + track, weight and stack/drop facts are preserved.
- `JQ8077`: adds the same governed fit, neutral-pronation and race-day facts while preserving existing running, daily-training, road + track, weight and geometry evidence.
- `KJ6635`: adds only `fit_length_profile=true_to_size`. The manufacturer also uses stable/cushioned/Lightmotion language, but schema 392 deliberately does not convert those statements into a governed cushioning or support intensity.

The migration adds three new regional first-party evidence sources and seven normalized fact/evidence pairs. It also prunes already-satisfied requested fields from the three targeted enrichment-queue rows and removes the football-only surface-code request from this running-footwear batch.

Identity remains family-level and vendor-independent. The migration fails closed unless each exact style code resolves to exactly one active canonical family, verifies the expected pre-existing running/surface/use-case baselines before adding anything, and asserts that KJ6635 did not acquire unsupported cushioning/support/width facts.

The exact migration was first replayed against production schema 391 inside a transaction ending in `ROLLBACK`; all identity guards, seven fact inserts, seven evidence inserts, knowledge refreshes, queue-pruning checks and unsupported-inference assertions passed without persisting rehearsal rows. After PR #1261 merged, that same committed migration was applied to production and recorded in `schema_migrations` as version 392 with its immutable SHA-256 checksum. Live read-back confirmed all seven normalized facts and all seven targeted manufacturer evidence rows, zero conflicts on the three enriched families, and queue pruning down to unresolved fields only.

The global runtime schema gate and production database are now **392**.


## Schema 393 — conflict-aware direct evidence and weather reconciliation

Migration `0393_sport_fit_conflict_aware_direct_evidence.sql` deepens three exact, currently governed adidas footwear families while preserving provenance and refusing to flatten source disagreements.

- Terrex Rockadia `KJ0410`: direct approved Kerasiotis source evidence adds walking, trail + road/city use, daily-walking context and wide fit alongside the existing exact adidas hiking and true-to-size facts. EVA/comfort language remains ungraded, and the non-football queue no longer requests `football_surface_code`.
- Ultrarun 5 TR `JQ6920`: exact adidas manufacturer evidence adds `reflective_details=true`; the existing global reflective attribute is exposed on the `running_shoe` Product Type contract without inventing a reflectivity intensity.
- Terrex Anylander RAIN.RDY `JR9087`: the exact adidas page explicitly classifies the shoe as waterproof, so the earlier conservative `water_resistant` normalization is superseded by `weather_protection=waterproof` with an evidence link. The connected Kerasiotis feed corroborates waterproof use and the 17 mm forefoot stack, but disagrees on reference-size-dependent weight, drop and heel stack. Those three disagreements remain active evidence conflicts; the manufacturer-normalized 390 g / 10 mm / 27 mm values are retained and the queue is blocked for explicit source/reference-size reconciliation rather than averaged.

All three identities are required to resolve to exactly one active canonical family. The migration keeps technical facts at family level, leaves vendor sellability/stock untouched, and refreshes the existing Sport & Fit knowledge state after evidence changes.

The exact schema-393 migration was replayed against live production schema 392 inside a transaction ending in `ROLLBACK`. Identity/source guards, KJ0410 facts, JQ6920 reflective evidence, JR9087 weather supersession, evidence-conflict counting, queue cleanup and post-write assertions passed. The rehearsal produced exactly three JR9087 active conflicts and left only weight/drop/heel-stack in its blocked reconciliation queue.

Schema 393 was merged as PR #1264 and applied to production with its immutable checksum. Live read-back confirmed `weather_protection=waterproof` for JR9087, exactly three active measurement conflicts, and the blocked reconciliation queue limited to weight/drop/heel-stack. The global runtime schema gate and production database are now **393**.

## Schema 394 — sellable-footwear enrichment queue reconciliation

Migration `0394_sport_fit_sellable_queue_reconciliation.sql` fixes stale enrichment requests discovered during schema-393 production verification without changing any technical fact.

- Duramo SL 2 `JP9203`: already-governed running, surface, use-case, neutral-support, geometry, weight and true-to-size fields are removed from the research queue. Remaining work is restricted to cushioning, width, toe-box, plate and weather protection.
- Ultrarun 5 TR `JQ6920`: already-governed running, mixed-surface, geometry, weight, fit and weather fields are removed from the queue after the schema-393 reflective enrichment. Remaining work is restricted to use-case, cushioning, support, width, toe-box and plate.
- `football_surface_code` is removed from both exact governed running-shoe queues.

The migration fails closed unless both style codes still resolve to exactly one active canonical family, both retain governed running identity, and neither queue is blocked. It derives remaining requests from normalized family facts instead of maintaining a duplicate manual list.

The exact schema-394 migration was replayed against live production schema 393 inside a transaction ending in `ROLLBACK`; both target queues reduced to the expected unresolved field sets and no technical fact/evidence row changed.

Schema 394 was merged as PR #1265 and applied to production with checksum `a8d287357d40148a9df4de72e56a74d36230c956c276e732772260589471d233`. Live read-back confirmed JP9203 now requests only five genuinely unresolved fields and JQ6920 only six, with no already-normalized or football-only request remaining. The global runtime schema gate and production database are now **394**.


## Schema 395 — recover stranded sellable Sport & Fit knowledge

Migration `0395_sport_fit_stranded_sellable_refinements.sql` ports the still-unapplied four-family direct-evidence batch from the superseded schema-392 branch onto the current production baseline after schemas 392–394 were independently occupied.

- Terrex Anylander J `JR9720`: exact connected Kerasiotis feed evidence adds `sport_activity=hiking`. Traxion/uneven-surface wording remains source context and is not promoted to a governed trail-surface fact.
- Response 2 M `KK4280`: exact connected Kerasiotis feed evidence adds `sport_activity=running` and `sport_surface=road` from explicit running/asphalt wording. Cloudfoam+ language is not converted into cushioning or support intensity.
- Essentials Climacool `KQ9728` and `KR2147`: exact connected-feed evidence adds `sport_activity=general_training` and `moisture_wicking=true` from explicit training plus sweat/moisture-removal wording. Ventilation language is deliberately not graded into `breathability_level`.

All four families were still sellable and still queued for initial Sport & Fit backfill on production schema 394. The migration retains vendor-feed evidence at its existing lower evidence tier, fails closed on exact family identity, refreshes the canonical-family knowledge projection, removes only facts that are now genuinely resolved from the queue, and forbids unsupported cushioning/support/breathability/surface inference.

## Schema 396 — exact adidas Response 2 KK4280 deepening

Migration `0396_sport_fit_verified_adidas_response2_kk4280.sql` adds first-party adidas evidence to the same sellable `KK4280` canonical family after schema 395 establishes its running/road baseline.

The exact adidas Mexico product source adds `sport_use_case=long_run`, `fit_length_profile=true_to_size`, `heel_to_toe_drop_mm=8`, `heel_stack_height_mm=32`, `forefoot_stack_height_mm=24`, and `shoe_weight_g=301`. Classic-fit and Cloudfoam+ wording remain non-authoritative for governed width/cushioning intensity.

Schema 396 intentionally keeps cushioning level, support level, width profile, toe-box profile, plate type and weather protection unknown until direct evidence exists. Technical facts remain canonical-family knowledge; live size/stock remains vendor-offer/inventory state.


The exact committed schemas 395 and 396 were replayed together against live production schema 394 inside one transaction ending in `ROLLBACK`. All family-identity, baseline, fact/evidence, unsupported-inference, knowledge-refresh and enrichment-queue assertions passed. Post-rehearsal verification confirmed the rehearsal introduced no persistent source/fact rows. Schemas 395 and 396 were merged as PR #1268 and applied atomically to production with their immutable SHA-256 checksums. Live read-back confirmed the expected four-family fact/evidence state, zero conflicts, and production migration-ledger versions 395–396.


## Schema 397 — post-enrichment queue hygiene

Migration `0397_sport_fit_post_enrichment_queue_hygiene.sql` fixes a live queue-regression discovered immediately after the schema-396 read-back. The four enriched families still requested fields that were already normalized, which would waste research capacity and risk duplicate/conflicting future evidence.

- `JR9720`: removes already-governed `sport_activity` and the non-applicable `football_surface_code`.
- `KK4280`: removes already-governed `sport_activity`, `sport_surface`, `sport_use_case`, fit and geometry/weight requests, plus `football_surface_code`.
- `KQ9728` and `KR2147`: remove already-governed `sport_activity` and `moisture_wicking`.

The migration derives the remaining queue directly from normalized family facts, changes no technical fact/evidence, and fails closed if any target identity, governed baseline or expected unresolved field set has drifted.

Schema 397 was merged as PR #1270 and applied to production with checksum `a7a3ca6d479ea6185247fd7d88fe6d16c3d4297d2b9fa17c1c932dec39c9a374`. Live read-back confirmed the four queues now contain only unresolved fields: zero already-normalized requests and zero non-applicable `football_surface_code` requests. The global runtime schema gate and production database are now **397**.


The exact schema-397 migration was replayed against live production schema 396 inside a transaction ending in `ROLLBACK`. It removed all seven already-normalized requests and both non-applicable football-surface requests inside the rehearsal, passed its exact unresolved-field assertions, and post-rollback verification confirmed production still retained the original 7 + 2 stale requests.

## Schema 398 — exact adidas surface evidence and queue reconciliation

Migration `0398_sport_fit_exact_surface_evidence.sql` deepens three exact sellable adidas footwear families on top of production schema 397.

- Runfalcon 6 ATR `IH1838`: exact first-party adidas evidence adds `sport_surface=road` and `sport_surface=trail` from explicit city-street, rugged-trail and multi-terrain-outsole wording. Existing running identity, true-to-size guidance, 254 g reference weight and 9 / 36 / 26 mm drop/stack facts remain unchanged.
- Ultimashow 2.0 `KJ9916`: exact first-party adidas evidence adds `sport_surface=road` from the explicit street-surface outsole statement. Its governed activity remains `general_training`; it is not reclassified as running.
- Cloudfoam Flex Laces `KJ7282`: no speculative technical fact is added. The pass reconciles its queue against already-governed walking, daily-walking and true-to-size facts.

The migration adds three normalized surface facts and three matching first-party evidence rows, then removes already-satisfied requested fields and football-only `football_surface_code` from the three non-blocked footwear queues. Cloudfoam wording, generic support/stability language and regular/loose fit wording remain evidence context only; the migration asserts that no `cushioning_level`, `support_level` or `footwear_width_profile` fact is created from those phrases.

Two recommendation regressions protect the new governed behavior: road + trail evidence must match both requested running surfaces, and positive street-surface evidence on a `general_training` shoe must not create a gym/treadmill hard mismatch.

The exact committed schema-398 migration (SHA-256 `9d1efe0245a6e7d5d78ff1fec9e6ee7e30ad9aa1b8770f476d99c3583af2e70e`) was replayed against live production schema 397 with its terminal `COMMIT` replaced by `ROLLBACK`. Identity/source guards, all three fact/evidence inserts, knowledge refreshes, queue reconciliation, unsupported-inference guards and final assertions passed.

The runtime schema gate on this change is **398**.

## Schema 399 — exact New Balance B480 and adidas Advantage 2.0 identity corrections

Migration `0399_sport_fit_exact_identity_corrections.sql` deepens two currently sellable footwear families using exact first-party product evidence and explicit identity guards.

- New Balance B480 catalogue base MPN `GSB480`: the sellable black/white family is bridged to manufacturer style `GSB480BW` and gains only `sport_activity=basketball`. A rehearsal initially exposed a second catalogue family sharing the same base MPN; schema 399 therefore requires the live source product plus black/white sellable identity before facts can be written.
- adidas Advantage 2.0 `IG9166`: exact adidas evidence adds `sport_activity=walking`, `sport_activity=casual_lifestyle`, `sport_use_case=daily_walking`, and `fit_length_profile=true_to_size`. Tennis heritage remains design context and is not treated as performance-tennis evidence.

The New Balance official regional product pages expose conflicting foot-length rows for the same B480 style. Because the current stored size-guide runtime is brand-scoped, schema 399 deliberately publishes **no** New Balance brand-wide size guide. That unresolved sizing conflict stays visible in provenance/queue metadata instead of being guessed or propagated to unrelated New Balance models.

Five normalized facts and five exact-manufacturer fact-evidence rows are added. Four manufacturer source records preserve the US/Spain New Balance and Qatar/Greece adidas provenance used by the pass. The target queues are then reconciled so only genuinely unresolved fields remain; non-applicable `football_surface_code` is removed.

Two recommendation regressions protect the correction: exact basketball knowledge must override a misleading generic/women's-sneaker catalogue label, and governed IG9166 walking knowledge must prevent tennis-inspired title text from reintroducing performance-tennis eligibility.

The exact migration was rehearsed against live production schema 398 inside a transaction ending in `ROLLBACK`. The first rehearsal correctly failed on ambiguous `GSB480` identity; after tightening the bridge to the live black/white source family, the second rehearsal passed all identity, fact, evidence, inference and queue assertions. The runtime schema gate on this change is **399**.


## Schema 400 — exact lifestyle identity and Cloud 6 geometry/fit

Migration `0400_sport_fit_lifestyle_identity_cloud6_geometry.sql` closes a high-value cross-sport contamination gap in two currently sellable footwear families that entered the catalogue through an athletic-sneaker retail taxonomy but had no governed Sport & Fit facts.

- On Cloud 6 `3WF10061200`: exact first-party On evidence adds `sport_activity=casual_lifestyle`, `fit_length_profile=true_to_size`, `heel_to_toe_drop_mm=8`, and `shoe_weight_g=216`. The manufacturer positions the Cloud 6 family for Active life / all-day lifestyle use. Cushioning/support wording is intentionally not converted into governed intensity.
- Saucony ProGrid Omni 9 Premium `S70740-15`: the exact first-party Saucony product breadcrumb classifies the model under Lifestyle, so `sport_activity=casual_lifestyle` is added. Retro running technology, cushioning/support language and breathable-mesh marketing are retained as evidence context only and are not promoted into present-day performance-sport suitability.

The migration adds **5 normalized family facts**, **5 matching first-party evidence rows**, and **2 manufacturer source records** across **2 canonical product families**. It changes no vendor-offer price, stock or fulfilment data.

Both enrichment queues are reconciled from the new canonical-family facts: resolved fields and the non-applicable `football_surface_code` request are removed, while surface, use case, cushioning, support, width, toe-box, plate, weather and unresolved geometry fields remain explicitly unknown. The migration asserts that it creates no unsupported `cushioning_level`, `support_level`, `footwear_width_profile`, `toe_box_profile`, `sport_surface`, `sport_use_case` or `weather_protection` facts.

A recommendation regression protects the hard-eligibility behavior: footwear with strong governed `casual_lifestyle` activity is rejected for a running request via `activity.known_mismatch` even when retailer title/category wording contains optimistic running or athletic signals. Popularity, price and heuristic text therefore cannot override the canonical activity conflict.

The exact committed schema-400 migration was replayed against live production schema 399 with its terminal `COMMIT` replaced by `ROLLBACK`. Both identities resolved to one active canonical family, all 5 fact/evidence inserts passed, unsupported-inference guards remained at zero, queue-hygiene assertions passed, and post-rollback verification confirmed that no target source or fact persisted.

Migration SHA-256: `5d026f4456785f68f3ac99f4e701918872cddc6d3dd4b6f8d35d78baf526e27c`.

The runtime schema gate on this change is **400**.

Schema 400 was applied atomically to production after PR #1275 merged. Live read-back confirmed schema version 400 and checksum `5d026f4456785f68f3ac99f4e701918872cddc6d3dd4b6f8d35d78baf526e27c`; On Cloud 6 has the expected four governed facts with four evidence rows, Saucony S70740-15 has the expected lifestyle fact with one evidence row, both families have strong identity and zero conflicts, both queues contain only unresolved fields, and unsupported technical-intensity/surface/use-case fact count remains zero.


## Schema 402 — JP9203 exact width and evidence/queue hygiene

Migration `0402_sport_fit_jp9203_width_evidence_hygiene.sql` deepens one currently sellable adidas running family and repairs two provenance-heavy running families without introducing speculative technical facts.

- adidas Duramo SL 2 `JP9203`: exact first-party adidas France evidence adds `footwear_width_profile=standard` from the explicit men's-width classification. Existing governed running, road/track, short-to-mid-distance training, race-preparation, neutral-support, true-to-size and geometry facts remain unchanged.
- adidas Galaxy 8 `IH9808`: five duplicated active first-party evidence pairs are consolidated by retaining the newest row active and preserving the older rows as inactive history linked through `superseded_by`.
- adidas Duramo RC2 `KJ6635`: two duplicated active first-party evidence pairs are consolidated in the same provenance-preserving way.

The pass adds **1 normalized family fact** and **1 new first-party evidence row**. It supersedes **7 redundant active evidence rows** rather than deleting them, preserving audit history while restoring a single active evidence row per exact source/fact position.

The three enrichment queues are reconciled from their actual canonical-family facts: already-resolved requested fields and non-applicable `football_surface_code` are removed. JP9203 deliberately leaves cushioning intensity, toe-box profile, plate type and weather protection unknown because the exact manufacturer page does not provide sufficiently governed values for those fields.

The exact schema-402 migration was rehearsed against live production schema 401 inside a transaction ending in `ROLLBACK`. Identity resolution, JP9203 width insertion/evidence, seven-row provenance supersession, queue reconciliation and unsupported-inference guards all passed. Post-rollback verification confirmed that no rehearsal source or JP9203 width fact persisted and that the original seven duplicate evidence groups remained present.

Migration SHA-256: `762a132e5063d55c5bd96b5976af85625eeb0cb91a81d4c941e934bb5931e05e`.

The runtime schema gate on this change is **402**.


## Schema 403 — reference-size-aware conflict governance for JR9087

Migration `0403_sport_fit_reference_size_conflict_governance.sql` resolves the highest-priority blocked Sport & Fit family, adidas Terrex Anylander RAIN.RDY `JR9087`, without averaging measurements or discarding lower-tier provenance.

The root problem was broader than one product: `refresh_sport_product_knowledge` treated any two active evidence values for the same fact position as a family-wide conflict. The runtime deliberately excludes `conflict` / blocked knowledge from recommendations, so a disagreement in reference shoe weight or geometry could suppress otherwise undisputed hiking, trail, fit and waterproof intelligence.

Schema 403 adds `sport_product_fact_evidence.reference_size_entry_id`, linked to the normalized Sport & Fit size-guide entries. Conflict detection now keeps a disagreement non-conflicting only when every differing evidence row is explicitly scoped to a normalized reference size and no two sources disagree at the same reference-size entry. Unscoped disagreements remain conflicts.

For `JR9087`, the existing adidas guide proves that UK 8.5 maps to the 263 mm entry while EU 38 2/3 maps to the 238 mm entry. Exact adidas Turkey and adidas Malaysia pages both publish 390 g at UK 8.5 plus 10 mm drop and 27/17 mm heel/forefoot stack. The direct Kerasiotis feed's 330 g observation is retained active and scoped to EU 38 2/3; it is no longer falsely interpreted as the same-size weight measurement. The feed's conflicting 9 mm drop and 26 mm heel-stack rows are retained as inactive, superseded audit evidence because two exact first-party manufacturer pages agree on the model-level 10 mm / 27 mm values. The matching 17 mm forefoot evidence remains active.

The migration adds **1 manufacturer source** and **4 exact first-party evidence rows**, adds no new canonical product fact values, preserves the manufacturer's existing normalized 390 g / 10 mm / 27 mm / 17 mm facts, and moves JR9087 from family-wide `conflict` + blocked queue to `partial` + an ordinary enrichment queue containing only unresolved technical-profile/use-case fields.

A recommendation regression protects the user-visible consequence: a JR9087-like product with strong governed hiking, trail, true-to-size and waterproof knowledge remains technically eligible once the reference-size evidence conflict has been resolved.

The exact migration was rehearsed against live production schema 402 inside a transaction ending in `ROLLBACK`; schema alteration, normalized size-entry mapping, manufacturer corroboration, evidence supersession, refined conflict counting, knowledge refresh and queue reconciliation all passed. Post-rollback verification confirmed production remained at three JR9087 conflicts, `conflict` knowledge status and a blocked queue.

Migration SHA-256: `4ea7fd648dfc08b448c08e17a9dd4c0253cb82defbe88961c8624f64f1e90db3`.

The runtime schema gate on this change is **403**.


## Schema 404 — live Rockadia manufacturer evidence and queue hygiene

Migration `0404_sport_fit_rockadia_manufacturer_evidence_queue_hygiene.sql` deepens two currently approved, visible and stocked adidas Terrex Rockadia canonical families, `KJ0410` and `KJ0411`, using exact-code first-party manufacturer evidence.

For `KJ0410`, the exact adidas Peru page explicitly identifies a wide last, walking/hiking use, rugged-path and city-street context, everyday walking/journey context, and a published weight of **320.4 g**. The migration upgrades the already-normalized walking, trail, road, daily-walking and wide-fit facts from lower-tier feed confidence to exact manufacturer confidence and adds the previously missing weight fact. For `KJ0411`, the exact adidas Romania page publishes the same **320.4 g** weight for that exact product code, so the missing weight fact is added without transferring the value from another colorway.

The pass intentionally does **not** convert EVA cushioning copy into a normalized cushioning intensity, does not infer a support grade from generic support language, and does not invent drop/stack, toe-box, plate or weather-protection facts. Those fields remain unresolved in the enrichment queue.

Schema 404 also fixes a queue-quality defect discovered during prioritization: a superseded JP9203 canonical family with no active variants remained blocked at priority 200. Its historical knowledge is preserved, but its enrichment queue row is closed as non-actionable so live sellable families receive the intended priority.

Regression guards in the migration verify exact family identity, approved-visible offer presence, the two authoritative 320.4 g facts, exact manufacturer evidence linkage, non-conflict knowledge status, pruning of already-resolved/non-applicable requested fields, and closure of the orphan JP9203 queue row.

The migration was rehearsed against the live production state inside a transaction ending in `ROLLBACK` before application.

Migration SHA-256: `4073449d12727809edc411f2b3cc118dd036b828ec4ada1ce3c7e6f62fae44cc`.

The runtime schema gate on this change is **404**.

## Schema 405 — IF6748 reference-size geometry and neutral-support deepening

Migration `0405_sport_fit_if6748_reference_geometry_neutral_support.sql` deepens the currently sellable adidas Adizero SL2 `IF6748` family without erasing the regional fit disagreement preserved by schema 331.

Current exact adidas Australia, Egypt and Malaysia product pages agree on the same reference measurements at **UK 8.5**: **238 g** weight, **9.5 mm** drop, **36.9 mm** heel stack and **27.4 mm** forefoot stack. Schema 405 normalizes those four values and links all twelve manufacturer evidence rows (four facts × three regions) to the existing adidas UK 8.5 / 263 mm normalized size-guide entry through `reference_size_entry_id`. This prevents a reference-size measurement from being treated as an unscoped size-independent observation.

The exact adidas Malaysia IF6748 page also classifies pronation as **Neutral**, so `support_level=neutral` is added with exact first-party provenance. The pass deliberately does **not** map Lightstrike Pro marketing to a cushioning intensity and does not map “Regular fit” to a governed footwear-width profile.

The fit recommendation remains unresolved by design. adidas Egypt advises sizing up, while Australia and Malaysia advise the usual size. Schema 405 therefore creates no `fit_length_profile` fact and preserves the disagreement in source metadata and the enrichment queue rather than majority-voting it away.

The pass adds **5 normalized family facts**, **13 active first-party evidence rows** (12 reference-size-scoped geometry rows plus one neutral-support row), and **1 new exact manufacturer source** while re-verifying the two existing Australia/Egypt sources. The queue is reduced to the genuinely unresolved fields: cushioning level, fit-length profile, footwear width, sport surface and toe-box profile.

The exact migration was rehearsed against production schema 404 inside a transaction ending in `ROLLBACK`; all identity, commerce, normalized-size, fact, evidence, conflict and queue assertions passed. Post-rollback verification confirmed production remained at schema 404 and that no Malaysia source or schema-405 queue change persisted.

Migration SHA-256: `81f5690dea88a84b3e649376a1702619c3df62bb083a9555c54e5d9018ce48d3`.

The runtime schema gate on this change is **405**.


## Schema 406 — Cloudfoam Flex connected-feed conflict reconciliation

Migration `0406_sport_fit_cloudfoam_flex_feed_reconciliation.sql` corrects one live cross-sport recommendation bug and deepens fit knowledge for two currently approved and stocked adidas Cloudfoam Flex canonical families, `KJ4808` and `KJ7282`.

For `KJ4808`, the exact approved connected source product is internally contradictory: its broad title/category says running, while its detailed product description explicitly calls it a walking shoe, says it is designed for daily walks and lists a **wide fit**. Schema 406 therefore replaces the normalized `running` activity with `walking`, adds `sport_use_case=daily_walking` and `footwear_width_profile=wide`, and preserves both historical running evidence rows as inactive audit history linked through `superseded_by`. The source metadata records the title/description conflict and the exact resolution policy.

For `KJ7282`, exact adidas manufacturer evidence already governs walking, daily walking and true-to-size fit. The exact approved connected-feed description adds only the explicit **wide-fit** fact; it does not reintroduce the feed title's broader running wording.

The pass deliberately leaves Cloudfoam cushioning, generic stability/arch-support language, surface, support intensity, drop/stack, weight, toe-box, plate and weather protection unknown unless separately governed evidence exists. Queue cleanup removes only resolved or non-applicable requested fields.

A recommendation regression protects the user-visible behavior: a strongly governed KJ4808-like walking product must remain eligible for a daily-walking request and must be hard-excluded from running even when its raw retailer title and catalogue category contain running language.

The exact migration was rehearsed against live production schema 405 inside a transaction ending in `ROLLBACK`; all identity, approved-source-link, exact-description, evidence-supersession, queue-hygiene and unsupported-inference assertions passed.

Migration SHA-256: `b44868e8f732f60a5be62b3066881ec29fa3d7ee47c4e41075948b0888c2f1c0`.

The runtime schema gate on this change is **406**.

## Schema 407 — sellable New Balance lifestyle identity and fit governance

Migration `0407_sport_fit_new_balance_lifestyle_fit_governance.sql` closes three currently sellable, zero-knowledge New Balance footwear families with first-party manufacturer evidence while explicitly preventing running-heritage wording from becoming performance-running eligibility.

- **2002R `U2002RB`**: New Balance's 2002R collection classifies the model line as **Unisex Lifestyle**. The exact U2002RB manufacturer page adds `footwear_width_profile=standard`, `fit_length_profile=true_to_size` from “Fits As Expected For Most People,” and **410 g** published weight.
- **ABZORB 2000 `U20004GM`**: New Balance classifies ABZORB 2000 as **Unisex Lifestyle**. The exact U20004GM page adds Standard width and **414 g** published weight.
- **740 `U740BM2`**: New Balance's current 740 collection classifies the model line as **Unisex Lifestyle**, including U740BM2. The exact U740BM2 page adds Standard (D) width.

The pass adds **9 normalized family facts**, **9 active first-party evidence rows**, and **6 manufacturer sources** across **3 live canonical families**. Historical phrases such as “daily runner,” “running-inspired classics,” ABZORB cushioning, Stability Web and related technology copy are preserved only as source context; they are not converted into current running activity, surface/use-case, cushioning intensity, support grade, stack/drop, toe-box, plate or weather facts.

All three enrichment queues are pruned from their real canonical-family facts and non-applicable `football_surface_code` is removed. Unverified technical fields remain explicitly unresolved.

A recommendation regression covers the user-visible failure mode: a New Balance lifestyle family carrying “daily runner” / “running-inspired” catalogue wording is still hard-excluded from a running request when governed activity is `casual_lifestyle`.

The migration is designed to fail closed on changed canonical identity, pre-existing target facts, missing approved-visible commerce, unsupported inferred facts, conflicts, or stale queue fields.

After the merged Cloudfoam Flex schema 406 was applied to production, the exact schema-407 migration was rehearsed again against that sequential live baseline inside a transaction ending in `ROLLBACK`. Identity, approved-visible commerce, normalized fact/evidence/source counts, unsupported-inference guards, non-conflict state and queue reconciliation all passed. Post-rollback read-back confirmed production remained at schema 406 with zero schema-407 sources and zero target-family facts.

The Sport Fit WebGL Acceptance workflow passed on the schema-407 PR head, including the Sport & Fit rules verifier, migration checksum verification and the production Next.js build. Vercel preview also passed. Unrelated repository-wide SEO/legacy empty-catalogue checks remain outside this batch.

Migration SHA-256: `f6104d87d1ba8db0bddb0e84ff49be3bb1169b369539b3011ef183319d0ac98c`.

The runtime schema gate on this change is **407**.

## Schema 408 — sellable On Cloud X Tempo hybrid-training governance

Migration `0408_sport_fit_on_cloud_x_tempo_hybrid_training.sql` enriches four currently sellable, zero-knowledge On Cloud X Tempo canonical families: men `3MG30110969` and `3MG30116013`, and women `3WG30090969` and `3WG30095084`.

Current first-party On evidence governs Cloud X Tempo as a hybrid model spanning training/gym mixed workouts and running context. The normalized knowledge is deliberately narrow: `sport_activity=gym_training`, `sport_activity=running`, `sport_use_case=gym_functional`, `fit_length_profile=true_to_size`, **8 mm** heel-to-toe drop, and the published reference weight (**307 g men / 249 g women**).

The pass adds **24 normalized family facts**, **24 active first-party evidence rows**, and **6 current manufacturer sources** across **4 live canonical families**. It does **not** infer road or indoor surface, cushioning grade, support grade, heel/forefoot stack, width, toe-box profile, plate type, or weather protection from descriptive marketing language. Those fields remain unresolved.

All four enrichment queues are reconciled: resolved fields and non-applicable `football_surface_code` are removed, while the unresolved technical fields stay explicitly queued. Recommendation regression coverage preserves the hybrid activity semantics: Cloud X Tempo can satisfy governed functional-gym and running activity requests, while a different governed sport such as basketball is a hard mismatch.

Before repository registration, the exact schema-408 migration was executed against the live schema-407 production database inside a transaction ending in `ROLLBACK`. Its identity, approved-visible-commerce, normalized fact/evidence/source counts, unsupported-inference guards, conflict guard, and queue reconciliation assertions all passed, and production data remained unchanged after the rehearsal.

Migration SHA-256: `5f33c966acb8d0b0661928e19ef4070811f5ed389009042f7ebb7789aa0e15cb`.

The runtime schema gate on this change is **408**.


## Schema 409 — Saucony Originals identity and official unisex sizing

Migration `0409_sport_fit_saucony_originals_size_governance.sql` governs **15 currently sellable, zero-knowledge Saucony families** across ProGrid Omni 9, ProGrid Omni 9 TMY, ProGrid Guide 7 and ProGrid Triumph 4. Together the targeted canonical families currently carry **118 approved-visible marketplace offers**.

Current first-party Saucony pages classify these model lines under **Lifestyle, Originals or Retro Tech**. Historical phrases such as “running DNA,” “taken straight from the 2007 running catalogue,” Grid/ProGrid cushioning and stability language remain provenance context only. They are not normalized into current performance-running activity, road/trail surface, use case, cushioning/support grade, stack/drop, weight, width, toe-box, fit profile, plate or weather facts.

The product-family pass adds **15 normalized `sport_activity=casual_lifestyle` facts** and **15 active first-party evidence rows**. This gives the recommendation engine a deterministic hard conflict when supplier titles/categories misleadingly surface these current Originals products as performance-running footwear.

The same migration adds the missing governed **Saucony unisex footwear size guide**: **27 heel-to-toe measurement rows from 210 mm through 350 mm** and **135 normalized labels** across EU, UK, US men/unisex, US women and JPN. The chart remains brand-level and vendor-independent. Between-row measurements return both adjacent sizes; no model-specific fit adjustment is applied without separate product evidence.

All 15 enrichment queues are reconciled from canonical-family facts. `sport_activity` and non-applicable `football_surface_code` are removed from the unresolved queue while unsupported technical fields stay explicitly unknown. Regression coverage verifies both the running-heritage hard exclusion and representative Saucony EU/US/JPN measurement conversion.

The exact migration passed a live schema-408 transactional rehearsal ending in `ROLLBACK`. Identity resolution, approved-visible commerce, source/fact/evidence counts, unsupported-inference guards, conflict checks, queue reconciliation and size-guide cardinality all passed. Post-rollback read-back confirmed schema 408 with zero target facts/evidence, zero Saucony size guides and zero schema-409 sources.

Migration SHA-256: `79a7f69fd6cca3a798b71a19d0486e861828f66f58e0eafb9473bdf106b72b91`.

The runtime schema gate on this change is **409**.


## Schema 410 — Saucony performance/lifestyle split

Migration `0410_sport_fit_saucony_performance_lifestyle_split.sql` governs seven currently sellable zero-knowledge Saucony canonical families with opposite recommendation semantics rather than treating every supplier “athletic sneaker” the same.

Five current manufacturer-classified lifestyle families are governed as `sport_activity=casual_lifestyle`: Jazz Original `S2044`, Jazz Triple `S60530-62`, Shadow 5000 `S70853`, and Ride Millennium `S70812-43` / `S70812-49`. Jazz Original also receives `fit_length_profile=short` from Saucony’s explicit current recommendation to buy half a size up. Historical running-line origins, Grid/EVA cushioning and supplier sports wording remain provenance context only.

Two Endorphin Azura `S21070` canonical families receive current first-party performance knowledge despite living in the generic `mens-sneakers` catalogue category. Saucony’s current product page and Running Shoe Buyer’s Guide govern `sport_activity=running`; `sport_use_case=daily_training`, `speed_training`, and `race_day`; `support_level=neutral`; `plate_type=none`; **8 mm drop**; **40 mm heel / 32 mm forefoot stack**; and **240 g men’s reference weight**. Surface, ordinal cushioning grade, width, toe-box, fit length and weather protection remain unknown because the current evidence does not map them cleanly to the governed ontology.

The batch adds **26 normalized family facts**, **26 active first-party evidence rows**, and **6 current Saucony manufacturer sources** across **7 live canonical families**. The application knowledge projection is also extended to carry `plateType`, `heelStackMm`, and `forefootStackMm` through both the Sport & Fit catalogue and product-intelligence API, closing a pre-existing gap where those database facts were stored but not exposed. Queue reconciliation removes resolved fields and non-applicable `football_surface_code` while retaining only unresolved technical fields.

Regression coverage protects both directions of the classification problem: Endorphin Azura remains running-eligible even when supplier taxonomy says generic sneaker, while Shadow 5000 remains hard-excluded from running even when supplier/title wording invokes performance or running heritage.

The exact schema-410 migration passed a live schema-409 transaction ending in `ROLLBACK`. Identity, approved-visible commerce, fact/evidence/source counts, unsupported-inference guards, conflict checks and queue reconciliation all passed. Post-rollback read-back confirmed schema 409 with zero target facts/evidence and zero schema-410 sources.

Migration SHA-256: `a868dbf5830467dc44e348744fc5665353740db30a94997393c7440a71081745`.

The runtime schema gate on this change is **410**.


## Schema 411 — On Cloud 6 negative weather evidence and adult sizing

Migration `0411_sport_fit_on_cloud6_weather_size_governance.sql` closes two governed knowledge gaps without inventing ordinal cushioning, support, width or surface facts.

Three currently sellable standard On Cloud 6 canonical families are matched by exact manufacturer style identity: men's Black/Black `3MF10071043`, women's Black/Black `3WF10061043`, and women's White/White `3WF10061200`. Each exact On product page separates the standard Cloud 6 from a dedicated Cloud 6 Waterproof model. The normalized ontology therefore gains `weather_protection=none` as an **explicit negative** state, distinct from absent/unknown weather data. Each target receives one family fact and one exact first-party evidence row; the enrichment queue removes only the resolved weather field and preserves unsupported technical fields as unknown.

The runtime rules are updated at the same schema boundary. Positive weather scoring now recognizes only `waterproof`, `water_resistant` or `wind_resistant`; `none` is a documented conflict rather than a positive match. For footwear with weather as the user's priority, explicit `none` is a hard exclusion, while missing weather evidence remains unknown and does not become a fabricated rejection. Raw catalogue wording cannot rescue an explicit negative governed fact.

The same migration adds separate current On men's and women's adult footwear size guides. The men's chart contains **16 measurement rows / 64 labels** and the women's chart **14 rows / 56 labels**, preserving On's EU, UK, US and JPN chart mappings. Measurement resolution uses the manufacturer length-size sequence as the brand-specific anchor, returns both adjacent chart choices between rows, and never applies a model-specific fit adjustment unless that model has its own fit evidence. This keeps brand conversion knowledge independent from Cloud 6 / Cloud X / Cloudmonster model-fit guidance.

The exact migration passed a live schema-410 transaction ending in `ROLLBACK`. Exact family identity, approved-visible commerce, source availability, explicit-negative ontology creation, three fact/evidence rows, conflict checks, enrichment-queue reconciliation, two guide sources, two active guides, **30 guide entries**, and **120 normalized size labels** all passed. Post-rollback verification confirmed schema 410 with zero `weather_protection=none` values, zero On adult guides and zero schema-411 size-guide sources.

Migration SHA-256: `ab7857be1e483e7c053febc6a12e1572e09d41beedfbe42f8204151d6ab8c720`.

The runtime schema gate on this change is **411**.
