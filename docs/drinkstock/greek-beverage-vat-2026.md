# Greek beverage VAT and DrinkStock starter catalogue
Research date: **20 October 2026**. This is operational classification guidance, not a substitute for advice from the legal merchant's accountant/AADE. No beverage payment is enabled by this release.

## Official evidence
- AADE E.2047/2024, effective for hot beverages from 1 July 2024: https://www.aade.gr/egkyklioi-kai-apofaseis/e-2047-28-06-2024
- AADE E.2002/2023, drink/juice/coffee takeaway vs service (first effective 1 January 2024): https://www.aade.gr/egkyklioi-kai-apofaseis/e-2002-28-12-2023
- AADE codified Annex III, VAT Code 5144/2024 to November 2025: https://www.aade.gr/sites/default/files/2025-12/parartima-III-ekdosi13_1.pdf
- AADE E.2113/2025, expansion of 30% island VAT reduction from 1 January 2026 and specific establishment/transaction conditions: https://aade.gr/egkyklioi-kai-apofaseis/e-2113-31-12-2025
- AADE general VAT rates: https://www.aade.gr/exypiretisi-enimerosi/hristikoi-odigoi/enarxi-epiheirimatikis-drastiriotitas/basikoi-syntelestes-fpa

## National VAT matrix for hospitality, standard jurisdiction

| Beverage | Dine-in as part of on-site food/beverage service | Takeaway or delivery supplied as goods |
|---|---:|---:|
| Beer, cider, wine, retsina, ouzo, tsipouro, spirits, cocktails with alcohol | 24% | 24% |
| Coffee (espresso, freddo, Greek coffee), tea, cocoa, chamomile, herbal infusions | 24% | 13% |
| Cola, soda, lemonade, tonic, energy drinks WITHOUT added alcohol | 24% | 13% |
| Fresh juice, packaged juice, alcohol-free smoothies and mocktails | 24% | 13% |
| Plain/sparkling water | 24% when part of on-site beverage service | 13% when goods qualifying under Annex III |

**Important transaction nuance:** A goods supply that is not part of a comprehensive on-premises catering service must be treated as a goods supply even if the product physically changes hands in a business. Conversely a drink consumed at a table as part of service is dine-in. The app must use a **server-validated service mode** rather than infer from QR location, cash register, package, packaging size or product name.

**Alcohol:** Takeaway of alcoholic beverages is not eligible for the 13% non-alcoholic goods rule. A cocktail with any alcohol uses the alcoholic class, even if other ingredients are non-alcoholic. `0.0%` beer is only non-alcoholic after merchant review confirms its actual label/composition. Drinks with ambiguous alcohol content must be classified `review_required` and cannot receive an automatic VAT rate.

**Dine-in exceptions:** Not all activity of a hospitality business is a 24% beverage service. Food and separate goods have their own rules. Exclude food, supplements, special mixed sales, separately invoiced hospitality packages and exotic beverage tariff categories from this simple beverage engine until reviewed.

## Island-specific exception effective from 2026
AADE E.2113/2025 details the islands and conditions for 30% VAT reduction:
- From the normal 24% base to **17%**; from 13% to **9%**.
- In addition to continuing arrangements for Lesvos, Kos, Samos and Chios, eligible small-population islands of the North Aegean region, Samothrace and the Dodecanese are covered under strictly specified population and establishment conditions.
- For physically provided hospitality services, a taxable person must be established in the qualifying location and physically provide the service there. The supply-of-goods tests differ. The official annex lists the qualifying islands, not all islands automatically.
- Never infer regional eligibility from ZIP code, venue display name, guest address, or tax residence. Obtain documented merchant/branch eligibility and transaction proof. `resolveGreekBeverageVat` will not return 17/9 without explicit `islandEligibilityVerified:true`; no current guest/payment route supplies this flag.

## Rules for transaction integration
1. Select the **actual merchant of record**, its approved fiscal tax status, venue and service mode. Block tax-exempt/special-regime merchants pending separate review; don't force normal VAT on them.
2. Apply a reviewed VAT class at each product/variant. Existing venue products default to `review_required`. Starter catalogue templates carry a **suggested** class, persisted with `vat_reviewed=false` and must be signed off by the merchant/accountant.
3. Obtain gross menu price from server-side venue snapshot. `splitGreekBeverageGross` computes VAT-inclusive net and VAT cents using integer rounding; **never add VAT on top of the customer's gross menu price**.
4. Lock quote/session/product/merchant/mode/jurisdiction/rate-rule-version in an order snapshot before payment. If mode, product, availability, price or fiscal eligibility changes, re-quote, obtain consent and do not charge silently.
5. Payments may be activated only after a properly authenticated, idempotent PSP payment, settlement mapping, and the correct fiscal-issuance route (Greek AADE requirements, including restaurant fiscal devices if applicable) are tested end to end. Receipt/refund/credit notes must retain the original rate and item snapshots.
6. `/api/checkout` is a different MARKETPLACE checkout using canonical product variants, vendor settlement and customer address identity. **Do not reuse it for venue drinks without a separate adapter** that preserves merchant attribution and VAT.
7. POS-less **admin approval** from PR #1687 is permission to prepare a fallback, *not* merchant tax verification, payment activation, or legal fiscal compliance.

## Ready starter catalogue
- **56** unbranded, editable product templates: Greek bar beer/wine/spirits/cocktails, non-alcoholic beverages, water, espresso/freddo/cappuccino and juice.
- Source: `apps/web/src/lib/drinkstock-starter-catalogue.ts`; CSV: `docs/drinkstock/drinkstock-starter-catalogue-gr-2026.csv`.
- Owners/managers select products and adjust example gross prices individually in the **DrinkStock Venue → Trading Floor** editor. The import is optional, per venue, tenant-checked, session-locked, capped at 60 active drinks, case-insensitive duplicate-safe, idempotent and transactionally recorded.
- Template names/prices are **demonstrative venue setup suggestions**; not supplier SKUs, certified bar prices, live inventory, or proof of an alcohol license.
- All imported drinks are subject to merchant tax/stock/price review. Existing drinks are not changed; the tax class for old entries is `review_required` until deliberately classified.
- The system currently has **no automatic checkout activation** even after import or admin POS-less approval.
