# NYXI Agent 1 — rights-gate checkpoint (2026-10-13)

This is a governance checkpoint, not a grant of publication rights. Publication stays disabled until an independently authenticated reviewer verifies rights evidence and the exact snapshot and fragment hashes.

- Production: 303 sources, 31 snapshots and manifests, 270 private fragments, zero publication approvals and zero public search documents.
- Exactly three acquisition approvals, all FDA pages, with `mirror_authorized=false`. No new acquisition or public-excerpt rights were granted.
- All 31 snapshots have 64-character SHA-256 metadata and corresponding private Storage objects; this is not independent byte rehash verification.
- Snapshot counts by source: MoCRA 8, Nail Care 10, Prohibited/Restricted Ingredients 13. Each has distinct byte hashes, with only three byte-length values per source. Agent 2 should investigate dynamic HTML and avoid treating each volatile-byte change as a substantive new legal revision.
- FDA website policy permits reuse of FDA-authored website material unless otherwise noted, but this does not independently verify ownership of each embedded item or authorize publishing any specific private fragment.
- Agent 4 must require independent human reviewer identity, explicit excerpt scope, rights evidence hash, snapshot hash, fragment hash, reason, revocation and expiry before indexing.
- Five manufacturer SDS candidates remain unapproved; no rights may be inferred from source registry status or file names.

Sources: FDA Website Policies (https://www.fda.gov/about-fda/about-website/website-policies); GitHub issues #1460 and #1444.
