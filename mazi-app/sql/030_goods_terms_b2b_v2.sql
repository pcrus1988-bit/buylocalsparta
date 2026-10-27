-- MAZI 030: staged acceptance of comprehensive B2B goods terms v2.
-- Preserve historical v1 acceptance records, never relabel or backdate consent.
-- Runtime now requires both explicit v2 checkboxes before persisting v2.
alter table public.mazi_marketplace_listings
 drop constraint if exists mazi_goods_policy_attestation;
alter table public.mazi_marketplace_listings
 add constraint mazi_goods_policy_attestation check(
  goods_policy_version in ('mazi-goods-v1','mazi-goods-v2')
  and goods_policy_accepted_at is not null
 ) not valid;
comment on column public.mazi_marketplace_listings.goods_policy_version is
 'Exact legal terms version expressly accepted for create/edit, not retroactive';
comment on column public.mazi_marketplace_listings.goods_policy_accepted_at is
 'Server-recorded timestamp for version-specific affirmative B2B acceptance';
-- Existing RLS and revoked browser grants remain unchanged.
