# Catalogue enrichment

KONTA MOY keeps supplier evidence, canonical catalogue identity and customer-facing merchandising copy as separate layers.

## Safety model

`catalog_source_products` and its snapshots remain the immutable supplier-evidence layer. `catalogue_enrichments` is derived presentation data keyed by supplier parent and, when available, the governed canonical `product_family`.

A NOVA / BrandsGateway product is prepared before any language generation occurs. Preparation extracts conservative verified facts, records per-fact provenance, creates a deterministic Greek fallback, derives the BAZAAR condition overlay and calculates a merchandising source hash. Price, stock and availability changes do not participate in that hash.

AI output is never authoritative. Generated copy must pass strict structured-output parsing and a deterministic validation pass before the enrichment row may enter `enriched`. Rejected candidates enter `needs_review` and are retained only for QA. They do not replace accepted display fields and are not storefront content.

The storefront does not consume enrichment rows as part of the generation rollout. Storefront adoption is a separate release decision after pilot evidence is reviewed.

## Runtime controls

Generation is off unless all required controls are satisfied.

- `BLS_CATALOGUE_AI_ENRICHMENT_ENABLED=true` enables the generation subsystem.
- `BLS_CATALOGUE_AI_ENRICHMENT_PRODUCT_IDS=10307007,10314594` defines a comma-separated pilot allow-list of supplier parent product IDs.
- `BLS_CATALOGUE_AI_ENRICHMENT_ALLOW_ALL=true` removes the pilot allow-list boundary. Do not set this for the first rollout.
- `BLS_CATALOGUE_AI_ENRICHMENT_BATCH_SIZE` controls products claimed per worker loop. Default: `2`; hard maximum: `10`.
- `BLS_CATALOGUE_AI_MAX_ATTEMPTS` controls generation attempts before a row becomes `failed`. Default: `3`; hard maximum: `10`.
- `BLS_CATALOGUE_AI_MODEL` selects the OpenAI model. Default: `gpt-5.6-terra`.
- `BLS_CATALOGUE_AI_REQUEST_TIMEOUT_MS` controls the provider request timeout. Default: `30000`.
- `OPENAI_API_KEY` is required only when generation is actually configured to run.
- `OPENAI_API_BASE_URL` is optional and defaults to `https://api.openai.com/v1`.

Setting only `BLS_CATALOGUE_AI_ENRICHMENT_ENABLED=true` is intentionally insufficient. With no pilot product IDs and without the independent allow-all switch, zero products are sent to the model.

## Generation contract

The language provider receives only the prepared verified facts/provenance, deterministic fallback, BAZAAR context, and sanitized supplier title/description. Supplier HTML, scripts and style blocks are removed first. Supplier content is treated as untrusted evidence and any instructions embedded in it must be ignored.

The generated Greek copy must not invent or expose:

- model or collection names that were not verified,
- materials, colours, dimensions, origin or product features that were not verified,
- authenticity, certification, handmade or limited-edition claims without explicit evidence,
- price, discount, stock, delivery-time or shipping promises,
- NOVA, BrandsGateway, dropshipping terminology, supplier IDs, external product/variant IDs, SKUs or platform-internal fields.

When the supplier marks an item as BAZAAR / Preloved / Preowned, the generated copy must disclose the verified second-life condition rather than present it as ordinary new stock.

## Lifecycle

`pending` means facts are prepared and the current source hash requires enrichment. A short database lease plus `FOR UPDATE SKIP LOCKED` prevents concurrent workers from generating the same row. Materially changed supplier evidence resets the lease, retry counter and stale rejected candidate.

`enriched` means a generated draft passed deterministic validation. This state alone does not make it public.

`needs_review` means generation completed but one or more deterministic rules rejected the candidate. The candidate and validation errors are retained for operator QA.

`failed` means the configured retry limit was exhausted or source evidence was unusable.

## Initial rollout

1. Merge and migrate the foundation while AI generation remains disabled.
2. Deploy the generation code with the feature flag still disabled.
3. Choose a small, representative pilot containing normal luxury items and BAZAAR items with strong supplier facts.
4. Configure only those parent product IDs in `BLS_CATALOGUE_AI_ENRICHMENT_PRODUCT_IDS` and enable generation.
5. Review all `enriched`, `needs_review` and `failed` records. Compare generated text against supplier evidence and confirm no internal/supplier data leaks.
6. Adjust prompt/rules versions if needed and rerun the pilot.
7. Only after satisfactory pilot evidence should storefront consumption be implemented as a separate change.
8. `BLS_CATALOGUE_AI_ENRICHMENT_ALLOW_ALL=true` should be considered only after the controlled pilot and storefront fallback behavior have both been verified.
