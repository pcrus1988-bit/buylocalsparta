# MERIDIO — real assets, responsible infrastructure

Website: https://meridio.kontamou.site
Application folder: \`products/meridio\` (independent Vercel root, not a root npm workspace).
Owner universe: KONTA MOY / SP BUSINESS LAB.

## Product principles

MERIDIO must operate with **real records, verified permissions and durable evidence**. Do not implement public mock tenants, example assets, sample votes, pretend bookings, placeholder ownership interests, simulated review consoles, fake approval timelines, or financial/token demonstrations.

All previously deployed demos and fixture modules were removed from the deployable tree as of real-intake v0.4, and legacy /workspace and /review-lab routes redirect to /intake. Git history preserves previous versions but production does not deploy them.

## What is live today

- Public factual service home: \`/\`.
- \`/intake/\`: users can enter information about an actual asset they are authorized to document, validate it, download a structured JSON draft dossier, reopen a saved draft and edit it.
- The dossier tool **does not upload, store, email, verify, publish, or share** records. Data is held in the tab only until the file is downloaded or the page closed. There is no third-party analytics dependency in the form.
- \`/health.json\` reports the actual enabled and disabled capabilities.
- No production MERIDIO database, users, private evidence storage, financial, token, booking or governance services have been provisioned.
- The static frontend must never claim a private server action succeeded.

## Local integration contract

\`public/intake/dossier.mjs\` defines \`meridio-asset-dossier/v1\`. All drafts are user-provided and status \`draft\` only. Evidence checkboxes are self-declared categories, *not* verified documents. Import/export JSON is strictly validated.

Test without connecting to any production systems:

\`\`\`bash
node --test products/meridio/test/*.test.mjs
\`\`\`

The \`MERIDIO Real Intake Acceptance\` GitHub workflow runs Node 24 syntax checks and tests, including verification that old simulation modules are absent.

## Production infrastructure — NOT connected yet

1. Confirm owning Supabase organization with the user and create a new isolated MERIDIO Supabase project in an appropriate EU region, subject to cost approval if needed. **Do not use the marketplace or FISCAL production databases.**
2. Add dedicated MERIDIO authentication, tenant membership, RLS and explicit denied-by-default storage and API authorization. Test cross-tenant/anonymous role access against real database privileges.
3. Build a durable server-side asset registry and draft editing workflow from the v1 dossier fields, including auditable versions and idempotency. The server must independently validate inputs and enforce authentication, tenant and role boundaries.
4. Create a private evidence vault with malware and file validation, provenance and signed access grants. This is not a public upload.
5. Implement independent reviewer approvals and append-only audit events in transactions. Allow real publication only after regulatory, legal and document review.
6. Introduce specific utilization, rights and governance capabilities only after the necessary laws and contracts have been reviewed. No investment offers, securities, tokens or payment flows by default.

A generated dossier is neither an application to invest nor proof that a party controls an asset. It is an editable user-owned document, nothing more.

## Deployment

The Vercel project is \`meridio\`, with root \`products/meridio\`, framework Other, output \`public\`, domain \`meridio.kontamou.site\`. Keep Vercel project/env and any future database keys separate from KONTA MOY and FISCAL. Only production builds from \`main\` should point the public custom domain.

## Risk and operational boundaries

- User-entered information may be sensitive: do not transmit it without explicit notice and consent. Do not store files without server-side authentication and access control.
- Browser-generated JSON is not cryptographically authenticated.
- Document-category ticks never amount to evidence verification.
- Neither copyright, intellectual property, assets nor customer/vendor data may be automatically copied from KONTA MOY.
- Never advertise nonexistent users, partners, projects, holdings, investments, voting rights or simulated operational performance.
