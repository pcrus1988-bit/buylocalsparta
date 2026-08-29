# Indexed pages production reconciliation — 2026-08-29

Production schema history already contained canonical migration `0155_vendor_visibility_analytics.sql`.

Repository history was reconciled so the SEO production metrics migration is `0156_seo_production_metrics.sql` and the indexed research-vendor claim migration is `0157_vendor_application_profile_claims.sql`.

Production was advanced in order from schema 155 to 157. The repository `schema_migrations` ledger now records versions 155, 156, and 157 with the exact committed filenames and checksums. The SEO metrics tables, indexed-vendor claim table, claim-finalization function, and activation trigger were verified after application.

This commit intentionally retriggers the normal Git-to-Vercel production deployment after the schema head was reconciled.
