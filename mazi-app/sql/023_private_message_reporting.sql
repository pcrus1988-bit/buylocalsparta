-- MAZI 023: private-inquiry moderation without exposing messages publicly.
alter table public.mazi_inquiry_messages
 add column if not exists hidden_at timestamptz,
 add column if not exists hidden_by uuid references public.users(id);
alter table public.mazi_community_reports
 drop constraint if exists mazi_community_reports_resource_type_check;
alter table public.mazi_community_reports
 add constraint mazi_community_reports_resource_type_check
 check(resource_type in ('listing','thread','reply','chat','inquiry'));
revoke all on public.mazi_inquiry_messages,public.mazi_community_reports from PUBLIC,anon,authenticated;
-- Moderator decisions continue via the existing restricted marketplace Super Admin.
