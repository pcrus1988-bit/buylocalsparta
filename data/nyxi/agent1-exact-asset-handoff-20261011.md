# NYXI Agent 1 → Agent 2: exact-asset acquisition allowlist

Read-only verified against Supabase project `eemihhfreggbigxejjhj` on 2026-10-11. **Not a grant of new rights.** The live approvals table, not this document, is authoritative at execution time.

| Source key | Source UUID | Approval UUID | Exact canonical URL |
|---|---|---|---|
| `us-fda-mocra` | `bbb058ea-09b8-40f6-b3dc-d66f6283aded` | `36188f3a-32ee-42a0-8b85-6ce6cc0f0dc6` | https://www.fda.gov/cosmetics/cosmetics-laws-regulations/modernization-cosmetics-regulation-act-2022-mocra |
| `us-fda-nail-care-products` | `6ed4aafc-e2a3-46af-8483-c0b2d2dbf5d4` | `4a2c89da-f9bf-4850-a211-13c4ddf42919` | https://www.fda.gov/cosmetics/cosmetic-products/nail-care-products |
| `us-fda-prohibited-restricted-cosmetic-ingredients` | `5e100658-ea96-47d6-8cb3-fab18dbbf78b` | `212bf852-ea98-4772-840c-78dfd36ffd50` | https://www.fda.gov/cosmetics/cosmetics-laws-regulations/prohibited-restricted-ingredients-cosmetics |

For all three: `acquisition_authorized=true`, `mirror_authorized=false`, approval expiry `2027-01-08T22:00:00Z` (2027-01-09 Greece). Review due 2026-11-09 Greece per frozen Atlas. Never mirror original HTML to Google Drive.

## Execution checks (fail closed)
1. Join the current source UUID and exact URL to a live asset approval ID. Re-check acquisition flag, expiration and review status immediately before fetch.
2. Reject any source-wide inference from `active`, `discovered`, official-publisher status, or registry/Atlas inclusion.
3. Reject redirects to non-approved final assets; re-evaluate URL identity and scope before following.
4. Check `mirror_authorized` independently; false means **no original-asset mirroring**.
5. Record acquisition provenance: approval UUID, source UUID/key, requested and final URL, HTTP validators, fetched timestamp, content hash, asset version, and immutable snapshot ID. Keep private evidence private.
6. Do not acquire any manufacturer SDS, brand catalogue, shade image, Artistic or essie asset without a separate exact-asset approval.

## Tests / blockers
Production query returned exactly three unexpired acquisition approvals and zero mirror permissions in this cohort. Agent 2 has **zero new authorizations**. Human review of the remaining 232 Atlas rights decisions and SDS revisions remains pending. Conflicting migrations 0435/0436 are held; paused agent schedules remain paused.
