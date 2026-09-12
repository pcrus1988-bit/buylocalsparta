# Catalogue enrichment pilot checklist

Use this checklist before any generated catalogue copy is considered for storefront consumption.

For each pilot parent product verify that the supplier evidence, verified facts, generated candidate and final accepted display copy agree on brand, model/line, product type, colour, materials, dimensions and condition. A field may be omitted from copy, but it must never be added without evidence.

Check that the Greek title starts with the verified brand where known, contains the verified model/line where known, identifies the product type, and does not expose supplier or platform identifiers.

Read the full Greek description for unsupported authenticity/certification claims, invented collection/model names, invented materials/features, price/discount language, stock claims, shipping promises, delivery estimates and supplier/dropshipping terminology.

For BAZAAR products confirm the copy clearly preserves the verified second-life condition. A Preloved or Preowned item must not read like ordinary new stock.

Review every `needs_review` row rather than manually copying its candidate into public product text. Validation errors should be used to improve the rules/prompt and rerun a controlled pilot.

Review every `failed` row for provider, source-evidence or retry-limit problems. Supplier ingestion and normal selling behavior must remain unaffected.

Do not enable `BLS_CATALOGUE_AI_ENRICHMENT_ALLOW_ALL=true` during the first pilot. Do not implement storefront consumption until the pilot sample has been manually compared against source evidence and the rejected-candidate rate is understood.
