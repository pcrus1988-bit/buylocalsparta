# Ελληνικό Λιανεμπόριο 2026 — Statistical evaluation annex

**Research edition:** 30 October 2026, final analysis.  
**Nature:** post-fieldwork, *exploratory supplementary evaluation* of an already-frozen study; not a preregistered primary endpoint and not a modification of the publication snapshot.  
**Public release:** 1 November 2026, 00:00:01 Europe/Athens. Remain unpublished before that date.  
**Data provenance:** production research database; final analysis `d27552a7-fe23-437e-99f5-99389417bf88`; finalized version `greek-retail-2026-analysis-v10-public-n5-sparse-pool`; release `d7cc81dd-233d-4ab8-b8e1-24235ee8c587`. Queries use ONLY the weight_version bound to that exact final analysis. No individual responses or identifiers are reproduced in this annex.

## 1. Final analysis base

| Research-stage count | Observed |
|---|---:|
| Selected from main contactable census frame | 182,852 |
| Unique invitations sent | 145,805 |
| Delivered | 137,359 |
| Survey starts | 1,265 |
| Completed questionnaires | 656 |
| Included after final QA | **650** |
| Excluded after final QA | 6 |
| Public descriptive estimates (not including private EXP01) | 18,777 |

*The 0.45% completion/sent ratio is not a conventional population response rate.* Delivery, contactability, nonresponse, administrative finalization and early closure require separate disclosure. Population-calibrated weights cannot prove that participating and nonparticipating firms are comparable.

Weight diagnostics across the final 650 included questionnaires: sum of final weights 253,327; Kish effective n = **543.4**; minimum weight 116.9533, maximum 1,369.5291 (maximum/minimum = **11.71**); 18 weights exceed 1,000. Kish effective n measures unequal-weight concentration only; it is **not** a design-valid standard error or nonresponse-bias correction.

## 2. Post-fieldwork exploratory *paired* estimates

These estimates compare **answers from the same respondents**, not two unrelated national marginal percentages. They use final weights and exclude missing, undecided or refused categories when the question requires a direction.

| Exploratory association | Definition | Valid unweighted n | Matching n | Weighted descriptive result | Unweighted descriptive result |
|---|---|---:|---:|---:|---:|
| Digital tax / stock mismatch | Q05 tax = yes; Q05 stock_sync ∈ {no, partial}, among tax = yes and answered stock_sync ∈ {yes, partial, no} | 521 | 384 | **72.97%** | 73.70% (384/521) |
| Cost–profit squeeze | Q21 operating_costs = increased AND profitability = decreased, among both components ∈ {increased, stable, decreased} | 612 | 292 | **47.73%** | 47.71% (292/612) |
| Pessimism with declining profitability | Q19 pessimistic or very_pessimistic, among Q21 profitability = decreased and Q19 informative | 295 | 143 | **48.48%** | 48.47% (143/295) |
| Pessimism without declining profitability | Q19 pessimistic or very_pessimistic, among Q21 profitability = stable or increased and Q19 informative | 296 | 47 | **15.86%** | 15.88% (47/296) |

**Arithmetic clarification:** the unweighted tax/stock mismatch is 384/521 = **73.70%**, not 73.00%. Any previous 73.00% unweighted value should be treated as erroneous. The weighted value is 72.97%. For pessimism the weighted **descriptive** difference is 32.62 percentage points. No causal, statistical-significance, or population-level inferential claim is supported.

The stock-sync wording matters: `partial` signifies **partially** synchronized, not absence of any inventory system.

## 3. Denominator sensitivity of preregistered/approved marginals

The official categorical matrix percentages are proportions of all respondents answering the respective Q21 item, including `unknown` and `prefer_not` as legitimate categories in the denominator. Alternative *valid-direction-only* percentages exclude those categories. These are different estimands.

| Q21 response | Official all-category denominator | Valid-direction-only sensitivity |
|---|---:|---:|
| Operating costs increased | **82.20%** (n=650) | **85.15%** (n=629) |
| Profitability decreased | **47.15%** (n=650) | **50.00%** (n=614) |

Keep 82.20% and 47.15% labelled as **all-response-category shares** in the official report; show 85.15% and 50.00% only as sensitivity checks, not corrections of the frozen published outputs. This avoids silently coding `unknown` as evidence of no increase/decrease.

In Q05, official national tax fully digitized = **81.79%** (n=649) and stock fully synchronized = **23.64%** (n=646). These independent marginal percentages must **never** be subtracted to claim the paired mismatch; use the separate 521-case paired calculation above.

## 4. Geographic disclosure audit

For `digital_readiness.mean` at single-prefecture resolution:
- 53 distinct normalized codes appear in the estimate table;
- 37 have published values, and 16 are suppressed;
- **35 of the 37** published categories have n=5–29; just **two** have bases of 30 or more;
- **zero** published values have n below five.

A public map must make these small bases salient, avoid reliability-implying rank ordering, show missing areas as missing (not zero), and distinguish participation density from weighted survey indicators.

A separate source-context check found 624 `research_response_design_context` rows among 650 weighted responses, seven with missing/unknown source-prefecture. This does **not** prove 26 records are absent from final geography, because the final analysis may derive geography through frozen-frame joins or correction overlays. Verify that full provenance path before claiming 650/650 geocoded; never backfill the immutable context rows by inference.

## 5. Limitations and publication language

- The main recruitment was effectively an email-based census of contactable eligible records, not a clean realized probability sample of responders.
- Overall completion/sent is low and nonresponse bias may remain after calibration.
- Several originally frozen sampling strata had no respondents; the final release documents post-fieldwork sparse-strata pooling and calibration to administrative-region margins. State this as a methodological deviation, not as preregistered weighting.
- No design-valid variance estimates or standard confidence intervals were approved for the public descriptive percentages. Do not invent 95% intervals, p-values, rankings or causal interpretations.
- Administrative completion of saved questionnaires and the owner-directed fieldwork close at **17:06:23 Athens on 30 October**, rather than the originally planned 18:00, belong in the permanent methodological history.
- Q18 comments require independent content moderation, appropriate suppression and contextualized qualitative analysis; the current quantitative cross-tables say nothing about those open responses.
- The existing release's dataset and artifact hashes remain authoritative; this annex alone does not amend them or authorize early public exposure.

## 6. Reproducibility SQL (restricted analyst use)

These are **read-only aggregate queries**. Do not execute them from a public route or transmit row-level responses to the browser. All denominators and counts can be regenerated with the pinned analysis weight version:

```sql
WITH latest AS (
  SELECT weight_version
  FROM research_analysis_runs
  WHERE id = 'd27552a7-fe23-437e-99f5-99389417bf88'
    AND status = 'succeeded'
),
paired_q05 AS (
  SELECT w.response_id, w.final_weight,
         a.answer ->> 'tax' AS tax,
         a.answer ->> 'stock_sync' AS stock_sync
  FROM research_weights w
  JOIN latest l ON l.weight_version = w.version
  JOIN research_answers a ON a.response_id = w.response_id
  JOIN research_questions q ON q.id = a.question_id AND q.code = 'Q05'
)
SELECT COUNT(*) AS valid_n,
       COUNT(*) FILTER (WHERE stock_sync IN ('no','partial')) AS matching_n,
       ROUND(100 * SUM(final_weight) FILTER (WHERE stock_sync IN ('no','partial'))
        / NULLIF(SUM(final_weight),0), 2) AS weighted_percent
FROM paired_q05
WHERE tax = 'yes'
  AND stock_sync IN ('yes','partial','no');
```

```sql
WITH latest AS (
  SELECT weight_version
  FROM research_analysis_runs
  WHERE id = 'd27552a7-fe23-437e-99f5-99389417bf88'
    AND status = 'succeeded'
),
paired_q21 AS (
  SELECT w.final_weight,
         a.answer ->> 'operating_costs' AS costs,
         a.answer ->> 'profitability' AS profit
  FROM research_weights w
  JOIN latest l ON l.weight_version = w.version
  JOIN research_answers a ON a.response_id = w.response_id
  JOIN research_questions q ON q.id = a.question_id AND q.code = 'Q21'
)
SELECT COUNT(*) AS valid_n,
       COUNT(*) FILTER (WHERE costs='increased' AND profit='decreased') AS matching_n,
       ROUND(100 * SUM(final_weight) FILTER
         (WHERE costs='increased' AND profit='decreased')
         / NULLIF(SUM(final_weight),0), 2) AS weighted_percent
FROM paired_q21
WHERE costs IN ('increased','stable','decreased')
  AND profit IN ('increased','stable','decreased');
```

```sql
WITH latest AS (
  SELECT weight_version
  FROM research_analysis_runs
  WHERE id = 'd27552a7-fe23-437e-99f5-99389417bf88'
    AND status='succeeded'
),
paired AS (
  SELECT w.final_weight, a.answer->>'profitability' AS profit,
         trim(both '"' from b.answer::text) AS optimism
  FROM research_weights w
  JOIN latest l ON l.weight_version=w.version
  JOIN research_answers a ON a.response_id=w.response_id
    AND a.question_id IN (SELECT id FROM research_questions WHERE code='Q21')
  JOIN research_answers b ON b.response_id=w.response_id
    AND b.question_id IN (SELECT id FROM research_questions WHERE code='Q19')
)
SELECT CASE WHEN profit='decreased' THEN 'profit_decreased'
            ELSE 'profit_stable_or_increased' END AS group_name,
       COUNT(*) AS valid_n,
       COUNT(*) FILTER (WHERE optimism IN ('pessimistic','very_pessimistic')) AS pessimistic_n,
       ROUND(100 * SUM(final_weight) FILTER
         (WHERE optimism IN ('pessimistic','very_pessimistic'))
         / NULLIF(SUM(final_weight),0), 2) AS weighted_pessimism_percent
FROM paired
WHERE profit IN ('decreased','stable','increased')
  AND optimism IN ('very_pessimistic','pessimistic','neutral','optimistic','very_optimistic')
GROUP BY 1 ORDER BY 1;
```

**Approval status:** Scientific exploratory annex only. Explicit separate approval and a versioned new aggregate release would be required to add these paired results to public graphics; the immutable release snapshot is unchanged.
