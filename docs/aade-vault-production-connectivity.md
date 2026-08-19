# AADE production connectivity diagnostics

Production AADE/myDATA credentials may be supplied through Vercel environment variables or, for read-only diagnostics only, through Supabase Vault records named `bls_aade_mydata_user_id` and `bls_aade_mydata_subscription_key`.

The Vault fallback is intentionally **not** used to initialize `PostgresMyDataService`, so it cannot enable `SendInvoices` or bypass `BLS_MYDATA_ISSUANCE_ENABLED` / mapping controls.

A one-shot connectivity probe can be armed in `system_settings` with key `mydata.production_connectivity_probe` and value `{ "state": "armed" }`. The next readiness request claims the row atomically, performs `RequestTransmittedDocs` only, and stores a sanitized succeeded/failed snapshot. It never stores AADE credentials or returned document XML.
