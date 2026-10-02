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

The runtime schema gate is now 318.


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

The runtime schema gate is 318.


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

The runtime schema gate is 318.
