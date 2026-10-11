# NYXI Agent 5 integration checkpoint (2026-10-12)

PR #1476 remains a draft. The server-to-Edge request must include a valid server-only JWT when Supabase Edge verify_jwt=true. A configured endpoint without the JWT must return 503, not call upstream. The current PR head still lacks this correction.

Production search must remain unavailable until independently authorized fragment approvals and revocation tests pass. No pending or revoked fragments may be returned. Verify the reviewer audit contract, production build, dedicated deployment, and rollback before release.
