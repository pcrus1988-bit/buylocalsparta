# NYXI standing instruction — automatic review and approval for private research

Recorded: **22 October 2026**. NYXI owner requests that all current and future routine evidence-processing decisions proceed without human item-by-item approval.

## Effective implementation

- Default process mode is **automatic** for every current or future fragment. There is no human approval step for **internal research, classification, extraction or enrichment**.
- `nyxi_automated_evidence_decisions_v1` is a live computed view over the current evidence and future ingestions. No asynchronous task, individual reviewer membership, action button or repeated confirmation is necessary. Authorized captured fragments with successful extraction automatically become `auto_approved_private`.
- Downstream knowledge extraction should consume only `eligible_for_private_knowledge_extraction=true` from that view. Page navigation, duplicates and short passages remain privately archived and automatically excluded from substantive reasoning. Older snapshots remain preserved for provenance.
- Uncaptured sources and sources with unknown/expired rights are **automatically held**; never reclassify access-denied HTTP 403, robots restrictions or unknown third-party rights as acquisition authorized. Automatic = machine-verified suitability, NOT entitlement to use third-party material.
- Use `nyxi_automated_processing_readiness_v1` rather than legacy counts of `human_evidence_review` to gauge pipeline progress.

## What owner approval authorizes

The owner approves NYXI's internal project decisions and production changes within the existing safeguards; it **does not** attest to other publishers' intellectual property rights, the correctness of regulations, product manufacturers, chemical compositions, health advice, shade measurements or EU compliance.

Public source references can remain online. **Do not bulk-publish original protected passages or mark extracted text as a verified product-safety or regulatory fact.** The existing `nyxi_reviewed_fragments_v1` public gate remains unchanged until an equally auditable automated excerpt-rights and factual assertion release mechanism exists. This is a technical gap, not a request for a human reviewer.

## Agents / roadmap

- **Acquisition agent:** run scheduled exact-asset capture, enforce source terms, integrity and access denials automatically.
- **Extraction agent:** use machine quality filtering, preserve all original snapshot hashes, no per-fragment human approval queue.
- **Knowledge agent:** enrich machine-eligible private evidence into ingredients, manufacturer/line/shade candidates and provenance edges. Never promote unverified candidate identities into manufacturer-verified facts.
- **Regulation/safety agent:** cross-check current effective dates, source authority and explicit applicability. Unsupported safety/legal claims remain unpublished automatically, without asking someone to waive checks.
- **Release agent:** wire independently verified reusable summaries/facts into public search after an automated rights-aware release contract, not by impersonating two human reviewers. Keep original public view fail-closed until this contract is deployed.

This standing mode applies to future NYXI ingestion by default and should not be reverted silently.
