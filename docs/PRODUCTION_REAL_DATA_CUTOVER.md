# Production real-data storefront cutover

The production web application may receive its PostgreSQL connection from either an explicit `DATABASE_URL` or the Vercel Marketplace-managed `POSTGRES_URL`. Storefront modules must use the shared `productionDatabaseConfigured()` check rather than testing one environment variable directly.

Production behavior:

- a configured production database never silently serves demo catalog/vendors;
- `/api/catalog` reports `demoData: false` in database mode;
- only `vendor_businesses.status = 'active'` merchants are presented as Buy Local Sparta partners and receive partner profile routes;
- research-backed `vendor_research_%` records may be shown in `/shops` only while `status = 'invited'`, clearly labeled as mapped research/onboarding records rather than partners;
- research records do not receive advisers, public supplier offers, product counts, merchant stories, approved merchant media, or public partner profile links;
- canonical products remain governed separately and are public only when the existing catalog/publicability rules allow them.

The August 2026 research seed is an internal/public-source pre-onboarding baseline. Applying it must not activate merchants or invent merchant approval.