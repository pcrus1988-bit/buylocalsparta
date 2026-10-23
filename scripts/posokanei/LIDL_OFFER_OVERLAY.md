# Lidl Greece weekly offers inside the PosoKanei catalogue

This is a read-only, rights-gated presentation overlay on **existing published
PosoKanei products**. It does not create marketplace vendor offers or replace
the daily government price observations. It does not enter basket optimization:
a Lidl promotion is store-specific, not a proven national chain price.

Source clients: [FaserF/ha-lidl](https://github.com/FaserF/ha-lidl)
(MIT code), and KONTA MOY's standalone Lidl GR staging connector.
The Lidl Plus source data itself is **not MIT-licensed** by that project.

## How the pipeline connects

1. Import the verified daily PosoKanei snapshot using the existing
   `scripts/posokanei/import-snapshot.mjs`. Its
   `reference-products.jsonl` includes government product IDs and names.
2. Import public Lidl Greece advertised store offers into the separate staging
   connector; no bypass of access controls or bulk crawling.
3. Independently review retailer SKU ↔ exact PosoKanei product identity
   (including brand, unit and packaging), eligibility of the offer without a
   Lidl Plus membership, geography, and source/database reuse rights.
4. Export `export-review-batch` from the Lidl connector; prepare a reviewer
   crosswalk JSON, containing `version:1` and `entries`:
   `retailer_product_id`, `source_product_id`, `source_product_hash`,
   `reviewed_by`, `reviewed_at` and the four strictly true flags
   `identity_verified`, `packaging_verified`,
   `promotional_terms_verified`, `no_membership_required_verified`.
   Compute the hash with `productIdentityHash(actualPosokaneiProduct)`
   from `lidl-weekly-overlay.mjs`. This pins the full product identity,
   not just a potentially ambiguous Greek name or Lidl SKU.
5. With an independently documented reuse permission, build the *local*
   artifact (not an upload):

```sh
node scripts/posokanei/compile-lidl-reviewed-offers.mjs \
  --products /private/reference-products.jsonl \
  --review-batch /private/lidl-review-batch.json \
  --mappings /private/reviewed-lidl-crosswalk.json \
  --out /private/lidl-weekly-overlay.json \
  --rights-verified --permission-ref DOCUMENTED_LIDL_APPROVAL
```

6. Audit and upload it to operator-controlled HTTPS storage, then independently
   configure **all** variables on a reviewed deployment:

```
POSOKANEI_LIDL_PROMOTIONS_ENABLED=true
POSOKANEI_LIDL_DATA_REUSE_APPROVED=true
POSOKANEI_LIDL_PROMOTIONS_URL=https://<approved-host>/<artifact>.json
```

Default is disabled. The loader limits the source host, size (1.5 MB), download
time (15s), redirects, and cache (10 min). Promos are not displayed if their
date is outside the current Greek date, observation is older than 48 hours,
the product identity fingerprint drifts, or reviewed eligibility flags fail.
A source error does **not** hide the base PosoKanei product catalogue.

Each matched product card displays the store, advertised price, reference
price if source-supported, and validity window. Unmatched Lidl products are
**not** incorrectly merged into an existing PosoKanei product, and source
`productIds` are not treated as EANs.

## Coverage versus goal

The UI queries the **full** PosoKanei catalog and decorates matched products.
This is not a separate mini-catalog or a hardcoded product list. It does **not**
mean every PosoKanei SKU has a Lidl weekly offer. An actual reviewed crosswalk
and approved live source data are required before production display. These
conditions are not satisfied merely by creating this source-code feature.

Run focused tests: `node --test scripts/posokanei/*lidl*.test.mjs`.
