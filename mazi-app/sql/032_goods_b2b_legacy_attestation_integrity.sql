-- MAZI 032: distinguish legacy v1 acceptance from NEW explicit B2B v2
-- acknowledgement in immutable evidence. Never falsely attest to historical v1.
alter table public.mazi_goods_terms_acceptances
 alter column b2b_explicitly_acknowledged drop default;
alter table public.mazi_goods_terms_acceptances
 drop constraint if exists mazi_goods_terms_acceptances_b2b_explicitly_acknowledged_check;
alter table public.mazi_goods_terms_acceptances
 add constraint mazi_terms_version_and_b2b_evidence check(
  (version='mazi-goods-v1' and b2b_explicitly_acknowledged=false) or
  (version='mazi-goods-v2' and b2b_explicitly_acknowledged=true)
 ) not valid;
create or replace function mazi_private.log_goods_terms_acceptance()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if NEW.goods_policy_version not in ('mazi-goods-v1','mazi-goods-v2') or
   NEW.goods_policy_accepted_at is null then return NEW; end if;
 insert into public.mazi_goods_terms_acceptances(
  listing_id,member_user_id,action,version,accepted_at,b2b_explicitly_acknowledged
 ) values (
  NEW.id,NEW.member_user_id,
  case when TG_OP='INSERT' then 'created' else 'edited' end,
  NEW.goods_policy_version,NEW.goods_policy_accepted_at,
  NEW.goods_policy_version='mazi-goods-v2'
 );
 return NEW;
end;$$;
revoke all on function mazi_private.log_goods_terms_acceptance() from PUBLIC,anon,authenticated;
