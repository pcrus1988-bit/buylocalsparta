# KONTA MOY Admin Personal Assistant

## Purpose

The Admin Personal Assistant is an operational intelligence layer for `/admin`. It is not a generic chat widget and it is never required for core Admin functionality.

The V1 architecture deliberately separates deterministic KONTA MOY diagnostics from model-generated explanation. The page continues to work when the model provider, external research or the entire assistant feature is unavailable.

## Architecture

### Context engine

`apps/web/src/lib/admin-assistant/context.ts` converts the current Admin route and bounded query/filter state into semantic context: domain, page type, current entity when one is encoded by the route, selected tab/filter and capabilities. It never scrapes arbitrary DOM text.

To make a new Admin page assistant-aware, add or refine its route mapping in `routeDescriptor`, then register a deterministic domain read in `tools.ts` when the page has operational data worth analysing. Unknown pages still receive safe generic context.

### Deterministic insight engine

`tools.ts` calls existing server-side Admin/domain services only. It does not expose arbitrary SQL to the model. Current V1 checks cover:

- Admin operational briefing / dashboard queues;
- catalogue overview, taxonomy health and unmapped source-attribute observations;
- orders and returns;
- partner application state;
- tax-document transmission/error/MARK-reconciliation state;
- SEO diagnostics and index eligibility;
- platform dependency health, background jobs and recent Admin audit activity.

Gift Cards are page-aware in V1 but intentionally do not claim a redemption-health diagnosis until a dedicated deterministic gift-card diagnostic is added.

### Model orchestration

`service.ts` uses the OpenAI Responses API through server-side `fetch` only when `OPENAI_API_KEY` is configured. The default model is configurable and currently defaults to `gpt-5.6-luna`. The model receives a compact authorised snapshot, the current question and bounded recent conversation history. It never receives unrestricted database access.

AI output is constrained to a small JSON structure containing summary, facts, interpretation and recommendations. The model cannot emit executable UI commands. Invalid structured output falls back to deterministic guidance.

External web research is disabled by default. When explicitly enabled, only questions with an external-verification signal may expose the provider web-search tool. Returned public sources are shown separately from KONTA MOY facts. External/web content is always treated as untrusted data.

### Action awareness

Existing `AdminActionButton` emits a privacy-minimised browser event after the normal Admin endpoint confirms success. The event contains only the action label, endpoint and timestamp — never mutation payloads, reasons, customer data or secrets. The assistant then re-runs deterministic reads to evaluate the new state. The existing server audit log remains the authoritative action record.

V1 does **not** execute assistant-generated writes. `ADMIN_ASSISTANT_ACTIONS` exists as a rollout flag but remains off and no execution route is exposed. Future assisted writes must use preview → explicit approval → normal domain service → audit → revalidation.

### Persistence

Migration `0168_admin_assistant.sql` adds:

- `admin_assistant_conversations`;
- `admin_assistant_messages`;
- `admin_assistant_tool_audit`.

The tables use the existing credential-bound platform RLS model. Conversation queries additionally scope by authenticated `admin_user_id`. Core commerce records are not copied into assistant storage.

The database-less preview runtime falls back to bounded in-process memory so the feature remains testable without PostgreSQL.

## Security model

- All assistant APIs require an authenticated Admin session.
- POST requests require the existing Admin CSRF token.
- Existing Admin permissions control which deterministic tools are available.
- No arbitrary SQL or model-generated database query is accepted.
- No assistant response can bypass normal catalogue, finance, tax, fulfilment or vendor business logic.
- Model context excludes passwords, cookies, API secrets, payment credentials and unrelated customer personal data.
- Imported product/vendor/Icecat/web content is explicitly marked untrusted in the version-controlled system instructions.
- External links are accepted only from provider URL annotations and only for HTTPS sources.
- Conversation and tool audit queries are Admin-user scoped.
- A per-instance fixed-window request limiter protects model/API usage. A distributed PostgreSQL-backed limiter is a recommended next hardening step for multi-instance production.

## Feature flags and environment

- `ADMIN_ASSISTANT_ENABLED` — defaults to enabled; set `false` for immediate kill switch.
- `ADMIN_ASSISTANT_PROACTIVE_INSIGHTS` — defaults to enabled.
- `ADMIN_ASSISTANT_EXTERNAL_RESEARCH` — defaults to disabled.
- `ADMIN_ASSISTANT_ACTIONS` — defaults to disabled; V1 exposes no assistant write execution route.
- `ADMIN_ASSISTANT_MODEL` — defaults to `gpt-5.6-luna`.
- `ADMIN_ASSISTANT_MAX_OUTPUT_TOKENS` — defaults to `1800`, hard bounded to 300–4000.
- `OPENAI_API_KEY` — server only. If absent, deterministic intelligence remains available.

Never expose provider credentials to the browser or store them in assistant conversations.

## UX

Desktop uses a persistent right-side panel that shifts the Admin workspace while open. Tablet/mobile use an overlay/drawer so no permanent width is consumed. Open/collapsed state and the active conversation are browser-persisted. Route changes keep conversation state, refresh semantic context and show a lightweight transition notice. ESC closes the panel. Long model calls can be cancelled.

The UI presents deterministic context/findings first, then conversation. External/public sources are labeled separately.

## Google Cloud decision

No new Google Cloud service is required for V1. The current architecture already has PostgreSQL/RLS, Admin authentication/RBAC, audit/security telemetry, background-job infrastructure and Vercel/Next.js server execution. Adding Google Cloud solely for AI orchestration or secrets would duplicate working infrastructure and increase operational cost and IAM surface without a material reliability gain.

Re-evaluate a specific Google Cloud service only when a concrete requirement cannot be met adequately by current infrastructure (for example, a future document-processing workload or dedicated enterprise search requirement). Any such addition must document cost, least-privilege IAM, failure/fallback behavior and environment separation before adoption.

## Failure behavior

- Assistant disabled: `/admin` works normally and the panel is not mounted.
- No model key / provider failure / timeout / invalid model output: deterministic context and findings continue to work.
- External research unavailable: internal KONTA MOY analysis continues.
- Assistant API error: panel shows a recoverable error; the Admin page is unaffected.
- Conversation history failure: current page/context remains usable.

## Current limitations / next iteration

1. Add a dedicated deterministic Gift Card redemption-health tool and checkout correlation.
2. Add deep product/vendor/order entity aggregators so `Check everything related` can resolve public references and cross-domain state in one server-side read model.
3. Add before-action impact previews for high-impact attribute, taxonomy, SEO, settlement and tax operations.
4. Replace the per-instance assistant request limiter with the existing PostgreSQL fixed-window limiter for fully distributed enforcement.
5. Add approved assistant action schemas only after preview/revalidation/audit tests are complete.
6. Add richer usage/cost dashboards based on `admin_assistant_tool_audit` without storing sensitive prompt contents.
