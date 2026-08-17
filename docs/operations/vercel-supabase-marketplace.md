# Vercel ↔ Supabase Marketplace database runtime

The production web runtime accepts either `DATABASE_URL` or the Vercel Marketplace-provided `POSTGRES_URL` connection string. `DATABASE_URL` takes precedence when both are present.

Do not commit either connection string. Supabase/Vercel Marketplace remains the source of truth for the managed `POSTGRES_URL` secret.

Production readiness at `/api/health/ready` must report the PostgreSQL server, PostGIS, schema version, and zero pending migrations before the release is considered database-ready.
