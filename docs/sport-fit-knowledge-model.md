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
