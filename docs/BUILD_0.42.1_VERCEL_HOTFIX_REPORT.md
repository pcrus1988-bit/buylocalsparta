# Buy Local Sparta Build 0.42.1 — Vercel Hotfix Forward-Port Report

**Base:** Build 0.42.0  
**Patch source:** seven `build-0.37-vercel-hotfix*.patch` files supplied by the project owner  
**Result:** all seven patch intents forward-ported to the current codebase without reverting newer Build 0.38–0.42 functionality.

## Patch-by-patch application

| Patch | Status | Forward-ported result |
|---|---|---|
| `build-0.37-vercel-hotfix(1).patch` | Applied | Memory Admin fairness snapshots are normalized from deficit/exposure maps to the supplier-array shape rendered by `/admin/fairness`. |
| `build-0.37-vercel-hotfix-2(1).patch` | Applied | Admin orders/returns wrapper preserves the concrete memory workspace return contract; PostgreSQL order projection uses an explicit typed order shape. |
| `build-0.37-vercel-hotfix-3(1).patch` | Applied | `/api/catalog` now awaits asynchronous `getCatalogCards()` before mapping results. |
| `build-0.37-vercel-hotfix-4 (1).patch` | Applied with adaptation | PostgreSQL Vendor trust projection now returns media/compliance `createdAt` and linked `mediaAssetId`; Vendor UI accepts unassigned media. The old upload UI body was **not** restored because Build 0.42 already has the newer S3/private-upload + ClamAV flow. |
| `build-0.37-vercel-hotfix-5(1).patch` | Applied | Invalid `readonly Array<T>` syntax in `VendorCatalogClient` replaced with `ReadonlyArray<T>`. |
| `build-0.37-vercel-hotfix-6(1).patch` | Applied | Next.js `tsconfig.json` now has `allowImportingTsExtensions: true`. |
| `build-0.37-vercel-hotfix-7(1).patch` | Applied with current-runtime adaptation | Added HMAC-signed stateless database-less preview sessions and integrated them into current customer/Vendor/Admin runtime dispatch. PostgreSQL remains authoritative whenever `DATABASE_URL` exists. |

## Stateless Vercel preview authentication

Database-less preview sessions activate only when all applicable gates are explicit:

- `NODE_ENV=production`;
- `DATABASE_URL` absent;
- `BLS_ALLOW_DATABASELESS_PREVIEW=true`;
- `BLS_ENABLE_DEMO_ACCOUNTS=true`;
- relevant `BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME`, `BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME`, or `BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME=true`;
- shared `BLS_AUTH_SECRET` of at least 32 characters.

The signed preview token contains only the minimum demo session claims: user ID, normalized email, roles, optional Vendor ID, CSRF token, session ID, issue time and expiry. HMAC-SHA256 protects the token. Logout is cookie-driven in this preview-only mode. Real production continues to use PostgreSQL sessions with durable server-side revocation and cross-instance rate limiting.

Demo credentials retained by the forward-port:

- Customer: `customer@demo.local` / `Customer!123`
- Vendor: `vendor1@demo.local` (and numbered fictional demo vendors) / `Vendor!12345`
- Admin: `admin@demo.local` / `AdminStrong!123`
- Finance checker: `finance@demo.local` / `FinanceStrong!123`

## Regression protection added

Build 0.42.1 adds `npm run test:preview-auth` to the normal `npm run check` chain. It proves:

- signed session round-trip;
- wrong-session-kind rejection;
- expiry rejection;
- HMAC tamper rejection;
- CSRF enforcement;
- PostgreSQL precedence when `DATABASE_URL` is present.

The project-consistency gate also now checks:

- async catalog `await`;
- `allowImportingTsExtensions`;
- valid `ReadonlyArray<T>` syntax;
- preview session wiring in all three web runtimes;
- Admin fairness result shape;
- Vendor media/compliance projection fields expected by the UI.

## Verification

On the exact Build 0.42.1 source:

- 210/210 Core tests passed;
- 8/8 Viva tests passed;
- 4/4 AADE myDATA tests passed;
- 3/3 media/ClamAV tests passed;
- 2/2 Meilisearch tests passed;
- 3/3 Resend tests passed;
- 5/5 BOX NOW tests passed;
- database-less preview-auth verification passed;
- 37/37 immutable migrations verified;
- project consistency/security/provider/activation gate passed;
- 4/4 development UI syntax checks passed;
- 6/6 accessibility structural checks passed;
- complete HTTP marketplace smoke journey passed;
- 377 TS/TSX files parsed with 0 syntax errors;
- 377 TS/TSX files scanned with 0 broken relative imports.

No SQL migration was added or modified by this hotfix release.

## Remaining deployment proof

These patches address source/runtime/Vercel-preview defects, but this environment still does not contain the installed Next/React dependency tree required to truthfully claim a real `next build`. The configured Node 24 production CI/Vercel deployment remains the authoritative framework-build proof.
