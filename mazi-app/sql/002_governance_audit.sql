-- MAZI: immutable accountability for genuine governance operations.
create or replace function public.mazi_audit_governance_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare entity uuid;
begin
  if tg_table_name='mazi_proposals' then
    entity:=new.id;
  elsif tg_table_name='mazi_members' then
    entity:=new.user_id;
  elsif tg_table_name='mazi_cycles' then
    entity:=new.id;
  elsif tg_table_name='mazi_membership_applications' then
    entity:=new.id;
  else
    raise exception 'unsupported audited table';
  end if;
  insert into public.mazi_audit_events(actor_user_id,entity_type,entity_id,action,evidence)
  values(auth.uid(),tg_table_name,entity,tg_op,
    jsonb_build_object(
      'old_status',case when tg_op='UPDATE' then to_jsonb(old)->>'status' else null end,
      'new_status',to_jsonb(new)->>'status',
      'voting_eligible',to_jsonb(new)->>'voting_eligible'
    ));
  return new;
end; $$;
revoke all on function public.mazi_audit_governance_change() from public,anon,authenticated;
create trigger mazi_audit_applications after insert or update on public.mazi_membership_applications
for each row execute function public.mazi_audit_governance_change();
create trigger mazi_audit_members after insert or update on public.mazi_members
for each row execute function public.mazi_audit_governance_change();
create trigger mazi_audit_proposals after insert or update on public.mazi_proposals
for each row execute function public.mazi_audit_governance_change();
create trigger mazi_audit_cycles after update on public.mazi_cycles
for each row execute function public.mazi_audit_governance_change();
