# NYXI private evidence collector (v2)

Live Supabase function: `nyxi-evidence-collector` on project `eemihhfreggbigxejjhj`. This file is the production deployed source as at 18 October 2026.

## Contracts

- Requires a valid internal collector token, a UUID for a **single** source-specific acquisition approval, active dates, retention terms, an exact approved URL and fully reviewed acquisition metadata.
- Only `html_original` or `pdf_original` with `acquisition_method=http`. The collector never reads the discovery registry directly, follows redirects, follows links or fetches separate images.
- Approval metadata must attest `governance_approved=true`, `no_link_following=true`, `no_images=true`, and specify a source-specific robots delay. A PDF can contain embedded illustrations; their rights still need separate review before any republication.
- Private bucket `nyxi-evidence`, bounded at 25 MiB per asset, exact SHA-256 of original bytes, immutable object key, provenance and retention checks, manifest entry and no Drive mirror/public release by default.
- HTML requires `text/html` or `application/xhtml+xml`. The HTML parser can process these as usual.
- PDF requires the literal `%PDF-` magic bytes at offset 0 and content type `application/pdf` or `application/octet-stream`. Reject mislabeled HTML, unexpected payloads and redirects, even when their URL looks like a PDF.
- **No PDF text extraction in this change.** Original PDFs are marked `awaiting_pdf_parser` both in snapshot and manifest and cannot enter the existing HTML extraction queue or public search. A separate sandboxed PDF parser and human evidence review are required before any publishing.
- Evidence collection succeeds only for authorized first-party materials; official government copyright terms do not grant permission to ingest/redistribute manufacturer SDS, copyrighted images or restricted ECHA databases.
- Existing HTML behavior is preserved, including SHA deduplication and manifest recovery. Production collector function keeps `verify_jwt=true` and its internal token check.

## Verification

Production smoke test on 18 Oct 2026: `au_poisons_standard_oct_2026_pdf` fetched as `application/pdf`, raw 2,463,436 bytes; both `nyxi_source_snapshots.parser_status` and `nyxi_corpus_manifest.extraction_status` returned `awaiting_pdf_parser`, with a private storage object. No PDF was marked extraction-ready. Existing HTML archive traffic should remain unchanged.

No secrets, scheduler credential material or external PDFs are committed. Production worker lives under `supabase/functions/nyxi-acquisition-worker/` and is already version-controlled on `main`.
