# KONTA MOY FISCAL — standalone Next.js entrypoint

Deploy THIS directory, NOT the marketplace root or apps/web.

- Vercel Project: konta-moy-fiscal (prj_fZiejKLcPjXustPBw04NdlqKyP2H)
- Root Directory: fiscal/service
- Sources and UI are temporarily re-exported from apps/web/src/app/timologio and /timologio-admin for maximum code reuse.
- The standalone route tree contains ONLY FISCAL merchant, admin, API and SSO endpoints; marketplace cron jobs, commerce endpoints, checkout, login and vendor impersonation routes are NOT registered.
- The app has its own root layout, no marketplace SEO or visitor widgets.
- Environment MUST set FISCAL_STANDALONE_MODE=true. Next build refuses to start without it.
- The service needs its own FISCAL_DATABASE_URL; do NOT connect DATABASE_URL / POSTGRES_URL to the marketplace.
- FISCAL_REGISTRATION_ENABLED=false and FISCAL_MARKETPLACE_DRAFT_SYNC_ENABLED=false until formal readiness.
- The temporary sharing of source modules creates a build-time dependency on the marketplace repository, not a runtime database dependency. Extract shared pure packages after proving workflows.
- No billing or customer issuance until separate legal/provider certification.
