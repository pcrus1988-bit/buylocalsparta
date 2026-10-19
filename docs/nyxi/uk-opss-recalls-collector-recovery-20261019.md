# NYXI OPSS Nail Safety Acquisition and Collector Incident Controls · 19 Oct 2026

## Why this implementation

NYXI acquisition includes six asset-approved original pages without archived evidence: four Australian Industrial Chemicals Introduction Scheme pages, one Australian ACCC recall index and the US OSHA HazCom page. The live collector had recorded `upstream_status` for ACCC/OSHA and `collector_error` for AICIS, but did not persist the upstream HTTP code or safe failure classification. Original retry backoff was 24 hours and no manual hold followed repeated network failure. These are *access/transport diagnostic incidents*; they do not imply invalid content, nor permission to bypass a publisher's restrictions.

The six originals remain pending pending a safe authorized retrieval mechanism. The verified AICIS and OSHA pages are still directly linked as references; the ACCC endpoint returned HTTP 403 from external web retrieval. Do not rotate proxies, impersonate browsers, add session cookies, or crawl a different endpoint using a previous asset approval.

## New verified licensed sources

GOV.UK terms https://www.gov.uk/help/terms-conditions and UK National Archives OGL v3 https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ explicitly allow re-use (including commercially) of applicable Crown-copyright text and government feeds with attribution, excluding logos, personal data and third-party works. Three exact publicly available HTML documents were registered as *separately approved* source assets:
- `gb_opss_nail_acrylic_kit_2602_0189` — official OPSS recall of a nail art kit, Feb 2026
- `gb_opss_sun_nail_lamp_2608_0181` — official OPSS safety report of a SUN nail lamp, Aug 2026
- `gb_opss_safety_alerts_index_html` — official GOV.UK safety report index

The exact original bytes are SHA-256 archived in the private `nyxi-evidence` bucket under normal source-specific authorizations and review expiry. Only official HTML was authorized; linked PDF reports, images, logos, third-party works, wider website crawling, and immediate public search publication were excluded. The official OPSS notice is a dated authority statement, NOT a fresh independent conclusion about every product with a similar name.

## Collector changes (Edge function v14)

- Preserve existing scheduler SHA verification and managed internal collection token.
- Persist collector gateway HTTP and upstream HTTP **separately**, plus safe category and previous failure count.
- Return `upstream_access_denied` for 401/403, `upstream_missing_or_moved` for 404/410, `unapproved_redirect_or_origin` for redirected or mismatched final URLs, and `upstream_network_or_tls` for uncategorized Edge `collector_error`.
- Explicit manual review hold on upstream access denial, missing URL, unapproved redirect or **three acquisition failures**, including transport-level failures calling the collector Edge function.
- The scheduler skips `needs_manual_access_review===true`; a reviewer must recheck exact origin and authorization before deciding whether to permit any further fetch. No automatic bypass and no assumed alternate final URL.
- Keep existing 24-hour failure cooldown (or one-hour throttle for 429) and 90-second same-origin crawl delay.
- `nyxi_private_acquisition_incidents_v1` is a `security_invoker=true`, service-role-only read queue presenting the exact source, last errors, retry dates and recommended next step, never a public source mirror.

**No evidence approval**: all new archived fragments have pending independent review, with `nyxi_search_documents_v1` still empty. There is no automatic relationship between a regulatory report and manufacturer product variants; a recall must be matched to an exact product, where applicable, before any SKU advice.

## Verification

- Source approval is still tied to approved exact source URLs and immutable original SHA checks.
- `NYXI Standalone Acceptance` tests include acquisition safety guard contracts.
- Private [Research Workbench](https://docs.google.com/spreadsheets/d/1dgAmsq_bA662vjZEFsNc4Q8Tg8ugi5SWQODkVMTCkW8/edit) now includes `Collector Incidents` and refreshed `LIVE Intake 2026-10-18`. These carry metadata and links only, no raw third-party documents.
- Migration `20261019092036_nyxi_private_acquisition_incidents_v1` is applied and tracked in git.
- Future manual source-access decisions must be documented with publisher terms, HTTP codes, a source-specific replacement approval if the exact URL changes, and a fresh review date.
