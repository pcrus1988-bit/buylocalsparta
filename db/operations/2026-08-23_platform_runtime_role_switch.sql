-- Buy Local Sparta — production role-switch hardening.
-- The production database login is already a credential-bound member of bls_platform_runtime.
-- PostgreSQL 17 role-membership SET was disabled, which prevented the application from explicitly
-- dropping into the restricted runtime role before catalogue staging and PIM promotion.
--
-- This is operational role configuration rather than an application schema migration.

GRANT bls_platform_runtime TO postgres WITH SET TRUE, INHERIT FALSE;
