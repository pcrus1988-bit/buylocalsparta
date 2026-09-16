begin;

create table if not exists public.merchant_product_sync (
  id uuid primary key default gen_random_uuid(),
  canonical_variant_id uuid not null references public.canonical_variants(id) on delete cascade,
  offer_id text not null,
  merchant_account_id text not null,
  data_source_name text not null,
  content_language text not null default 'el',
  feed_label text not null default 'GR',
  product_input_name text,
  google_product_name text,
  payload_hash text,
  last_submitted_payload jsonb,
  sync_status text not null default 'pending',
  last_sync_at timestamptz,
  last_success_at timestamptz,
  next_retry_at timestamptz,
  retry_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  merchant_processing_status text,
  shopping_ads_status text,
  free_listings_status text,
  destination_statuses jsonb not null default '[]'::jsonb,
  last_status_check_at timestamptz,
  first_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_account_id, content_language, feed_label, offer_id)
);
create index if not exists merchant_product_sync_variant_idx on public.merchant_product_sync(canonical_variant_id);
create index if not exists merchant_product_sync_status_idx on public.merchant_product_sync(sync_status, next_retry_at);
create index if not exists merchant_product_sync_refresh_idx on public.merchant_product_sync(last_success_at) where sync_status='synced';
create index if not exists merchant_product_sync_google_name_idx on public.merchant_product_sync(google_product_name) where google_product_name is not null;

create table if not exists public.merchant_product_issues (
  id uuid primary key default gen_random_uuid(),
  merchant_sync_id uuid not null references public.merchant_product_sync(id) on delete cascade,
  canonical_variant_id uuid not null references public.canonical_variants(id) on delete cascade,
  issue_code text not null,
  severity text,
  resolution text,
  affected_attribute text,
  reporting_context text,
  description text,
  detail text,
  applicable_countries text[] not null default '{}'::text[],
  documentation_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  raw_issue_payload jsonb not null default '{}'::jsonb,
  unique (merchant_sync_id, issue_code, reporting_context, affected_attribute)
);
create index if not exists merchant_product_issues_open_idx on public.merchant_product_issues(resolved_at, issue_code);

create table if not exists public.merchant_account_issues (
  id uuid primary key default gen_random_uuid(),
  merchant_account_id text not null,
  issue_code text not null,
  severity text,
  description text,
  affected_destinations text[] not null default '{}'::text[],
  affected_countries text[] not null default '{}'::text[],
  resolution text,
  documentation_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  raw_issue_payload jsonb not null default '{}'::jsonb,
  unique (merchant_account_id, issue_code)
);
create index if not exists merchant_account_issues_open_idx on public.merchant_account_issues(merchant_account_id, resolved_at);

create table if not exists public.merchant_sync_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  status text not null default 'running',
  shard integer,
  shard_count integer,
  queued_count integer not null default 0,
  attempted_count integer not null default 0,
  submitted_count integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  deleted_count integer not null default 0,
  retried_count integer not null default 0,
  failed_count integer not null default 0,
  processed_count integer not null default 0,
  approved_count integer not null default 0,
  pending_count integer not null default 0,
  disapproved_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists merchant_sync_runs_started_idx on public.merchant_sync_runs(started_at desc);

alter table public.merchant_product_sync enable row level security;
alter table public.merchant_product_issues enable row level security;
alter table public.merchant_account_issues enable row level security;
alter table public.merchant_sync_runs enable row level security;

create or replace view public.merchant_catalogue_eligibility as
select rm.canonical_variant_id,
       rm.canonical_public_id as offer_id,
       rm.slug,
       rm.min_price_minor,
       (pt.canonical_variant_id is not null and nullif(btrim(pt.title),'') is not null and nullif(btrim(coalesce(pt.description,'')),'') is not null) as greek_ready,
       case
         when pt.canonical_variant_id is null then 'translation_not_ready'
         when nullif(btrim(pt.title),'') is null then 'missing_greek_title'
         when nullif(btrim(coalesce(pt.description,'')),'') is null then 'missing_greek_description'
         when rm.min_price_minor is null or rm.min_price_minor <= 0 then 'no_valid_price'
         else null
       end as exclusion_reason
from public.storefront_catalog_read_model rm
left join public.product_translations pt on pt.canonical_variant_id=rm.canonical_variant_id and pt.locale='el';

comment on view public.merchant_catalogue_eligibility is 'Merchant eligibility projection over the production storefront read model; Greek localization is mandatory for GR export.';

commit;