-- MAZI 031: immutable, per-acceptance evidence independent of mutable listing row.
-- Includes new v2 terms acceptance on create AND edit; renewal/closure do not
-- claim that a user has accepted terms again.
create table if not exists public.mazi_goods_terms_acceptances (
 id bigint generated always as identity primary key,
 listing_id uuid not null references public.mazi_marketplace_listings(id),
 member_user_id uuid not null references auth.users(id),
 action text not null check (action in ('created','edited')),
 version text not null check (version in ('mazi-goods-v1','mazi-goods-v2')),
 accepted_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 b2b_explicitly_acknowledged boolean not null default true check (b2b_explicitly_acknowledged)
);
create index if not exists mazi_goods_terms_acceptances_listing_idx
 on public.mazi_goods_terms_acceptances(listing_id,recorded_at desc);
create index if not exists mazi_goods_terms_acceptances_member_idx
 on public.mazi_goods_terms_acceptances(member_user_id,recorded_at desc);
alter table public.mazi_goods_terms_acceptances enable row level security;
revoke all on public.mazi_goods_terms_acceptances from PUBLIC,anon,authenticated;
grant select,insert on public.mazi_goods_terms_acceptances to service_role;
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
  NEW.goods_policy_version,NEW.goods_policy_accepted_at,TRUE
 );
 return NEW;
end;$$;
create or replace function mazi_private.prevent_goods_terms_acceptance_changes()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 raise exception 'MAZI_GOODS_TERMS_ACCEPTANCE_APPEND_ONLY';
end;$$;
revoke all on function mazi_private.log_goods_terms_acceptance() from PUBLIC,anon,authenticated;
revoke all on function mazi_private.prevent_goods_terms_acceptance_changes() from PUBLIC,anon,authenticated;
drop trigger if exists mazi_goods_terms_immutable on public.mazi_goods_terms_acceptances;
create trigger mazi_goods_terms_immutable
 before update or delete on public.mazi_goods_terms_acceptances
 for each row execute function mazi_private.prevent_goods_terms_acceptance_changes();
drop trigger if exists mazi_goods_terms_accept_log on public.mazi_marketplace_listings;
create trigger mazi_goods_terms_accept_log
 after insert or update of goods_policy_version,goods_policy_accepted_at
 on public.mazi_marketplace_listings
 for each row execute function mazi_private.log_goods_terms_acceptance();
