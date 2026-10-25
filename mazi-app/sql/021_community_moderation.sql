-- MAZI 021: manual community moderation by existing KONTA MOY Super Admin.
-- Nothing is physically deleted. Decisions recorded via marketplace audit.
alter table public.mazi_marketplace_listings
 add column if not exists hidden_at timestamptz,
 add column if not exists hidden_by uuid references public.users(id);
alter table public.mazi_forum_threads
 add column if not exists hidden_at timestamptz,
 add column if not exists hidden_by uuid references public.users(id);
alter table public.mazi_forum_replies
 add column if not exists hidden_at timestamptz,
 add column if not exists hidden_by uuid references public.users(id);
alter table public.mazi_chat_messages
 add column if not exists hidden_at timestamptz,
 add column if not exists hidden_by uuid references public.users(id);
alter table public.mazi_community_reports
 add column if not exists status text not null default 'open'
   check(status in ('open','dismissed','hidden')),
 add column if not exists reviewed_at timestamptz,
 add column if not exists reviewed_by uuid references public.users(id),
 add column if not exists review_reason text
   check(review_reason is null or char_length(trim(review_reason)) between 20 and 1000);
create index if not exists mazi_reports_status_date on public.mazi_community_reports(status,created_at desc);
-- Direct member access stays disabled; moderation via marketplace server only.
revoke all on public.mazi_community_reports,public.mazi_marketplace_listings,
 public.mazi_forum_threads,public.mazi_forum_replies,public.mazi_chat_messages
 from PUBLIC,anon,authenticated;
