-- 006: narrow MAZI Edge gateway permissions for server-only service_role.
-- Do NOT grant USAGE ON SCHEMA public to anon/authenticated, and do not grant
-- access to any unrelated marketplace table or to the financial ledger.
GRANT SELECT ON public.mazi_cycles TO service_role;
GRANT SELECT, INSERT ON public.mazi_membership_applications TO service_role;
GRANT SELECT ON public.mazi_members TO service_role;
GRANT SELECT, INSERT ON public.mazi_proposals TO service_role;
GRANT SELECT, INSERT ON public.mazi_votes TO service_role;
-- Only the marketplace's existing Super Admin writes membership decisions.
-- MAZI Edge Functions cannot create, change or delete member verification.
REVOKE INSERT, UPDATE, DELETE ON public.mazi_members FROM service_role;
REVOKE UPDATE, DELETE ON public.mazi_cycles,public.mazi_membership_applications,
  public.mazi_proposals,public.mazi_votes FROM service_role;
REVOKE ALL ON public.mazi_fund_ledger, public.mazi_administrators FROM service_role;
