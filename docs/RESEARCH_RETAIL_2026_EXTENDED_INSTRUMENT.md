# Greek Retail 2026 — economic and sentiment extension

Instrument **0.3.0** is a new pre-fieldwork revision, not an alteration of the historical **0.2.0** questionnaire. Migration 0435 only installs it when the study is in **draft** and has no survey responses in the active wave. The attached analysis plan **greek-retail-2026-plan-v3-sentiment** is intentionally a **draft** until approved by the administrator after pilot QA; it must be locked before fieldwork.

## Research questions and data

| Claim we want to investigate | Inputs | Prespecified estimate and caveat |
| --- | --- | --- |
| Merchant optimism for the next 12 months | Q20, Q17, Q21 | Business Confidence Index (0–100) and separate distributions; not a verified forecast |
| Revenue rising while profit is falling | Q19 turnover + profitability | Joint self-reported share; no audited accounts or causality |
| E-commerce as opportunity, necessity, unaffordable cost | Q23, Q03, Q04 | Independent five-point agreement statements, by employee band/region/sector |
| Marketplace profitability and dependence | Q13, Q25, Q28 | Conditional n for current/former users; change and share of sales are self-reported |
| Small-town vs Athens | Q22 + frozen region codes | Descriptive comparison, not municipality verified or representative without sufficient samples |
| Barriers to first digital sale | Q03/Q24 | Only businesses reporting no digital selling channels, multi-response percentages |
| Whether visibility supports local business | Q26/Q11/Q12 | Self-reported in-store effect for online sellers, not experimental impact |
| Economic pressures | Q27 and Q19 | Top-three operational pressures by sector and geography |

## Routing

- Q24 appears only when Q03 has no own e-shop, marketplace or social-selling channel.
- Q25 appears for Q13=current or past.
- Q28 appears for Q13=current only.
- Q26 appears when Q03 includes at least one online-selling channel.
- Both client and server validate conditional requirements. Before completing a response, inapplicable stored answers are removed. Existing historical responses are untouched.

## Score definition

Business Confidence Index v1 is the simple average of **at least two of three** 0–100 components: Q20 optimism (0–10 × 10), Q17 next-year sales expectation (0,25,50,75,100) and Q21 next-year profit expectation (same coding). Missing/unknown is excluded and not treated as neutral. It is a descriptive psychometric composite, subject to reliability/pilot review; it is not a standard published national confidence index.

Economic divergence is defined only for respondents who estimate both measures: Q19 turnover **up_large/up_small** and profitability **down_small/down_large**. Unknown/prefer-not-answer respondents are excluded from the denominator.

Do not claim causal effects, report conditional-domain estimates as population-wide, or publish small cells. Weighting, 95% uncertainty/withholding, QA gating and the existing minimum unweighted public base of 30 remain in force. Region/sector pairwise comparisons are exploratory, while local settlement domains are descriptive and require additional survey-design validation before statistical inference.

## Acceptance steps before launch

1. Deploy migration 0435 after confirming active wave status is draft and has no real survey responses; otherwise create a new wave before changing the questionnaire.
2. Inspect the Admin Questions view for Q19–Q28 and the linked Analysis Plan v3. Validate routing in the read-only simulation preview and real isolated pilot.
3. Review each translated Greek prompt with a retail-sector adviser. Time the questionnaire on desktop/mobile and check missingness and order effects.
4. Validate the new confidence composite on pilot data; lock or revise and *then* lock the instrument and associated analysis plan as a pair.
5. Do not combine response data from 0.2.0 with 0.3.0 without an explicit cross-version harmonisation rule.
6. After main fieldwork, check QC, calibration, conditional denominators, confidence intervals, narrative interpretation and suppression before publication.
