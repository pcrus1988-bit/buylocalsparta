# KONTA MOY Sport & Fit — 15 October 2026 governed continuation

## What changed, directly in the existing architecture

This batch builds on the existing canonical product family, evidence, rules and recommendation engine in PR #1536. Production continues at main migration 0447 until coordinated deployment.

### CI regression discovered and corrected

The 14 October PR had failing database bootstrap workflows. Logs of Production CI and browser acceptance identified the same blocker: schema 0450 was asserting 10 controlled-value rows even in a **clean, catalogue-empty CI database**, which contained only 9. It passed the populated catalogue but failed empty-database initialization. Migration 0450 now checks for an empty catalogue before asserting **product-specific** vocabulary. It still fails closed on a populated production catalogue, and no production facts are silently skipped. The 0450 checksum was regenerated.

### Evidence expansion — migration 0451

Three **currently approved-offer** exact adidas families:

* **IF6748 — Adizero SL2**: Lightstrike Pro manufacturer technology and explicit Regular fit. Source: [adidas IF6748](https://www.adidas.com.tr/en/adizero-sl2-running-shoes/IF6748.html); corresponding existing exact evidence source `adidas_adizero_sl2_if6748_australia_official`.
* **JR6599 — Terrex Anylander**: Traxion outsole technology, explicit Regular fit, and day-hike manufacturer use case. Source: [adidas JR6599](https://www.adidas.com/bh/en/terrex-anylander-hiking-shoes/JR6599.html); existing evidence source `adidas_terrex_anylander_jr6599_official`.
* **JR9087 — Terrex Anylander RAIN.RDY**: Traxion outsole, RAIN.RDY weather technology and explicit Regular fit. Source: [adidas JR9087](https://www.adidas.com.tr/en/terrex-anylander-rain.rdy-hiking-shoes/JR9087.html); existing evidence source `adidas_terrex_anylander_rainrdy_jr9087_official`.

Eight **new family-level structured facts** and eight **new first-party evidence rows**; three additional governed technical-value codes (`lightstrike_pro`, `traxion`, `rain_rdy`) with English and Greek controlled labels. No new vendor-level duplication, no invented size conversion, no new ordinal cushioning/stability grades.

The exact IF6748 manufacturer regions give differing drop/weight measurements and size advice. **Those pre-existing provenance conflicts remain untouched**; we added only unambiguous technology and Regular fit. Similarly Regular fit does **not** imply standard width or true-to-size length. Named RAIN.RDY technology is distinct from waterproof certification; JR9087's existing independently evidenced `weather_protection=waterproof` fact was retained.

### Evidence-backed explanation and projection fix

The Studio catalogue projection previously dropped `footwear_technology` and `footwear_fit_profile` entirely, meaning named technical knowledge could not reach the recommendation's consultation summary. It also treated an enum as scalar despite the existing multi-valued `footwear_technology` family attribute.

Now the existing indexed/family attribute SQL aggregates `footwear_technology` into an ordered controlled array and explicitly projects both named technologies and the qualitative manufacturer fit-profile. The explanation layer surfaces them only when **matching active evidence** is present.

**Important correctness fix:** Previously, `directSourceFeaturePhrases` turned raw vendor descriptions containing “Cloudfoam”, “memory foam” or “arch support” into seemingly authoritative explanatory technical facts. That path was removed. Manufacturer terms may now appear in the human explanation only when supported by structured evidence; they **never** change technical eligibility or automatically grade cushioning, support, fit width or weather. Regresion tests verify the distinction.

### Validation

The checked-in schema **0448 → 0449 → 0450 → 0451** was executed as one transaction on the populated live Supabase catalogue and terminated with **ROLLBACK**. All existing guards passed, including 8 exact controlled fact inserts and 8 associated manufacturer evidence insertions. Database state was unchanged.

The runtime schema gate and SHA-256 manifests match new migration **0451**. New regression tests cover explicit manufacturer terminology with and without evidence, qualitative fit not being turned into width, and the unchanged technical ranking when only technology names differ. GitHub automated test execution needs to be checked on the final PR commit before merge.

### Remaining high-value gaps

* Exact-size variant selector must be tested against live inventory changes, rather than trusting a static family size.
* Confirm the full all-sport candidate pool is not overrepresented by running apparel after category round-robin, and benchmark SQL runtime.
* Structured compatibility edges require reviewed per-sport semantic evidence (rather than inferring arbitrary requires/recommends relationships).
* Surface-specific hard rules need expanded tests for wet artificial football fields, hard/clay tennis, trail/road, indoor volleyball and unknown surfaces.
* Manufacturer model-generation and width evidence still unknown for many relevant families. Do not invent it.
