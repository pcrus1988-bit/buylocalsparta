-- MERIDIO / isolated database proposal / design-only, NOT APPLIED.
--
-- This file is an engineering contract for a FUTURE dedicated MERIDIO Supabase
-- project. Do not execute against the KONTA MOY production database.
-- No policies, seed grants, login providers, payments or token issuance are
-- enabled by this proposal. All tenant tables below are RLS deny-by-default.
--
-- Assumes PostgreSQL with gen_random_uuid() available.

begin;

create schema if not exists meridio;
revoke all on schema meridio from public;

create table if not exists meridio.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  display_name text not null,
  status text not null default 'draft' check (status in ('draft', 'reviewing', 'active', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists meridio.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references meridio.tenants(id),
  user_id uuid not null,
  role text not null check (role in ('owner', 'operator', 'reviewer', 'participant', 'auditor')),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role)
);

create table if not exists meridio.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references meridio.tenants(id),
  slug text not null check (slug ~ '^[a-z0-9-]{3,80}$'),
  display_name text not null,
  world text not null check (world in (
    'real_estate','hospitality','mobility','energy','agriculture',
    'equipment','culture','sport_leisure','land','infrastructure'
  )),
  publication_state text not null default 'draft' check (publication_state in (
    'draft', 'awaiting_evidence', 'under_review', 'approved', 'published', 'suspended', 'withdrawn'
  )),
  legal_jurisdiction text,
  lawful_operator_entity_id uuid,
  disclosure_version text,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug),
  constraint publication_requires_approval check (
    publication_state not in ('approved', 'published') or
    (approved_by is not null and approved_at is not null and legal_jurisdiction is not null and disclosure_version is not null)
  )
);

create table if not exists meridio.asset_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  evidence_type text not null,
  private_object_key text,
  sha256_hex text check (sha256_hex ~ '^[a-f0-9]{64}$'),
  provenance_url text,
  classification text not null default 'confidential' check (classification in ('confidential','internal','public_approved')),
  review_state text not null default 'missing' check (review_state in ('missing','submitted','needs_changes','verified','rejected','revoked')),
  submitted_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, asset_id) references meridio.assets(tenant_id, id),
  constraint evidence_verification_requires_reviewer check (
    review_state <> 'verified' or (reviewed_by is not null and reviewed_at is not null and sha256_hex is not null)
  )
);

create table if not exists meridio.asset_rights_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  policy_version text not null,
  jurisdiction text not null,
  access_mode text not null,
  governance_mode text not null,
  economic_rights_enabled boolean not null default false,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, asset_id, policy_version),
  foreign key (tenant_id, asset_id) references meridio.assets(tenant_id, id)
);

-- Append-only domain events will be the authoritative source for rights
-- movements. A separate reconciled read model may be materialized only after
-- atomic event validation and independently reviewed legal contracts.
create table if not exists meridio.rights_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  policy_id uuid not null references meridio.asset_rights_policies(id),
  participant_user_id uuid not null,
  rights_kind text not null check (rights_kind in ('access', 'governance', 'economic')),
  event_kind text not null check (event_kind in ('grant', 'revoke', 'adjust', 'expire')),
  units_delta numeric(20, 6) not null,
  idempotency_key text not null,
  source_contract_ref text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, asset_id) references meridio.assets(tenant_id, id)
);

create table if not exists meridio.utilization_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  requester_user_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  policy_version text not null,
  state text not null default 'draft' check (state in ('draft','submitted','approved','rejected','cancelled','completed')),
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, asset_id) references meridio.assets(tenant_id, id),
  check (end_at > start_at)
);

create table if not exists meridio.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  title text not null,
  description text not null,
  state text not null default 'draft' check (state in ('draft','review','open','closed','void')),
  quorum_bps integer not null check (quorum_bps between 0 and 10000),
  approval_bps integer not null check (approval_bps between 0 and 10000),
  eligible_weight_snapshot numeric(20,6),
  closes_at timestamptz,
  approved_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, asset_id) references meridio.assets(tenant_id, id),
  constraint opening_requires_snapshot check (
    state not in ('open','closed') or
    (eligible_weight_snapshot > 0 and closes_at is not null and approved_by is not null)
  )
);

create table if not exists meridio.governance_ballots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  proposal_id uuid not null,
  participant_user_id uuid not null,
  choice text not null check (choice in ('yes','no','abstain')),
  eligible_weight numeric(20,6) not null check (eligible_weight > 0),
  snapshot_reference text not null,
  cast_at timestamptz not null default now(),
  unique (tenant_id, proposal_id, participant_user_id),
  foreign key (tenant_id, proposal_id) references meridio.governance_proposals(tenant_id, id)
);

create table if not exists meridio.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references meridio.tenants(id),
  actor_user_id uuid,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  context_json jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

-- All tables are locked down. No policy is deliberately installed here:
-- a later reviewed and tenant-bound authentication implementation must define
-- narrowly scoped SELECT / INSERT / UPDATE rules before use.
do $rls$
declare relation_name text;
begin
  foreach relation_name in array array[
    'tenants','tenant_members','assets','asset_evidence',
    'asset_rights_policies','rights_events','utilization_requests',
    'governance_proposals','governance_ballots','audit_events'
  ] loop
    execute format('alter table meridio.%I enable row level security', relation_name);
    execute format('alter table meridio.%I force row level security', relation_name);
    execute format('revoke all on meridio.%I from public', relation_name);
  end loop;
end
$rls$;

-- Once installed in a standalone project, audit the privilege grants, design
-- separate service-scoped mutation functions, harden immutability and approval
-- triggers, and run cross-tenant adversarial tests BEFORE enabling any writes.

commit;
