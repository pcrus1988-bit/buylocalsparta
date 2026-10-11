-- Milestone 17: cover foreign-key lookup paths identified by the Supabase advisor.
-- Additive, non-destructive indexes only. No tenant policy or issuance changes.
BEGIN;
CREATE INDEX IF NOT EXISTS fiscal_api_clients_created_by_idx
 ON public.fiscal_api_clients(created_by);
CREATE INDEX IF NOT EXISTS fiscal_counterparties_created_by_idx
 ON public.fiscal_counterparties(created_by);
CREATE INDEX IF NOT EXISTS fiscal_marketplace_challenges_created_by_idx
 ON public.fiscal_marketplace_link_challenges(created_by);
CREATE INDEX IF NOT EXISTS fiscal_marketplace_links_authorized_by_idx
 ON public.fiscal_marketplace_links(authorized_by);
CREATE INDEX IF NOT EXISTS fiscal_organizations_reviewed_by_idx
 ON public.fiscal_organizations(reviewed_by);
CREATE INDEX IF NOT EXISTS fiscal_sandbox_journals_created_by_idx
 ON public.fiscal_sandbox_journals(created_by);
CREATE INDEX IF NOT EXISTS fiscal_tax_rule_candidates_source_code_idx
 ON public.fiscal_tax_rule_candidates(source_code);
COMMIT;
