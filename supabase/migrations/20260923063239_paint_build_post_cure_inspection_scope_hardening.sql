-- Paint & Build: tighten semantic scope of post-application visual checks.
-- Production migration version: 20260923063239
-- These checks remain GENERAL_GUIDANCE because the schema deliberately reserves
-- internal governance evidence for stop conditions. The wording now makes clear
-- that timing/readiness remains manufacturer-controlled Layer B.

update public.build_solution_steps set technical_rule=case id
when '330cc2ab-a35b-4a16-be00-f18ef608c6ea' then 'After the selected coating has reached the manufacturer-defined inspection stage, visually recheck the repaired area for renewed peeling or visible failure.'
when '23d4f95a-c477-4704-bf39-87b898e4758e' then 'After the selected coating has reached the manufacturer-defined inspection stage, visually recheck the finish for visible non-uniformity or joint-related defects.'
when 'eb6b0ebd-efce-4804-ba7e-969aceea951b' then 'After the selected protective coating has reached the manufacturer-defined inspection stage, visually recheck edges and previously affected points for visible coating or corrosion defects.'
when 'c231e626-0bf2-4efd-ad92-3464a5d5ef4c' then 'After the selected wood finish has reached the manufacturer-defined inspection stage, visually recheck the retained/recoated surface for visible loss of continuity or renewed defects.'
when '981c0565-ff85-484d-a37f-42bc016778ba' then 'After the repair has reached the manufacturer-defined inspection stage, visually recheck the repaired area for visible cracking, detachment or moisture recurrence.'
end,
evidence_strength='context_dependent'
where id in ('330cc2ab-a35b-4a16-be00-f18ef608c6ea','23d4f95a-c477-4704-bf39-87b898e4758e','eb6b0ebd-efce-4804-ba7e-969aceea951b','c231e626-0bf2-4efd-ad92-3464a5d5ef4c','981c0565-ff85-484d-a37f-42bc016778ba');

update public.general_build_rule_evidence
set applicability=case entity_id
when '330cc2ab-a35b-4a16-be00-f18ef608c6ea' then 'Supports visually rechecking the same peeling/unsound condition addressed by the preparation workflow. Exact inspection timing remains manufacturer-controlled Layer B.'
when '23d4f95a-c477-4704-bf39-87b898e4758e' then 'Supports finish-quality context for prepared gypsum board. Exact coating readiness/inspection timing remains manufacturer-controlled Layer B.'
when 'eb6b0ebd-efce-4804-ba7e-969aceea951b' then 'Supports rechecking the prepared/protected steel surface for visible coating/corrosion defects. Exact cure/inspection timing remains manufacturer-controlled Layer B.'
when 'c231e626-0bf2-4efd-ad92-3464a5d5ef4c' then 'Supports rechecking retained/refinished wood condition for visible defects. Exact cure/inspection timing remains manufacturer-controlled Layer B; this is not Greek code.'
when '981c0565-ff85-484d-a37f-42bc016778ba' then 'Supports rechecking the repaired non-structural wall area for recurrence of the condition that required repair. Exact cure/inspection timing remains manufacturer-controlled Layer B.'
else applicability end,
evidence_strength='context_dependent'
where active and entity_type='solution_step' and entity_id in ('330cc2ab-a35b-4a16-be00-f18ef608c6ea','23d4f95a-c477-4704-bf39-87b898e4758e','eb6b0ebd-efce-4804-ba7e-969aceea951b','c231e626-0bf2-4efd-ad92-3464a5d5ef4c','981c0565-ff85-484d-a37f-42bc016778ba');