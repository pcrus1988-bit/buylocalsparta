# Approved GEMI HUB sitemap shards — 12 October 2026

## Purpose
Expose only independently published, SEO-approved GEMI research directory pages to search engines, without treating imported/staged records as public businesses. This is separate from publication and official registry verification.

## Index and URL contracts
- Root sitemap index: /sitemap.xml.
- Approved registry listing shard: /sitemaps/hubs/{hubSlug}/{n}.xml.
- Each shard contains up to 4,000 publicly approved canonical business URLs. The maximum is 50 shards/HUB; >200,000 qualifying records within one HUB would need another pagination strategy.
- Main /sitemap.xml adds HUB shards only when qualifying published rows exist.
- /sitemaps/core/sitemap.xml adds a census-only HUB landing and directory URL only when at least 10 independent published + SEO-approved profiles qualify. This follows the public HUB page indexability threshold.

## Quality and privacy gates
Read-only queries project public_slug only. The shared predicate requires display_status='published', seo_approved=true, a valid stable slug, and either a municipality registry-verified classification or a verified premises assignment. Public active vendors and any completed owner CLAIM/paid prospect suppress the registry duplicate. The underlying 0447 DB constraints, trigger, existing owner plan and per-page metadata remain the authoritative publication gates. No unpublished research, contact details, AFM, exact private address, or prospect survey information is ever emitted.

## Operational behavior
The XML shard route validates hub and numeric shard, uses the configured canonical HTTPS origin, and returns a safe, empty degraded sitemap with no-store when the database cannot be read. The root sitemap discovery is fail-closed on DB errors; it does not disrupt existing product and core sitemaps. INDEXING_ENABLED or sitemap.staticPages being false suppresses the census sitemap.

## Verification
Run npm run test:hub-gemi-assignment, Production CI and Browser acceptance. Production publication remains 0 as of the creation of this PR, so adding this code should not immediately add any GEMI census URLs to public sitemaps. Confirm on the deployed build that /sitemap.xml and /sitemaps/core/sitemap.xml remain 200 and continue to include verified CLAIM such as Volos HostChefs, while no unpublished GEMI page is advertised. Once independently reviewed records are published, inspect shard inventory and canonical/index metadata before requesting GSC recrawls.
