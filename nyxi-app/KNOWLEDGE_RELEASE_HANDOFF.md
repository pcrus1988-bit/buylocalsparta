# NYXI Knowledge — Production Handoff (2026-10-13)

## Already working and live
- Public URL: https://nyxi.kontamou.site → Γνώση & πηγές.
- /api/sources shows active external source references only. Live JSON smoke test: HTTP 200, 24 source links.
- /api/search?q=HEMA uses a non-privileged Supabase anon JWT via a server proxy. Live smoke test: HTTP 200, no_approved_evidence, 0 results.
- Supabase Edge functions nyxi-public-atlas and nyxi-public-search ACTIVE with verify_jwt=true.
- Vercel vars: NYXI_SUPABASE_ANON_KEY (server only), NYXI_PUBLIC_SEARCH_URL (server only), NEXT_PUBLIC_NYXI_SEARCH_ENABLED=true.
- Reviewed-only search uses nyxi_reviewed_fragments_v1, then rechecks every returned fragment. Never weaken this gate.

## Source data verified on production
- 303 registered sources: 278 discovered, 24 active, 1 restricted.
- Three sources have documented acquisition authorization; 21 active sources await rights review.
- 31 valid immutable snapshots and 31 completed extraction runs from three FDA sources.
- 270 stored fragment records include older snapshots; only 26 fragments from the latest three snapshots are current, and all remain pending.
- Zero approved fragments, zero searchable evidence records, zero knowledge graph entities, zero measured polish shades.
- FDA acquisition rights explicitly exclude third-party materials and mirroring. Do not infer broader rights.

## Private reviewer preparation completed
Read-only, service-role-only views under non-exposed schema nyxi_internal:
- current_fragment_review_queue_v1: 26 candidates, from current valid extracted snapshots (10 FDA nail-care, 8 MoCRA, 8 prohibited/restricted cosmetic ingredient).
- source_rights_review_queue_v1: 21 active sources lacking a current documented asset-acquisition authorization, across 9 authorities.
- Permissions tested: anon and authenticated have no schema USAGE or SELECT. Only service_role has SELECT. None of these views belongs in the public Next API.

## Remaining work — in order
1. Independent reviewer identity: implement authenticated staff identity and explicit reviewer allowlist, expiry and revocation. The /admin route remains 404 until acceptance.
2. Private reviewer UI: load current candidates only after server-side reviewer authentication. Show source authority, actual source page, snapshot SHA, fragment and legal rights evidence. Require individual, reasoned Approve/Reject decisions; no mass approval.
3. Decision audit: named reviewer, fragment SHA, snapshot version, authorization checks, decision, timestamp and revocation recorded transactionally.
4. Publication gate: a matching, non-revoked fragment publication approval row, metadata.review_status=approved, metadata.review_required != true, completed extraction. Only the authenticated reviewer service may mutate these transactionally.
5. Rights expansion: validate each of the 21 sources for collection, reproduction, retention and jurisdiction. Never infer source rights from a URL or active status.
6. Source expansion: validate the 278 discovered sources; acquire only rights-approved assets.
7. Build knowledge graph and calibrated shade measurements from approved provenance. Approximate colors are not brand measurements.
8. Use independently reviewed citations in Nail Problem Solver / Atelier recommendations; conservative generic guidance remains a safe fallback.

## Repeatable acceptance tests
- Public Atlas HTTP 200 returns only source key, title, authority and safe HTTPS URL.
- With zero approvals, search?q=HEMA returns no_approved_evidence, an empty results array and HTTP 200.
- With staging-approved evidence, only approved citations appear; revocation removes them immediately.
- Missing JWT fails closed; direct private schema queries as anon/authenticated are denied.
- All Next.js tests and build pass before deployment; production alias and real endpoints rechecked afterwards.

## Ownership
The NYXI consumer app PR is stacked on previous feature work and must remain draft until upstream branch reconciliation. Neither a ready deployment nor user demand is a substitute for independent factual/legal approval of the evidence.
