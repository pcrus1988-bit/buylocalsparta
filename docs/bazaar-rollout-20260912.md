# BAZAAR production rollout — 2026-09-12

- PR #628 merged at `15a24d93508a132308f60ceac4d66f0a308ce11c`.
- Production schema migrations 0236 and 0237 were staged before the application rollout.
- Production build correctly blocked on the repository schema-head guard until migration 0238 was applied.
- Migration 0238 is scoped to the `nova-brandsgateway` catalogue source and fails closed if a target canonical also has normal-condition source evidence.
- AADE and payment-provider production behavior are outside this rollout and were not changed.

This documentation-only commit retriggers the production deployment after schema 0238 reached production.
