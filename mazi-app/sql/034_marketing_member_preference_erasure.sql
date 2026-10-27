-- Allow a logged-in member to withdraw planning preferences even after losing verified status.
-- Only their own row is accessible; financial records and immutable admin audit are untouched.
grant delete on public.mazi_marketing_preferences to authenticated;
create policy mazi_marketing_preference_self_delete on public.mazi_marketing_preferences
 for delete to authenticated using (member_user_id=(select auth.uid()));
