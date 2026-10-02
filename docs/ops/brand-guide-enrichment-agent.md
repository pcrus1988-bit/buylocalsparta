# Brand Guide research worklist

KONTA MOU Brand Guide enrichment is performed from an authenticated ChatGPT working session, not from an OpenAI API integration.

## Why

The application does not require an `OPENAI_API_KEY` for Brand Guide content. The admin surface only maintains a worklist. ChatGPT reads that worklist, researches official sources on the public web, writes a factual Greek draft back to `public.brands`, and leaves the result for human review.

## Worklist

Admins can queue one brand from its Brand Guide panel or use **Queue 100 for ChatGPT** in `/admin/catalogue/brands`.

Bulk queueing only selects brands that are:

- active;
- backed by an official website;
- represented by currently sellable catalogue inventory;
- `empty`, `draft`, or `needs_review`;
- not already queued, processing, or completed.

The queue never includes `ready` or `published` Brand Guides.

## ChatGPT workflow

For each queued brand:

1. read the canonical brand name, website, current guide state, and live catalogue count;
2. research the official brand website and other first-party pages where available;
3. create concise Greek editorial content for the existing `metadata.brand_guide` structure;
4. keep product availability, stock, prices, counts, and category availability sourced only from KONTA MOU catalogue data;
5. preserve existing reviewed editorial fields unless a deliberate replacement is requested;
6. write the draft with `status = needs_review` and `seo_indexable = false`;
7. record official source URLs and mark the work item complete.

## Review and SEO safety

ChatGPT-generated research never publishes itself. A completed research item remains:

- `needs_review`;
- `noindex`;
- editable in `/admin/catalogue/brands`.

An admin must review and explicitly move the guide to `ready` / `published`. Existing Brand Guide quality gates continue to control public indexing.

## No background API worker

There is no scheduled OpenAI API worker for Brand Guide content and no OpenAI API key is required.

The earlier experimental `brand-guide-enrichment-agent` Edge Function is not part of the active workflow and must not be scheduled. Brand research is performed in ChatGPT sessions through the connected KONTA MOU data and repository tools.

## Recommended batch pattern

Process the highest-value brands first:

- brands with the most live products;
- brands with an official website;
- then brands missing only editorial enrichment.

Small batches are preferable because source quality can be inspected as the catalogue expands.
