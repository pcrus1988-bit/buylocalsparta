-- MAZI 028 / verified-member physical goods exchange, no checkout.
-- There were no marketplace listings on 2026-10-27. Old types are not deleted;
-- the new constraint bars any future non-goods listing from being inserted.
alter table public.mazi_marketplace_listings
 add column if not exists item_category text not null default 'other',
 add column if not exists item_condition text not null default 'any',
 add column if not exists quantity numeric(12,2) not null default 1,
 add column if not exists quantity_unit text not null default 'piece',
 add column if not exists location_city text not null default 'Ελλάδα',
 add column if not exists fulfillment text not null default 'either',
 add column if not exists price_type text not null default 'on_request',
 add column if not exists price_cents bigint,
 add column if not exists price_vat_basis text not null default 'unspecified',
 add column if not exists expires_at timestamptz not null default (now() + interval '60 days'),
 add column if not exists goods_policy_version text,
 add column if not exists goods_policy_accepted_at timestamptz;

alter table public.mazi_marketplace_listings
 add constraint mazi_goods_only_new check(category='goods') not valid,
 add constraint mazi_goods_category_valid check(item_category in
 ('equipment','inventory','materials','furniture','electronics','packaging','vehicles','other')),
 add constraint mazi_goods_condition_valid check(item_condition in ('new','used','refurbished','any')),
 add constraint mazi_goods_quantity_valid check(quantity>0 and quantity<=1000000),
 add constraint mazi_goods_unit_valid check(quantity_unit in ('piece','set','box','pallet','kg','liter')),
 add constraint mazi_goods_city_valid check(char_length(btrim(location_city)) between 2 and 100),
 add constraint mazi_goods_fulfillment_valid check(fulfillment in ('pickup','shipping','either')),
 add constraint mazi_goods_price_type_valid check(price_type in ('fixed','negotiable','on_request')),
 add constraint mazi_goods_price_valid check(
   (price_cents is null or (price_cents between 1 and 100000000000))
   and (price_type <> 'fixed' or price_cents is not null)
   and (price_type <> 'on_request' or price_cents is null)),
 add constraint mazi_goods_vat_basis_valid check(price_vat_basis in ('included','excluded','unspecified')),
 add constraint mazi_goods_offer_condition check(kind='request' or item_condition <> 'any'),
 add constraint mazi_goods_policy_attestation check(
   goods_policy_version='mazi-goods-v1' and goods_policy_accepted_at is not null) not valid;

create index if not exists mazi_goods_find_idx
 on public.mazi_marketplace_listings(status,kind,item_category,expires_at desc,created_at desc)
 where hidden_at is null and category='goods';
create index if not exists mazi_goods_city_idx
 on public.mazi_marketplace_listings(location_city)
 where status='active' and hidden_at is null and category='goods';
-- Existing RLS + revoked browser grants remain intact. Supabase Edge service
-- verifies a fresh JWT and KYB on every request and enforces author ownership.
-- Reports and private inquiries continue to work with unchanged tables.
