# Paint & Build Guidance — production deployment order

The Paint & Build guidance runtime uses a strict database schema gate.

For any guidance migration that raises `EXPECTED_SCHEMA_VERSION`, production must be updated in this order:

1. Apply and verify the database migration first.
2. Confirm `public.schema_migrations` contains the new version and expected checksum.
3. Only then publish the commit that raises `EXPECTED_SCHEMA_VERSION` to `main`.
4. Verify the resulting Vercel production deployment reaches READY.
5. Verify `/paint-and-build-studio` responds successfully from the new deployment.

Do not weaken or bypass the schema gate to make a deployment pass.

Reason: Vercel Git deployments start immediately after a push to `main`. If the runtime gate is bumped before the production database migration is complete, `npm run build` can fail even when the same code is otherwise valid.

Run verification recorded on 2026-09-22:
- production schema version: 278
- migration 0276 checksum verified
- migration 0277 checksum verified
- migration 0278 checksum verified
- 33/33 published GENERAL_GUIDANCE profiles approved and evidence-verified
- direct profile evidence gap count: 0
- active Layer A rule evidence gap count: 0
- active Layer A step evidence gap count: 0
- active Layer A diagnostic evidence gap count: 0
- active KONTA_MOU_RULE stop-condition evidence gap count: 0

Layer boundaries remain strict:
- Layer A: brand-independent general solution guidance
- Layer B: manufacturer/product instructions
- Layer C: KONTA MOY workflow and safety governance
