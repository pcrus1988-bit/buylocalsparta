-- Paint & Build evidence taxonomy correction.
-- EU-OSHA guidance is authoritative guidance but is not itself the binding legal act.
-- EUR-Lex Directive evidence remains regulatory.
update public.general_build_rule_evidence e
set evidence_strength='strong_consensus',
    applicability = case
      when e.applicability is null or btrim(e.applicability)='' then
        'EU-OSHA guidance supports the general safety principle. It is not itself a universal Greek consumer/DIY legal duty; exact PPE/access controls remain task-, site- and SDS-dependent.'
      else e.applicability || ' Evidence-authority note: EU-OSHA guidance is used as strong professional/government guidance, not as the binding legal act itself.'
    end
where e.active
  and e.evidence_strength='regulatory'
  and e.source_id in (
    select id from public.general_build_sources
    where source_key in ('eu_osha_ppe_selection','eu_osha_work_at_height')
  );
