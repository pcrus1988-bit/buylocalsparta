-- Paint & Build: tighten generic compatibility and repair-product claims.
-- Production migration version: 20260923072949.
update public.build_solution_steps set technical_rule=case id
when '77bd11a3-4b23-4a10-8528-b43160e8dca4' then 'Check for moisture/contamination and identify loose, peeling or otherwise unsound existing coating before repainting.'
when 'af1a8983-2e54-4ced-9e36-3733212e0754' then 'Where compatibility of a retained existing coating with the selected system is uncertain, use the selected manufacturer system guidance to determine whether a test area or other compatibility check is required.'
when '8ef2091e-af78-4ed4-b591-ae2fa5c78056' then 'Repair local defects as needed so the remaining surface is sound and suitably prepared before repainting; exact repair material must be selected from documented substrate/product compatibility.'
when 'cdf16bd8-102c-4b58-b18b-ee00223ed348' then 'Repair local defects as needed so the remaining surface is sound and suitably prepared before repainting; exact repair material must be selected from documented substrate/product compatibility.'
when '1f0b2a16-6547-46ef-a95a-b376444d5138' then 'Patch or fill the confirmed local non-structural repair using a product whose documented instructions cover the identified background and repair depth.'
end where id in ('77bd11a3-4b23-4a10-8528-b43160e8dca4','af1a8983-2e54-4ced-9e36-3733212e0754','8ef2091e-af78-4ed4-b591-ae2fa5c78056','cdf16bd8-102c-4b58-b18b-ee00223ed348','1f0b2a16-6547-46ef-a95a-b376444d5138');

update public.general_build_rule_evidence set applicability=case entity_id
when '77bd11a3-4b23-4a10-8528-b43160e8dca4' then 'Supports identifying/removing unsound existing coating and preparing a clean, sound surface. A generic adhesion/compatibility test is not inferred unless the selected system requires it.'
when 'af1a8983-2e54-4ced-9e36-3733212e0754' then 'Supports preparation of retained coating; any compatibility/test-area requirement is delegated to documented selected-system guidance rather than asserted generically.'
when '8ef2091e-af78-4ed4-b591-ae2fa5c78056' then 'Supports restoring a sound/prepared surface before repainting. The citation does not establish one universal repair material; exact repair-product compatibility remains product/substrate specific.'
when 'cdf16bd8-102c-4b58-b18b-ee00223ed348' then 'Supports restoring a sound/prepared surface before repainting. The citation does not establish one universal repair material; exact repair-product compatibility remains product/substrate specific.'
when '1f0b2a16-6547-46ef-a95a-b376444d5138' then 'Supports patching/filling minor repairs. Suitability for a specific background/depth must come from the selected repair product documentation rather than this generic source.'
else applicability end where active and entity_type='solution_step' and entity_id in ('77bd11a3-4b23-4a10-8528-b43160e8dca4','af1a8983-2e54-4ced-9e36-3733212e0754','8ef2091e-af78-4ed4-b591-ae2fa5c78056','cdf16bd8-102c-4b58-b18b-ee00223ed348','1f0b2a16-6547-46ef-a95a-b376444d5138');