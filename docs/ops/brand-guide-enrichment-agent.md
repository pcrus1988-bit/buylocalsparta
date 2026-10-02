# Brand Guide enrichment agent

The `brand-guide-enrichment-agent` turns an explicitly queued brand into an editorial **draft for human review**. It does not publish Brand Guides and it does not decide live product availability.

## Data boundary

The worker may use:

- the canonical brand name and official website already stored in `public.brands`;
- the official homepage plus up to two same-origin About / Story / History pages;
- OpenAI Structured Outputs to turn that official-source text into the existing `metadata.brand_guide` schema.

The worker must not use model-generated claims for stock, price, vendor availability, catalogue counts, or category availability. Those remain derived from `storefront_catalog_read_model` by the public Brand Guide runtime.

## Review and SEO safety

Successful enrichment always writes:

- `status = needs_review`;
- `seo_indexable = false`;
- verified source URLs captured from pages the worker actually fetched;
- `agent_status = complete`, model, response id, confidence and timestamps.

Existing non-empty editorial strings are preserved. Existing arrays are retained and augmented. A brand already marked `ready` or `published` is blocked from automated rewriting.

Publishing and indexing therefore remain explicit admin actions and still pass the Brand Guide quality gate.

## Queueing

Admins can queue one brand from its Brand Guide panel or use **Queue 100 AI drafts** in `/admin/catalogue/brands`.

The bulk action only selects brands that are:

- active;
- backed by an official website;
- represented by currently sellable catalogue inventory;
- `empty`, `draft`, or `needs_review`;
- not already queued or processing.

The bulk action never queues `ready` or `published` Brand Guides.

## Runtime and authentication

The Edge Function uses the same private `brand_backfill_agent_token` Vault secret as the brand catalogue backfill workers. The raw token is not stored in the repository.

The worker batch size is intentionally **1 brand per invocation** to bound API cost and execution time.

Required Edge Function secret:

```
OPENAI_API_KEY
```

Optional:

```
OPENAI_BRAND_GUIDE_MODEL
```

If no model is configured, the current worker default is `gpt-6-astra`. The API call uses the Responses API with strict JSON Schema output and `store: false`.

## Activation

Deploying the function does not start enrichment. Keep cron disabled until the OpenAI secret is configured and a manual test brand has been reviewed.

A production cron can then call:

```sql
select net.http_post(
  url := 'https://eemihhfreggbigxejjhj.supabase.co/functions/v1/brand-guide-enrichment-agent',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-agent-token', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'brand_backfill_agent_token'
    )
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
);
```

Start with a low cadence because each non-empty queue invocation may produce one paid model request. Increase only after source quality, review rate, latency, and cost are understood.

## Failure states

- `blocked / missing_official_website` — identity enrichment must provide a verified website first.
- `blocked / reviewed_or_published_content_requires_manual_edit` — the worker refuses to rewrite reviewed content.
- `failed` — source retrieval, model call, structured output parsing, or database write failed. The admin can inspect `agent_last_error` and requeue after correction.
