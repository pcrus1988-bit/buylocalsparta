# KONTA MOY Paint & Build — five layer-separated example projects

These examples document the customer-guide contract for the first research batch.

They are deliberately conservative:

- `GENERAL_GUIDANCE` contains brand-independent project knowledge backed by `general_build_rule_evidence`.
- `MANUFACTURER_VITEX` contains only verified Vitex product instructions. At the time of this snapshot no verified Vitex application profiles are present in production, so exact product values are intentionally unavailable.
- `KONTA_MOU_RULE` contains decision/safety gates. These rules may block product selection while still allowing the customer to read diagnostic or preparation guidance.
- No example invents dilution, number of coats, coverage, package sizes, recoat time, cure time, temperature limits or a Vitex compatibility claim.

## Example 1 — Sound interior wall repaint

Scenario: `paint_interior_repaint_sound`  
Expected resolver status before product selection: `ready`

### GENERAL_GUIDANCE

1. Check first that there is no moisture, mould, active cracking or coating failure that changes the project pathway.
   - Evidence: `sherwin_surface_prep`
2. Protect floors, furniture, openings and adjacent surfaces.
   - Evidence: `sherwin_surface_prep`
3. Remove material that is peeling or not firmly adhered.
   - Evidence: `sherwin_surface_prep`
4. Clean dust, grease and contaminants that may affect adhesion.
   - Evidence: `sherwin_surface_prep`
5. Repair local holes/defects where required and let the prepared surface reach the condition required for the next layer.
   - Evidence: `sherwin_surface_prep`
6. Primer is conditional: use it when the substrate condition or the selected verified coating system requires it.
   - Evidence: `sherwin_surface_prep`
7. Apply the finish coating only according to the verified manufacturer instructions for the selected product.
   - Evidence: `sherwin_surface_prep` + KONTA MOU manufacturer-boundary governance

### MANUFACTURER_VITEX

Status: `not_selected`

Customer message:

> Η ακριβής ποσότητα, η αραίωση, οι στρώσεις και οι χρόνοι θα εμφανιστούν αφού επιλεγεί συγκεκριμένο προϊόν με επαληθευμένες οδηγίες VITEX.

No exact Vitex values are emitted.

### KONTA_MOU_RULE

No stop condition is triggered by the default example facts.

If a specific product is later selected but its current verified manufacturer application profile is missing, `manufacturer_application_data_missing` becomes `BLOCK`; the Studio may continue to show general guidance but must hide exact product application values.

---

## Example 2 — Interior moisture/mould with unknown significant moisture source

Scenario: `paint_interior_mould_damp`  
Example facts:

```json
{"source_known": false, "significant_moisture": true}
```

Expected resolver status: `blocked`

### GENERAL_GUIDANCE

1. Check conceptually for condensation, plumbing leakage, rain penetration, thermal bridging and insufficient ventilation without treating appearance alone as proof of cause.
   - Evidence: `epa_mould_cleanup`, with wider diagnostic context from `rics_damp_mould` / `iso_13788_2012`
2. Correct the moisture source before decorative painting.
   - Evidence: `epa_mould_cleanup`
3. Clean/remediate mould appropriately for the extent and surface. Severe or persistent cases require professional assessment.
   - Evidence: `epa_mould_cleanup`
4. Allow the surface to dry after the cause and contamination have been addressed.
   - Evidence: `epa_mould_cleanup`
5. Only then may a compatible coating system be considered.
   - Evidence: `epa_mould_cleanup`

### MANUFACTURER_VITEX

Status: `not_selected`

No anti-mould paint, primer or coating is presented as a cure for an unresolved moisture source. Exact product instructions remain unavailable until a verified product is selected.

### KONTA_MOU_RULE

Triggered rule: `significant_moisture_source_uncertain` — `BLOCK`

Customer message:

> Η σημαντική υγρασία έχει αβέβαιη αιτία. Διερεύνησε αν πρόκειται για συμπύκνωση, διαρροή, βροχή, ανερχόμενη υγρασία ή άλλη πηγή πριν συνεχίσεις.

The block prevents a product-first recommendation; it does not claim to diagnose the moisture mechanism.

---

## Example 3 — Rusty ferrous metal

Scenario: `paint_metal_rusty`  
Expected resolver status before product selection: `ready`

### GENERAL_GUIDANCE

1. Identify the metal and assess the extent of corrosion.
   - Evidence: `iso_12944_4_2017`
2. Protect the work area from preparation debris.
   - Evidence: `iso_12944_4_2017`
3. Remove corrosion and failed coating to the preparation condition required by the selected protective system.
   - Evidence: `iso_12944_4_2017`
4. Remove contaminants and preparation residue before coating.
   - Evidence: `iso_12944_4_2017`
5. Verify that the prepared surface meets the selected system's requirement.
   - Evidence: `iso_12944_4_2017`
6. Primer, intermediate coats and finish coats are system-specific.
   - Evidence: `iso_12944_4_2017`
7. Environmental limits and curing times come from the selected product/system.
   - Evidence: general corrosion-protection framework + manufacturer-boundary governance

### MANUFACTURER_VITEX

Status: `not_selected`

The Studio must not invent a surface-preparation grade, primer, dilution, film build, coat count or recoat interval for a Vitex product.

### KONTA_MOU_RULE

No default stop is triggered. If the metal is part of a condition suggesting structural damage, the project must switch to an appropriate professional-assessment pathway rather than treating it as ordinary cosmetic corrosion.

---

## Example 4 — Standing water on a flat roof before drainage/falls assessment

Scenario: `waterproof_roof_standing_water`  
Example facts:

```json
{"standing_water": true, "drainage_or_falls_assessed": false}
```

Expected resolver status: `blocked`

### GENERAL_GUIDANCE

1. Identify where and how long water remains and check whether outlets/drainage are functioning.
   - Evidence: `lrwa_flat_roof_falls`
2. Assess falls, deformation and local low points before specifying a new waterproofing application.
   - Evidence: `lrwa_flat_roof_falls`
3. Correct a drainage/falls problem where necessary before relying on a new coating.
   - Evidence: `lrwa_flat_roof_falls`
4. After drainage/falls assessment, confirm that the selected waterproofing system is permitted for the actual ponding/exposure condition.
   - Evidence: `lrwa_flat_roof_falls` + manufacturer-boundary governance

### MANUFACTURER_VITEX

Status: `not_selected`

No Vitex waterproofing product is claimed to tolerate standing water. Any such tolerance must be present in the verified manufacturer evidence for the exact selected system.

### KONTA_MOU_RULE

Triggered rule: `roof_ponding_unresolved` — `BLOCK`

Customer message:

> Τα λιμνάζοντα νερά δεν έχουν αξιολογηθεί ως προς κλίσεις και απορροές. Έλεγξε κλίσεις, παραμορφώσεις και λειτουργία απορροών πριν επιλεγεί στεγανωτικό σύστημα.

---

## Example 5 — Exterior ETICS with unsafe access not yet resolved

Scenario: `insulation_external_etics`  
Example facts:

```json
{"work_at_height": true, "safe_access_confirmed": false}
```

Expected resolver status: `blocked`

### GENERAL_GUIDANCE

1. Assess substrate, moisture, geometry, thermal bridges and critical details before system selection.
   - Evidence: `eae_etics_application_guideline`
2. Select an assessed ETICS as a complete system; do not assemble arbitrary components.
   - Evidence: `eae_etics_application_guideline`, EAD/ETA context
3. Prepare the substrate according to the selected ETICS instructions.
   - Evidence: `eae_etics_application_guideline`
4. Install adhesive/boards, mechanical fixings where required, reinforced base layer/mesh and finishing layers as one documented system.
   - Evidence: `eae_etics_application_guideline`
5. Observe system-specific weather protection and curing requirements.
   - Evidence: `eae_etics_application_guideline` + manufacturer-boundary governance
6. Inspect continuity, details and the completed finish.
   - Evidence: `eae_etics_application_guideline`

### MANUFACTURER_VITEX

Status: `not_selected`

No Vitex ETICS component, fixing pattern, adhesive consumption, mesh overlap, layer thickness, drying interval or weather limit is emitted until supported by current verified manufacturer documentation for the selected system.

### KONTA_MOU_RULE

Triggered rule: `unsafe_work_at_height` — `BLOCK`

Customer message:

> Η εργασία απαιτεί πρόσβαση σε ύψος χωρίς επιβεβαιωμένο ασφαλές σύστημα πρόσβασης/προστασίας από πτώση. Μην προχωρήσεις ως DIY workflow.

Evidence: `eu_osha_work_at_height`.

---

## Resolver expectations demonstrated by these examples

- A safety block does not erase Layer A; the customer may still read diagnosis/preparation information needed to understand the next action.
- A safety block suppresses the implication that purchasing products is the next valid step.
- Layer B is never back-filled from general knowledge.
- Exact product quantity is unavailable until a verified manufacturer profile provides the necessary coverage/consumption and layer/coat inputs.
- A conflict between Layer A and verified Layer B returns `review_required`; it is never silently reconciled.
- `partial` evidence scenarios remain labelled as such and receive an explicit uncertainty warning.
