# Brand catalogue backfill agents

KONTA MOU runs five staggered Supabase Cron workers against the shared Edge Function
`brand-catalogue-backfill-agent`.

## Purpose

The workers continuously inspect canonical brands that are missing an official website
or canonical logo. They prioritize brands with the most active canonical variants.

For each candidate they:

1. reuse an existing verified website when present;
2. conservatively test likely official domains when a website is missing;
3. verify brand identity before accepting a derived website;
4. inspect the official site for structured/logo assets;
5. validate PNG, WebP, or safe SVG content;
6. copy accepted logos to the canonical `brands` Supabase Storage bucket;
7. write website/logo provenance and last-run metadata to `public.brands`;
8. leave ambiguous brands pending instead of writing an uncertain match.

## Sharding and cadence

The brand UUID is deterministically sharded across five workers. Each worker handles a
small batch and the schedules are staggered to avoid simultaneous catalogue/database load.

- Agent 1 — minute 02 every hour — worker id 0
- Agent 2 — minute 14 every hour — worker id 1
- Agent 3 — minute 26 every hour — worker id 2
- Agent 4 — minute 38 every hour — worker id 3
- Agent 5 — minute 50 every hour — worker id 4

Each invocation currently selects at most two brands, and a brand is not retried by this
worker for 18 hours after a check.

## Authentication

Cron calls use a shared secret stored only in Supabase Vault under
`brand_backfill_agent_token`. The secret value must never be committed to the repository.
The Edge Function verifies the token hash before doing any work.

## Production scheduling

Production jobs are configured directly in Supabase `cron.job` rather than through a
project-specific migration. This prevents development/preview databases from accidentally
calling the production Edge Function.

Job names:

- `brand-backfill-agent-1`
- `brand-backfill-agent-2`
- `brand-backfill-agent-3`
- `brand-backfill-agent-4`
- `brand-backfill-agent-5`
