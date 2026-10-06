-- KONTA MOY — research staff duty separation.
-- Schema 0429 makes the Observatory's application roles first-class platform roles
-- without granting any direct database privileges to those role labels.
--
-- Database access to research data remains mediated by the platform runtime and
-- the research_private schema/RLS boundary from 0428. These role values only
-- control application authorization after an authenticated staff session.

BEGIN;

ALTER TABLE public.platform_user_roles
  DROP CONSTRAINT IF EXISTS platform_user_roles_role_check;

ALTER TABLE public.platform_user_roles
  ADD CONSTRAINT platform_user_roles_role_check
  CHECK (role IN (
    'super_admin',
    'vendor_operations',
    'catalog_qa',
    'customer_support',
    'platform_finance',
    'content_seo',
    'compliance',
    'logistics',
    'research_superadmin',
    'research_methodologist',
    'research_fieldwork',
    'research_analyst',
    'research_publisher',
    'research_privacy',
    'auditor'
  ));

COMMIT;
