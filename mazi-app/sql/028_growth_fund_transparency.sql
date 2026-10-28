-- MAZI 028: Financial transparency without enabling payments or pooled funds.
-- Public reporting exposes verified *book entries* separately from actual cash custody.
-- This migration does not create receipts, members, cycles, approvals or payments.
create table if not exists public.mazi_fund_reconciliations (
 id uuid primary key default gen_random_uuid(),
 period_end date not null unique,
 statement_balance_cents bigint not null check (statement_balance_cents >= 0),
 ledger_balance_cents bigint not null check (ledger_balance_cents >= 0),
 statement_sha256 text not null check (statement_sha256 ~ '^[a-f0-9]{64}$'),
 private_evidence_reference text not null check (length(btrim(private_evidence_reference)) between 15 and 300),
 reviewer_note text not null check (length(btrim(reviewer_note)) between 30 and 1200),
 reviewed_by uuid not null references public.users(id),
 reviewed_at timestamptz not null default now(),
 check (period_end <= current_date),
 check (statement_balance_cents = ledger_balance_cents)
);
alter table public.mazi_fund_reconciliations enable row level security;
revoke all on public.mazi_fund_reconciliations from public, anon, authenticated, service_role;

-- A public disclosure is a reviewed, redacted summary, never a raw bank statement.
-- Corrections are new events linked to the event being corrected.
create table if not exists public.mazi_fund_public_events (
 id uuid primary key default gen_random_uuid(),
 ledger_id uuid unique references public.mazi_fund_ledger(id),
 cycle_id uuid references public.mazi_cycles(id),
 kind text not null check (kind in ('receipt','award','disbursement','expense','reconciliation','correction','milestone')),
 amount_cents bigint check (amount_cents is null or amount_cents >= 0),
 summary text not null check (length(btrim(summary)) between 20 and 320),
 evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[a-f0-9]{64}$'),
 supersedes_id uuid references public.mazi_fund_public_events(id),
 reviewed_by uuid not null references public.users(id),
 published_at timestamptz not null default now(),
 check (supersedes_id is null or supersedes_id <> id),
 check (kind = 'correction' or supersedes_id is null)
);
create index if not exists mazi_fund_disclosure_published_idx
 on public.mazi_fund_public_events(published_at desc);
alter table public.mazi_fund_public_events enable row level security;
revoke all on public.mazi_fund_public_events from public, anon, authenticated, service_role;

-- Extend existing immutable governance handling to finance evidence too.
drop trigger if exists mazi_fund_ledger_immutable on public.mazi_fund_ledger;
create trigger mazi_fund_ledger_immutable before update or delete on public.mazi_fund_ledger
 for each row execute function public.mazi_immutable_row();
drop trigger if exists mazi_fund_reconciliations_immutable on public.mazi_fund_reconciliations;
create trigger mazi_fund_reconciliations_immutable before update or delete on public.mazi_fund_reconciliations
 for each row execute function public.mazi_immutable_row();
drop trigger if exists mazi_fund_public_events_immutable on public.mazi_fund_public_events;
create trigger mazi_fund_public_events_immutable before update or delete on public.mazi_fund_public_events
 for each row execute function public.mazi_immutable_row();

-- The ONLY public-read data path is this service-role-only, argument-free,
-- read-only, pre-redacted report. Browser anon/authenticated cannot execute it
-- and cannot select ledger, bank statements, evidence or member identities.
create or replace function public.mazi_fund_public_report()
returns jsonb language sql stable security definer
set search_path = pg_catalog
as $$
 with book as (
  select coalesce(sum(amount_cents) filter (where event_type='receipt'),0)::bigint receipts,
         coalesce(sum(amount_cents) filter (where event_type='expense'),0)::bigint expenses,
         coalesce(sum(amount_cents) filter (where event_type='allocation'),0)::bigint allocations,
         coalesce(sum(amount_cents) filter (where event_type='reversal'),0)::bigint reversals,
         count(*)::bigint entry_count,
         max(created_at) as last_entry_at
  from public.mazi_fund_ledger
 ), offer_summary as (
  select coalesce(sum(assigned_amount_cents),0)::bigint reserved_offers,
         count(*)::bigint offer_count
  from public.mazi_grant_award_offers
 ), recon as (
  select period_end, statement_balance_cents, reviewed_at
  from public.mazi_fund_reconciliations
  order by period_end desc limit 1
 ), cycles as (
  select count(*) filter (where kind='fund_allocation')::bigint financial_cycles,
         count(*) filter (where kind='fund_allocation' and finance_activated)::bigint active_financial_cycles
  from public.mazi_cycles
 ), published as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,'kind',kind,'date',to_char(published_at at time zone 'Europe/Athens','YYYY-MM-DD'),
    'amount_cents',amount_cents,'summary',summary,'evidence_sha256',evidence_sha256,
    'supersedes_id',supersedes_id
  ) order by published_at desc), '[]'::jsonb) events
  from (select id,kind,published_at,amount_cents,summary,evidence_sha256,supersedes_id
        from public.mazi_fund_public_events order by published_at desc,id desc limit 100) recent
 ), months as (
  select coalesce(jsonb_agg(jsonb_build_object(
   'month',month,'receipts_cents',receipts,'expenses_cents',expenses,'allocations_cents',allocations
  ) order by month desc), '[]'::jsonb) trends
  from (
   select to_char(date_trunc('month',created_at at time zone 'Europe/Athens'),'YYYY-MM') as month,
    coalesce(sum(amount_cents) filter (where event_type='receipt'),0)::bigint receipts,
    coalesce(sum(amount_cents) filter (where event_type='expense'),0)::bigint expenses,
    coalesce(sum(amount_cents) filter (where event_type='allocation'),0)::bigint allocations
   from public.mazi_fund_ledger
   group by 1 order by 1 desc limit 24
  ) series
 )
 select jsonb_build_object(
   'as_of',now(),'currency','EUR','financial_operations_enabled',(cycles.active_financial_cycles>0),
   'financial_cycles',cycles.financial_cycles,'receipts_cents',book.receipts,
   'expenses_cents',book.expenses,'allocation_entries_cents',book.allocations,
   'reversal_entries_cents',book.reversals,'reserved_offers_cents',offer_summary.reserved_offers,
   'offer_count',offer_summary.offer_count,'ledger_entries',book.entry_count,
   'last_entry_at',book.last_entry_at,'book_cash_balance_cents',book.receipts-book.expenses,
   'reconciliation',case when recon.period_end is null then null else jsonb_build_object(
      'period_end',recon.period_end,'statement_balance_cents',recon.statement_balance_cents,
      'reviewed_at',recon.reviewed_at,'scope','internal_book_to_statement_match') end,
   'available_for_new_awards_cents',case
      when cycles.active_financial_cycles=0
       or recon.period_end is null or book.reversals<>0
       or recon.statement_balance_cents<>book.receipts-book.expenses
       or book.receipts-book.expenses < offer_summary.reserved_offers
      then null
      else book.receipts-book.expenses-offer_summary.reserved_offers end,
   'ledger_semantics_review_required',book.reversals>0,
   'public_events',published.events,'monthly',months.trends,
   'evidence_notice','Only vetted disclosures are public. Book totals are not bank statements.'
 )
 from book cross join offer_summary cross join cycles cross join published cross join months
 left join recon on true;
$$;
revoke all on function public.mazi_fund_public_report() from public, anon, authenticated;
grant execute on function public.mazi_fund_public_report() to service_role;
comment on function public.mazi_fund_public_report() is
 'Fixed read-only, pre-redacted financial transparency report. Only trusted MAZI Edge service role may execute.';
