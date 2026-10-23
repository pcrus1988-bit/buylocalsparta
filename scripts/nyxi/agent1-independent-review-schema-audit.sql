-- NYXI: missing review columns keep public excerpts on HOLD.
with required(name) as (values ('snapshot_sha256'),('fragment_sha256'),
 ('reviewer_user_id'),('public_excerpt_authorized'),('rights_evidence_sha256'))
select r.name as missing_column from required r
where not exists (select 1 from information_schema.columns c
 where c.table_schema='public'
 and c.table_name='nyxi_fragment_publication_approvals'
 and c.column_name=r.name)
order by r.name;
