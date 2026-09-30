-- Paint & Build: correct work-at-height provenance.
-- Directive 2009/104/EC Annex II §4.1 has occupational/work-equipment scope.
-- Outside that scope KONTA MOY uses the same principle conservatively, not as a claim of Greek DIY law.

insert into public.general_build_sources (
  id, source_key, organization, source_type, title, url, jurisdiction,
  standard_identifier, publication_date, revision, retrieved_at,
  relevant_section_page, source_status, notes, active
)
values (
  gen_random_uuid(),'eu_directive_2009_104_work_at_height','European Union (EUR-Lex)',
  'government_guidance',
  'Directive 2009/104/EC — minimum safety and health requirements for the use of work equipment by workers at work',
  'https://eur-lex.europa.eu/legal-content/EL/ALL/?uri=celex%3A32009L0104',
  'European Union — occupational/workplace scope','Directive 2009/104/EC',date '2009-09-16',
  'Codified act; current EUR-Lex text',now(),'Annex II, section 4.1.1 — temporary work at height',
  'current',
  'Authoritative EU legal source stored under the existing government_guidance source-type taxonomy. Legal scope concerns workers/work equipment. Do not present as a universal Greek consumer/DIY legal duty; outside occupational scope it supports only the conservative safe-access principle.',
  true
)
on conflict (source_key) do update set
  organization=excluded.organization,source_type=excluded.source_type,title=excluded.title,url=excluded.url,
  jurisdiction=excluded.jurisdiction,standard_identifier=excluded.standard_identifier,
  publication_date=excluded.publication_date,revision=excluded.revision,retrieved_at=excluded.retrieved_at,
  relevant_section_page=excluded.relevant_section_page,source_status=excluded.source_status,
  notes=excluded.notes,active=true,updated_at=now();

update public.general_build_rule_evidence e set active=false
where e.entity_type='solution_step'
and e.entity_id in (
 select s.id from public.build_solution_steps s join public.build_solution_profiles p on p.id=s.scenario_id
 where (p.scenario_key='waterproof_exterior_wall_rain_penetration' and s.step_number=2)
    or (p.scenario_key='insulation_external_etics' and s.step_number=3)
)
and e.source_id in (select id from public.general_build_sources where source_key in ('rics_damp_mould','eae_etics_application_guideline'));

insert into public.general_build_rule_evidence
(id,entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active,created_at)
select gen_random_uuid(),'solution_step',s.id,src.id,
'For temporary work at height that cannot be carried out safely from a suitable surface, the most suitable work equipment must be selected to ensure and maintain safe working conditions; the means of access must be selected so that passage does not create additional fall risk.',
'Annex II §4.1.1','regulatory',
'Direct regulatory scope: workers using work equipment for temporary work at height in the EU occupational-safety framework. For KONTA MOY consumer guidance, use only as evidence for the general safe-access/fall-risk principle; do not describe it as a universal Greek DIY legal obligation.',
true,now()
from public.build_solution_steps s
join public.build_solution_profiles p on p.id=s.scenario_id
cross join public.general_build_sources src
where src.source_key='eu_directive_2009_104_work_at_height'
and ((p.scenario_key='waterproof_exterior_wall_rain_penetration' and s.step_number=2)
  or (p.scenario_key='insulation_external_etics' and s.step_number=3))
and not exists (select 1 from public.general_build_rule_evidence x where x.entity_type='solution_step' and x.entity_id=s.id and x.source_id=src.id and x.active);

update public.build_solution_steps s set evidence_strength='regulatory'
from public.build_solution_profiles p
where p.id=s.scenario_id
and ((p.scenario_key='waterproof_exterior_wall_rain_penetration' and s.step_number=2)
  or (p.scenario_key='insulation_external_etics' and s.step_number=3));
