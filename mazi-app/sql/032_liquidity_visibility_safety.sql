-- 032: strengthen availability evidence: never reuse a stale reconciliation
-- or ignore mismatched allocation entries and outstanding award offers.
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
       or book.allocations<>offer_summary.reserved_offers
       or (book.last_entry_at is not null and recon.reviewed_at<book.last_entry_at)
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
