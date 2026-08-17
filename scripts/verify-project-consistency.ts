import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

type PackageJson = { version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
const root = process.cwd();
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8")) as PackageJson;
const rootPackage = readJson("package.json");
const webPackage = readJson("apps/web/package.json");
const corePackage = readJson("packages/core/package.json");
const errors: string[] = [];
const postgresPackage = readJson("packages/postgres-runtime/package.json");
const vivaPackage = readJson("packages/viva-payments/package.json");
const myDataPackage = readJson("packages/aade-mydata/package.json");
const objectStoragePackage = readJson("packages/object-storage/package.json");
const mediaProcessingPackage = readJson("packages/media-processing/package.json");
const searchPackage = readJson("packages/meilisearch-search/package.json");
const resendPackage = readJson("packages/resend-notifications/package.json");
const boxNowPackage = readJson("packages/boxnow-shipping/package.json");
if (rootPackage.dependencies?.pg !== "8.22.0") errors.push("Root runtime must pin pg 8.22.0 for migrations/database tooling");
if (postgresPackage.dependencies?.["@buy-local-sparta/core"] !== corePackage.version) errors.push("PostgreSQL runtime core dependency must match core package version");
if (postgresPackage.dependencies?.pg !== "8.22.0") errors.push("PostgreSQL runtime must pin pg 8.22.0");
if (webPackage.dependencies?.["@buy-local-sparta/postgres-runtime"] !== postgresPackage.version) errors.push("Web PostgreSQL runtime dependency must match local workspace version");
if (postgresPackage.dependencies?.["@buy-local-sparta/viva-payments"] !== vivaPackage.version || webPackage.dependencies?.["@buy-local-sparta/viva-payments"] !== vivaPackage.version) errors.push("Web/PostgreSQL runtime Viva dependency must match the local Viva package version");
if ([vivaPackage, postgresPackage, myDataPackage, objectStoragePackage, mediaProcessingPackage, searchPackage, resendPackage, boxNowPackage].some((pkg) => pkg.version !== rootPackage.version)) errors.push("Release-scoped production adapter versions must match the root build version");
if (postgresPackage.dependencies?.["@buy-local-sparta/aade-mydata"] !== myDataPackage.version || webPackage.dependencies?.["@buy-local-sparta/aade-mydata"] !== myDataPackage.version) errors.push("Web/PostgreSQL runtime myDATA dependency must match the local AADE package version");
if (postgresPackage.dependencies?.["@buy-local-sparta/meilisearch-search"] !== searchPackage.version || webPackage.dependencies?.["@buy-local-sparta/meilisearch-search"] !== searchPackage.version) errors.push("Web/PostgreSQL runtime search dependency must match the local Meilisearch package version");
if (postgresPackage.dependencies?.["@buy-local-sparta/resend-notifications"] !== resendPackage.version || webPackage.dependencies?.["@buy-local-sparta/resend-notifications"] !== resendPackage.version) errors.push("Web/PostgreSQL runtime notification dependency must match the local Resend package version");
if (postgresPackage.dependencies?.["@buy-local-sparta/boxnow-shipping"] !== boxNowPackage.version || webPackage.dependencies?.["@buy-local-sparta/boxnow-shipping"] !== boxNowPackage.version) errors.push("Web/PostgreSQL runtime BOX NOW dependency must match the local BOX NOW package version");
if (webPackage.dependencies?.["@buy-local-sparta/object-storage"] !== objectStoragePackage.version || webPackage.dependencies?.["@buy-local-sparta/media-processing"] !== mediaProcessingPackage.version) errors.push("Web media adapter dependencies must match local release versions");
if (!rootPackage.scripts?.["test:mydata"] || !rootPackage.scripts?.["typecheck:mydata"] || !rootPackage.scripts?.["mydata:check"]) errors.push("Root scripts must expose AADE myDATA tests, typecheck and connectivity check");
if (webPackage.dependencies?.pg !== "8.22.0") errors.push("Web server runtime must declare pg 8.22.0");
if (!rootPackage.scripts?.["typecheck:core"]) errors.push("Root scripts must include Core TypeScript typecheck");
if (!rootPackage.scripts?.["db:ready"] || !rootPackage.scripts?.["db:smoke"] || !rootPackage.scripts?.["worker:postgres"]) errors.push("Root scripts must expose PostgreSQL readiness, smoke and worker commands");
if (!rootPackage.scripts?.["typecheck:postgres-runtime"]) errors.push("Root scripts must include PostgreSQL runtime TypeScript typecheck");
if (!rootPackage.scripts?.["test:viva"] || !rootPackage.scripts?.["typecheck:viva"]) errors.push("Root scripts must include Viva provider tests and TypeScript typecheck");
if (!rootPackage.scripts?.["test:search-provider"] || !rootPackage.scripts?.["typecheck:search-provider"] || !rootPackage.scripts?.["worker:search"] || !rootPackage.scripts?.["search:configure"]) errors.push("Root scripts must expose Meilisearch tests/typecheck/configuration/worker commands");
if (!rootPackage.scripts?.["test:resend"] || !rootPackage.scripts?.["typecheck:resend"] || !rootPackage.scripts?.["worker:notifications"]) errors.push("Root scripts must expose Resend tests/typecheck/worker commands");
if (!rootPackage.scripts?.["stage:preflight"] || !rootPackage.scripts?.["stage:evidence"] || !rootPackage.scripts?.["typecheck:activation"]) errors.push("Root scripts must expose staging preflight, activation evidence and activation typecheck commands");
if (!rootPackage.version) errors.push("Root package version is missing");
if (webPackage.version !== rootPackage.version) errors.push(`Web version ${webPackage.version ?? "missing"} must match root build ${rootPackage.version ?? "missing"}`);
const coreDependency = webPackage.dependencies?.["@buy-local-sparta/core"];
if (!coreDependency) errors.push("Web workspace must declare @buy-local-sparta/core");
if (coreDependency?.startsWith("workspace:")) errors.push("npm does not accept the workspace: protocol in this deployment toolchain; use the local core semver");
if (corePackage.version && coreDependency !== corePackage.version) errors.push(`Web core dependency ${coreDependency ?? "missing"} must match core package version ${corePackage.version}`);

const read = (path: string) => readFileSync(join(root, path), "utf8");
const productionCi = read(".github/workflows/production-ci.yml");
if (!productionCi.includes("Typecheck PostgreSQL runtime") || !productionCi.includes("npm run typecheck:postgres-runtime")) errors.push("Production CI must typecheck the PostgreSQL runtime before deployment checks");
if (!productionCi.includes("Typecheck Meilisearch search adapter") || !productionCi.includes("npm run typecheck:search-provider")) errors.push("Production CI must typecheck the Meilisearch search adapter");
if (!productionCi.includes("Typecheck Resend notification adapter") || !productionCi.includes("npm run typecheck:resend")) errors.push("Production CI must typecheck the Resend notification adapter");
if (!productionCi.includes("Typecheck BOX NOW shipping adapter") || !productionCi.includes("npm run typecheck:boxnow")) errors.push("Production CI must typecheck the BOX NOW shipping adapter");
if (!productionCi.includes("Typecheck staging activation tooling") || !productionCi.includes("npm run typecheck:activation")) errors.push("Production CI must typecheck staging activation tooling");
if (rootPackage.version && !read("README.md").includes(`## Build ${rootPackage.version}`)) errors.push("README build heading is out of sync with package.json");
if (rootPackage.version && !read("docs/PROJECT_STATUS.md").includes(`**Current development build:** ${rootPackage.version}`)) errors.push("PROJECT_STATUS current build is out of sync with package.json");
if (!read("dev/server.ts").includes('import { BUILD_VERSION } from "./build.ts";')) errors.push("Development server must derive build identity from dev/build.ts");
if (!read("apps/web/src/proxy.ts").includes('requestHeaders.set(VISITOR_HEADER, visitorKey)')) errors.push("Next.js proxy must overwrite the trusted per-browser visitor identity header");
const nextConfig = read("apps/web/next.config.ts");
for (const header of ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
  if (!nextConfig.includes(header)) errors.push(`Production Next.js security header ${header} is missing`);
}
if (!nextConfig.includes('"@buy-local-sparta/postgres-runtime"')) errors.push("Next.js must transpile the local PostgreSQL runtime workspace");
if (!nextConfig.includes('"@buy-local-sparta/viva-payments"')) errors.push("Next.js must transpile the local Viva payments workspace");
if (!nextConfig.includes('"@buy-local-sparta/aade-mydata"')) errors.push("Next.js must transpile the local AADE myDATA workspace");
if (!nextConfig.includes('"@buy-local-sparta/meilisearch-search"')) errors.push("Next.js must transpile the local Meilisearch search workspace");
if (!nextConfig.includes('"@buy-local-sparta/resend-notifications"')) errors.push("Next.js must transpile the local Resend notification workspace");
if (!nextConfig.includes('serverExternalPackages: ["pg"]')) errors.push("Next.js must keep pg as a server-external package");
if (!read("apps/web/tsconfig.json").includes('"allowImportingTsExtensions": true')) errors.push("Next.js TypeScript config must permit the local .ts workspace exports used by Vercel builds");
const catalogApiRoute = read("apps/web/src/app/api/catalog/route.ts");
if (!catalogApiRoute.includes("(await getCatalogCards(")) errors.push("Catalog API must await the async catalog projection before mapping results");
const vendorCatalogClient = read("apps/web/src/components/VendorCatalogClient.tsx");
if (vendorCatalogClient.includes("readonly Array<")) errors.push("Vendor catalog client must use ReadonlyArray<T>; `readonly Array<T>` is invalid TypeScript");
const previewAuth = read("apps/web/src/lib/preview-auth.ts");
for (const boundary of ["BLS_ALLOW_DATABASELESS_PREVIEW", "BLS_ENABLE_DEMO_ACCOUNTS", "BLS_AUTH_SECRET", "createHmac", "timingSafeEqual"]) {
  if (!previewAuth.includes(boundary)) errors.push(`Database-less preview auth is missing boundary ${boundary}`);
}
for (const runtimePath of ["apps/web/src/lib/customer-state-runtime.ts", "apps/web/src/lib/vendor-runtime.ts", "apps/web/src/lib/admin-runtime.ts"]) {
  const runtimeSource = read(runtimePath);
  if (!runtimeSource.includes("databaseLessPreviewSessionEnabled") || !runtimeSource.includes("databaseLessPreviewSessionFromToken") || !runtimeSource.includes("assertDatabaseLessPreviewCsrf")) errors.push(`${runtimePath} must use stateless signed sessions in explicitly enabled database-less serverless preview mode`);
}
const adminMemoryRuntimeHotfix = read("apps/web/src/lib/admin-memory-runtime.ts");
if (!adminMemoryRuntimeHotfix.includes("qualifiedExposures") || !adminMemoryRuntimeHotfix.includes("Object.keys(fairnessSnapshot.deficits)")) errors.push("Memory Admin fairness workspace must normalize fairness snapshots to the array shape rendered by Next.js");
const postgresVendorOperationsHotfix = read("packages/postgres-runtime/src/vendor-operations.ts");
if (!postgresVendorOperationsHotfix.includes("linked_media.public_id AS media_public_id") || !postgresVendorOperationsHotfix.includes('createdAt:epoch(r.created_at,"created_at")')) errors.push("PostgreSQL Vendor trust projection must expose media/compliance createdAt and linked media IDs expected by the web workspace");
const postgresRuntimeSource = read("packages/postgres-runtime/src/index.ts");
if (!postgresRuntimeSource.includes("PostgresPersistenceBundle") || !postgresRuntimeSource.includes("new Pool")) errors.push("PostgreSQL runtime must construct the real persistence bundle over pg.Pool");
if (!postgresRuntimeSource.includes('this.nativePool.on("error"')) errors.push("PostgreSQL pool must retain an idle-client error listener");
const migrationFiles = readdirSync(join(root, "db/migrations")).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
const latestMigrationVersion = Number(migrationFiles.at(-1)?.slice(0, 4) ?? 0);
if (!postgresRuntimeSource.includes(`EXPECTED_SCHEMA_VERSION = ${latestMigrationVersion}`)) errors.push(`PostgreSQL runtime expected schema must match latest migration ${latestMigrationVersion}`);
const readyRoute = read("apps/web/src/app/api/health/ready/route.ts");
if (!readyRoute.includes("productionDatabaseReadiness") || !readyRoute.includes("const ok = database.ok") || !readyRoute.includes("status: ok ? 200 : 503")) errors.push("Production readiness route must gate on PostgreSQL/Viva readiness and return HTTP 503 when unavailable");
const workerSource = read("workers/postgres-worker.ts");
for (const workerBoundary of ["PostgreSQL worker refused to start", "inventory.reservation_expiry", "payments.viva_reconciliation_watch", "retention.security_events", "retention.analytics_events", "runtime.persistence.scheduledJobs"]) {
  if (!workerSource.includes(workerBoundary)) errors.push(`PostgreSQL worker is missing durable boundary ${workerBoundary}`);
}
const ciSource = read(".github/workflows/production-ci.yml");
for (const ciBoundary of ["node-version: 24", "postgis/postgis:18-3.6", "npm run db:migrate", "npm run db:smoke", "npm run check:web"]) {
  if (!ciSource.includes(ciBoundary)) errors.push(`Production CI is missing ${ciBoundary}`);
}
for (const envKey of ["DATABASE_URL=", "BLS_DB_POOL_MAX=", "BLS_DB_CONNECT_TIMEOUT_MS=", "BLS_DB_IDLE_TIMEOUT_MS=", "BLS_WORKER_POLL_MS=", "BLS_ALLOW_DATABASELESS_PREVIEW=", "VIVA_PAYMENTS_ENABLED=", "VIVA_ENVIRONMENT=", "VIVA_CLIENT_ID=", "VIVA_CLIENT_SECRET=", "VIVA_MERCHANT_ID=", "VIVA_API_KEY=", "VIVA_SOURCE_CODE=", "BLS_MYDATA_ISSUANCE_ENABLED=", "BLS_MYDATA_MAPPING_VERSION=", "AADE_MYDATA_ENVIRONMENT=", "AADE_MYDATA_BASE_URL=", "AADE_MYDATA_USER_ID=", "AADE_MYDATA_SUBSCRIPTION_KEY=", "AADE_MYDATA_SPEC_VERSION=", "BLS_SEARCH_ENABLED=", "MEILISEARCH_URL=", "MEILISEARCH_INDEX_UID=", "MEILISEARCH_SEARCH_KEY=", "MEILISEARCH_ADMIN_KEY=", "BLS_EMAIL_DELIVERY_ENABLED=", "RESEND_API_KEY=", "RESEND_FROM=", "RESEND_WEBHOOK_SECRET=", "BLS_NOTIFICATION_SUPPRESSION_SECRET="]) {
  if (!read(".env.example").includes(envKey)) errors.push(`Production database environment ${envKey.replace("=", "")} must be documented`);
}
if (read("packages/core/src/persistence/postgres-analytics.ts").includes("TransactionScope")) errors.push("Core PostgreSQL analytics must use the actual DatabaseScope type");
if (!read("packages/core/src/commerce/types.ts").includes('"chargeback"')) errors.push("PaymentStatus must include the chargeback state used by the payment provider");
if (!read("packages/core/src/fairness/types.ts").includes('"bulky_special"')) errors.push("FulfilmentMode must include the bulky_special mode present in the database schema");
const productionWebSource = walk(join(root, "apps/web/src")).filter((path) => /\.(ts|tsx)$/.test(path)).map((path) => readFileSync(path, "utf8")).join("\n");
for (const forbiddenVisitor of ["homepage-demo", "shop-page", "production-web-demo"]) {
  if (productionWebSource.includes(forbiddenVisitor)) errors.push(`Production web source still contains shared fairness visitor key ${forbiddenVisitor}`);
}
if (/const BUILD\s*=\s*"\d+\.\d+\.\d+"/.test(read("dev/server.ts"))) errors.push("Development server contains a hard-coded build version");
const loginRoute = read("apps/web/src/app/api/account/login/route.ts");
if (!loginRoute.includes("httpOnly: true")) errors.push("Customer session cookie must remain HttpOnly");
if (!loginRoute.includes("x-bls-visitor") || !loginRoute.includes("consumeCustomerLoginRateLimit")) errors.push("Customer login must use trusted visitor-scoped cross-instance abuse control");
const accountSession = read("apps/web/src/lib/account-session.ts");
if (!accountSession.includes("assertCustomerCsrf") || !accountSession.includes("AUTH_REQUIRED")) errors.push("Customer account mutations must retain authenticated CSRF protection");
const checkoutRoute = read("apps/web/src/app/api/checkout/route.ts");
if (!checkoutRoute.includes("customerId:") || !checkoutRoute.includes("getAccountSession")) errors.push("Authenticated checkout must attach customer identity without blocking guest checkout");
if (!checkoutRoute.includes("assertCustomerCsrf(principal")) errors.push("Authenticated checkout must enforce CSRF while preserving guest checkout");

const customerStateRuntime = read("apps/web/src/lib/customer-state-runtime.ts");
for (const boundary of ["PostgresCustomerAuthService", "PostgresFixedWindowRateLimiter", "customerPrivacy.listForUser", "engagement.listSavedSearches", "notificationOperations.centerForUser", "privacyRequestsForUser"]) {
  if (!customerStateRuntime.includes(boundary)) errors.push(`Customer PostgreSQL cutover is missing ${boundary}`);
}
if (!customerStateRuntime.includes('if (process.env.DATABASE_URL?.trim()) return "postgres"')) errors.push("Customer state must select PostgreSQL whenever DATABASE_URL is configured");
if (!customerStateRuntime.includes("Production customer state requires DATABASE_URL")) errors.push("Customer state must fail closed in production without PostgreSQL");
const customerAuthRuntime = read("packages/postgres-runtime/src/customer-auth.ts");
for (const boundary of ["findAccountForAuthentication", "saveSession", "findSession", "revokeSession", "auth_rate_limit_windows"]) {
  if (!customerAuthRuntime.includes(boundary)) errors.push(`PostgreSQL customer auth runtime is missing ${boundary}`);
}
if (!customerAuthRuntime.includes("verifyCsrf({ sessionId: persisted.sessionId")) errors.push("PostgreSQL customer sessions must verify the persisted CSRF hash before restoration");
const loginPage = read("apps/web/src/app/login/page.tsx");
if (!loginPage.includes("Boolean(process.env.DATABASE_URL?.trim())")) errors.push("Production customer login must be enabled when DATABASE_URL configures shared PostgreSQL state");
const identityTrust = read("packages/core/src/persistence/postgres-identity-trust.ts");
if (!identityTrust.includes('typeof row.password_hash !== "string"')) errors.push("Password authentication must reject passwordless database identities without throwing");
const postgresWorker = read("workers/postgres-worker.ts");
if (!postgresWorker.includes('name: "retention.auth_rate_limits"') || !postgresWorker.includes("auth_rate_limit_windows")) errors.push("PostgreSQL worker must retain bounded auth rate-limit storage");
if (!read("db/migrations/0029_customer_account_runtime.sql").includes("auth_rate_limit_windows")) errors.push("Customer account cutover migration must persist cross-instance login throttles");
const packageScripts = JSON.parse(read("package.json")).scripts ?? {};
if (!packageScripts["typecheck:db-smoke"]) errors.push("Release tooling must semantically typecheck the live database smoke");

for (const script of ["typecheck:object-storage","typecheck:media-processing","typecheck:media-worker","test:media-processing"]) if (!packageScripts[script]) errors.push(`Release tooling must include ${script}`);
const dbSmokeSource = read("scripts/db-integration-smoke.ts");
if (!dbSmokeSource.includes("persistence.trust.saveNotification")) errors.push("Live database smoke must persist notifications through the trust repository that owns the notification write adapter");
for (const boundary of ["crossInstanceCustomerState", "crossInstanceSessionRevocation", "crossInstanceLoginRateLimit", "PostgresCustomerAuthService"]) {
  if (!dbSmokeSource.includes(boundary)) errors.push(`Live database smoke must prove ${boundary}`);
}

const accountRuntime = read("apps/web/src/lib/account-runtime.ts");
if (/export const accountRuntime\s*=/.test(accountRuntime)) errors.push("Account runtime must be lazily initialized so production builds do not require runtime secrets at module analysis time");
if (!accountRuntime.includes("BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME") || !accountRuntime.includes("PostgreSQL identity/personalization adapter")) errors.push("Ephemeral customer account runtime must fail closed in production unless explicitly enabled for preview");
if (!read(".env.example").includes("BLS_AUTH_SECRET=")) errors.push("Account session secret must be documented in .env.example");
const vendorLoginRoute = read("apps/web/src/app/api/vendor/login/route.ts");
if (!vendorLoginRoute.includes("httpOnly: true")) errors.push("Vendor session cookie must remain HttpOnly");
if (!vendorLoginRoute.includes("x-bls-visitor") || !vendorLoginRoute.includes("consumeVendorLoginLimit")) errors.push("Vendor login must use trusted visitor-scoped abuse control");
const vendorSession = read("apps/web/src/lib/vendor-session.ts");
if (!vendorSession.includes("assertVendorCsrf") || !vendorSession.includes("VENDOR_AUTH_REQUIRED")) errors.push("Vendor mutations must retain authenticated CSRF protection");
const vendorRuntime = read("apps/web/src/lib/vendor-runtime.ts");
if (/export const vendorRuntime\s*=/.test(vendorRuntime)) errors.push("Vendor runtime must be lazily initialized so production builds do not require runtime secrets at module analysis time");
if (!vendorRuntime.includes("BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME") || !vendorRuntime.includes("PostgreSQL identity/vendor persistence")) errors.push("Ephemeral vendor runtime must fail closed in production unless explicitly enabled for preview");
if (!vendorRuntime.includes("Vendor inventory access denied") || !vendorRuntime.includes("Vendor fulfilment access denied")) errors.push("Vendor stock and fulfilment mutations must retain server-side vendor isolation");
if (!vendorRuntime.includes("shipping delivery is carrier-confirmed")) errors.push("Vendor backoffice must not allow merchants to self-confirm carrier shipping delivery");
if (!vendorRuntime.includes("PostgresVendorAuthService") || !vendorRuntime.includes("PostgresFixedWindowRateLimiter") || !vendorRuntime.includes("postgresVendorRuntimeEnabled")) errors.push("Vendor auth/session/login throttling must cut over to PostgreSQL when DATABASE_URL is configured");
const postgresVendorOperations = read("packages/postgres-runtime/src/vendor-operations.ts");
for (const boundary of ["vendorScope(principal.userId", "Vendor inventory access denied", "Vendor fulfilment access denied", "catalogWorkspace", "adviceWorkspace", "financeWorkspace", "returnsWorkspace"]) {
  if (!postgresVendorOperations.includes(boundary)) errors.push(`PostgreSQL Vendor operations are missing boundary ${boundary}`);
}
if (postgresVendorOperations.includes("delivery_pricing_snapshot")) errors.push("PostgreSQL Vendor dashboard must read persisted delivery_charge_minor rather than a nonexistent legacy delivery snapshot");
if (!postgresVendorOperations.includes("delivery_charge_minor")) errors.push("PostgreSQL Vendor dashboard must project the persisted delivery charge");
if (!postgresVendorOperations.includes("rejectVendorFulfilment") || !postgresVendorOperations.includes('input.action==="reject"')) errors.push("PostgreSQL Vendor rejection must delegate to the atomic rescue transaction");
const postgresRescueCommerce = read("packages/postgres-runtime/src/customer-commerce.ts");
for (const boundary of ["rejectVendorFulfilment", 'reason: "rescue"', "release_stock_reservation", "requires_customer_action", "rescued_from_fulfilment_id"]) {
  if (!postgresRescueCommerce.includes(boundary)) errors.push(`PostgreSQL atomic rescue is missing boundary ${boundary}`);
}
const rescueMigration = read("db/migrations/0032_vendor_rescue_paid_reservation_hardening.sql");
if (!rescueMigration.includes("rescued_from_fulfilment_id") || !rescueMigration.includes("confirmed','partially_fulfilled','fulfilled','completed','partially_refunded','refunded','disputed")) errors.push("Migration 0032 must preserve rescue traceability and paid-order reservation protection");
if (!dbSmokeSource.includes("atomicVendorRescueRouting")) errors.push("Live database smoke must prove atomic Vendor rescue routing across instances");
if (!dbSmokeSource.includes("crossInstanceMediaPipeline")) errors.push("Live database smoke must prove cross-instance media intent/scan persistence");
const mediaUploadService = read("apps/web/src/lib/media-upload-service.ts");
for (const boundary of ["createVendorMediaUploadIntent", "completeVendorMediaUpload", "BLS_MEDIA_PIPELINE_ENABLED", "BLS_MEDIA_UPLOAD_ORIGIN", "storage().head", "failUploadIntent"]) {
  if (!mediaUploadService.includes(boundary)) errors.push(`Production media upload pipeline is missing boundary ${boundary}`);
}
const mediaPipeline = read("packages/postgres-runtime/src/media-pipeline.ts");
for (const boundary of ["media_upload_intents", "FOR UPDATE SKIP LOCKED", "Uploaded object metadata does not match the signed intent", "scan_lease_owner", "Vendor media access denied"]) {
  if (!mediaPipeline.includes(boundary)) errors.push(`PostgreSQL media pipeline is missing boundary ${boundary}`);
}
const mediaMigration = read("db/migrations/0033_media_upload_pipeline.sql");
if (!mediaMigration.includes("media_upload_intents") || !mediaMigration.includes("product_media_scan_queue_idx")) errors.push("Migration 0033 must persist private upload intents and scan-worker leases");
const mediaWorker = read("workers/media-worker.ts");
for (const boundary of ["ClamAvScanner", "createHash", "promoteVerified", "sourceEtag", "storage.delete", "claimNextScan", "finishScan"]) if (!mediaWorker.includes(boundary)) errors.push(`Media worker is missing ${boundary}`);
const nextConfigSource = read("apps/web/next.config.ts");
if (!nextConfigSource.includes("BLS_MEDIA_UPLOAD_ORIGIN") || !nextConfigSource.includes("connect-src")) errors.push("Production CSP must explicitly allow only the configured media-upload origin");
if (!read(".env.example").includes("BLS_CLAMAV_HOST=") || !read(".env.example").includes("BLS_OBJECT_STORAGE_BUCKET=")) errors.push("Media storage/scanner deployment variables must be documented");
const vendorOperations = read("apps/web/src/lib/vendor-operations-runtime.ts");
for (const boundary of ["Vendor media access denied", "Vendor compliance access denied", "Vendor advice access denied", "Vendor finance access denied", "Vendor return access denied"]) {
  if (!vendorOperations.includes(boundary)) errors.push(`Expanded Vendor workspace is missing server-side ownership boundary: ${boundary}`);
}
if (!vendorOperations.includes("expectedVendorId: vendorId")) errors.push("Vendor media upload must bind upload finalization to the authenticated vendor");
if (!vendorOperations.includes('vendorReport({ marketId: "sparta", vendorId')) errors.push("Vendor analytics must use the vendor-scoped aggregate report");
const vendorApiSource = walk(join(root, "apps/web/src/app/api/vendor")).filter((path) => path.endsWith("route.ts")).map((path) => readFileSync(path, "utf8")).join("\n");
const postgresAdminMedia = read("packages/postgres-runtime/src/admin-operations.ts");
if (!postgresAdminMedia.includes("Automated malware scanner owns media scan state in PostgreSQL mode")) errors.push("PostgreSQL Admin must not manually mark media malware-clean");
for (const forbiddenApproval of ["approveMatch(", "approveOffer(", "reviewComplianceDocument(", "settlements.approve(", "settlements.markPaid("]) {
  if (vendorApiSource.includes(forbiddenApproval)) errors.push(`Vendor API must not expose platform approval control ${forbiddenApproval}`);
}
for (const route of [
  "apps/web/src/app/api/vendor/catalog/products/route.ts",
  "apps/web/src/app/api/vendor/catalog/import/route.ts",
  "apps/web/src/app/api/vendor/media/route.ts",
  "apps/web/src/app/api/vendor/media/intents/route.ts",
  "apps/web/src/app/api/vendor/media/complete/route.ts",
  "apps/web/src/app/api/vendor/compliance/route.ts",
  "apps/web/src/app/api/vendor/advice/messages/route.ts",
  "apps/web/src/app/api/vendor/finance/invoices/route.ts",
  "apps/web/src/app/api/vendor/returns/action/route.ts"
]) {
  if (!read(route).includes("requireVendorSession(request,true)")) errors.push(`Vendor mutation route ${route} must require authenticated CSRF protection`);
}
const orderCancelRoute = read("apps/web/src/app/api/account/orders/[id]/cancel/route.ts");
if (!orderCancelRoute.includes("requireAccountSession(request, true)")) errors.push("Customer order cancellation must remain authenticated and CSRF protected");
if (!read(".env.example").includes("BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME=")) errors.push("Vendor preview-runtime gate must be documented in .env.example");
const adminLoginRoute = read("apps/web/src/app/api/admin/login/route.ts");
if (!adminLoginRoute.includes("httpOnly: true")) errors.push("Admin session cookie must remain HttpOnly");
if (!adminLoginRoute.includes('sameSite: "strict"')) errors.push("Admin session cookie must keep strict same-site protection");
if (!adminLoginRoute.includes("x-bls-visitor") || !adminLoginRoute.includes("consumeAdminLoginLimit")) errors.push("Admin login must use trusted visitor-scoped abuse control");
const adminSession = read("apps/web/src/lib/admin-session.ts");
if (!adminSession.includes("assertAdminCsrf") || !adminSession.includes("ADMIN_AUTH_REQUIRED") || !adminSession.includes("assertAdminPermission")) errors.push("Admin mutations must retain authenticated CSRF and permission checks");
const adminRuntime = read("apps/web/src/lib/admin-runtime.ts");
const adminMemoryRuntime = read("apps/web/src/lib/admin-memory-runtime.ts");
if (!adminRuntime.includes("postgresAdminRuntimeEnabled") || !adminRuntime.includes("PostgresAdminAuthService") || !adminMemoryRuntime.includes("BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME")) errors.push("Admin runtime must dispatch to PostgreSQL in database mode while the memory adapter remains production-gated");
if (!adminRuntime.includes("Settlement maker cannot approve") && !read("packages/core/src/finance/settlement.ts").includes("Settlement maker cannot approve")) errors.push("Settlement maker/checker separation must remain enforced");
if (!read(".env.example").includes("BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME=")) errors.push("Admin preview-runtime gate must be documented in .env.example");
const adminGovernance = read("apps/web/src/lib/admin-governance-runtime.ts");
const adminGovernanceMemory = read("apps/web/src/lib/admin-governance-memory.ts");
const postgresAdminGovernance = read("packages/postgres-runtime/src/admin-governance.ts");
if (!adminGovernance.includes("postgresAdminRuntimeEnabled") || !adminGovernanceMemory.includes("BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME") || !postgresAdminGovernance.includes("PostgresAdminGovernanceService")) errors.push("Expanded Admin governance must use PostgreSQL in database mode while the memory adapter remains production-gated");
for (const boundary of ["privacy.manage", "reviews.manage", "returns.manage", "content.write", "analytics.market.read"]) {
  if (!adminGovernance.includes(boundary)) errors.push(`Expanded Admin governance is missing permission boundary ${boundary}`);
}
if (!postgresAdminGovernance.includes("suppressed=true,recalled=true") || !postgresAdminGovernance.includes("recall_affected_orders") || !postgresAdminGovernance.includes("product_recall")) errors.push("PostgreSQL Admin recall workflow must suppress the governed product, identify affected fulfilled customers and queue notifications");
const catalogView = read("apps/web/src/lib/catalog-view.ts");
if (!vendorOperations.includes("canonicalIsPubliclyAllowed") || !vendorOperations.includes("!canonical.suppressed") || !vendorOperations.includes("!canonical.recalled")) errors.push("Production web must centralize canonical recall/compliance admission in Vendor operations governance");
if (!catalogView.includes("canonicalIsPubliclyAllowed")) errors.push("Public catalog must suppress inactive/recalled/compliance-held canonical products before fairness assignment");
if (!accountRuntime.includes("canonicalIsPubliclyAllowed")) errors.push("Customer availability and saved-search projections must respect canonical recall/compliance suppression");
const customerCommerceRuntime = read("apps/web/src/lib/customer-commerce-runtime.ts");
const postgresCustomerCommerce = read("packages/postgres-runtime/src/customer-commerce.ts");
const freshnessMigration = read("db/migrations/0013_workers_search_freshness.sql");
if (!freshnessMigration.includes("ADD COLUMN IF NOT EXISTS stock_confirmed_at") || !freshnessMigration.includes("ADD COLUMN IF NOT EXISTS freshness_ttl_seconds")) errors.push("Fresh PostgreSQL migration chain must not re-add inventory freshness columns introduced in migration 0006");
if (!checkoutRoute.includes("checkoutCustomer") || !customerCommerceRuntime.includes("canonicalIsPubliclyAllowed") || !postgresCustomerCommerce.includes("cv.active=true AND cv.suppressed=false AND cv.recalled=false")) errors.push("Checkout must reject recalled/compliance-held canonical products before commerce admission in both development and PostgreSQL paths");
if (!postgresCustomerCommerce.includes('isolation: "serializable"') || !postgresCustomerCommerce.includes("reserve_stock") || !postgresCustomerCommerce.includes("checkout_fingerprint")) errors.push("PostgreSQL checkout must retain serializable stock reservation and payload-fingerprint idempotency");
if (!postgresCustomerCommerce.includes("cart_items_standard_unique") && !read("db/migrations/0030_customer_commerce_runtime.sql").includes("cart_items_standard_unique")) errors.push("Authenticated PostgreSQL cart items require a NULL-safe canonical uniqueness constraint");
if (!read("apps/web/src/app/api/account/cart/route.ts").includes("requireAccountSession(request, true)")) errors.push("Persistent customer cart mutations must remain authenticated and CSRF protected");
if (checkoutRoute.includes("BLS_ALLOW_PRE_PSP_CHECKOUT") || read(".env.example").includes("BLS_ALLOW_PRE_PSP_CHECKOUT")) errors.push("Legacy pre-PSP checkout preview gate must be removed once Viva Smart Checkout is wired");
if (!checkoutRoute.includes("vivaPaymentsEnabled") || !checkoutRoute.includes("requireVivaPayments().initiateOrderPayment") || !checkoutRoute.includes("Checkout requires the configured Viva Smart Checkout payment adapter")) errors.push("Production PostgreSQL checkout must fail closed unless Viva Smart Checkout is configured and initiate the provider order after internal checkout");
const vivaRuntime = read("packages/postgres-runtime/src/viva-payments.ts");
const vivaProvider = read("packages/viva-payments/src/index.ts");
const vivaMigration = read("db/migrations/0031_viva_payments.sql");
for (const boundary of ["provider_order_code", "provider_transaction_id", "provider_verified_at", "provider_payload", "manual_review"]) if (!vivaRuntime.includes(boundary) && !vivaMigration.includes(boundary)) errors.push(`Viva persistence/runtime is missing ${boundary}`);
for (const boundary of ['orderCreationState:"creating"', 'orderCreationState:"manual_review"', "automatic retry is blocked", "payment_order_creation_started"]) if (!vivaRuntime.includes(boundary)) errors.push(`Viva payment-order distributed idempotency is missing ${boundary}`);
for (const boundary of ["checkout/v2/orders", "checkout/v2/transactions", "api/transactions/", "api/orders/", "api/messages/config/token", "majorCurrencyToMinor", "parseJsonPreservingOrderCodes"]) if (!vivaProvider.includes(boundary)) errors.push(`Viva provider adapter is missing ${boundary}`);
if (!vivaMigration.includes("COALESCE(o.status::text,'') NOT IN ('confirmed'") || !postgresVendorOperations.includes("consume_stock_reservation")) errors.push("Paid Viva reservations must survive generic expiry and be consumed on confirmed Vendor acceptance");
if (!read("apps/web/src/app/api/payments/viva/webhook/route.ts").includes("parseVivaWebhookJson") || !read("apps/web/src/app/api/payments/viva/webhook/route.ts").includes("webhookVerificationKey")) errors.push("Viva webhook route must implement verification-key handshake and parsed provider events");
if (!read("apps/web/src/app/checkout/success/page.tsx").includes("reconcileTransaction") || !read("apps/web/src/app/checkout/failure/page.tsx").includes("reconcileTransaction")) errors.push("Viva redirect pages must verify provider state instead of trusting browser redirect parameters");
if (!workerSource.includes("creation_attempt_stale") || !workerSource.includes("provider_outcome_unknown")) errors.push("Viva stale payment/refund attempts must be promoted to manual reconciliation instead of automatically retried");
if (!vivaRuntime.includes("late_capture_after_cancellation") || !vivaRuntime.includes("`late-capture:${applied.orderId}`")) errors.push("Late Viva captures after cancellation must trigger one stable auto-refund attempt");
if (!read("packages/postgres-runtime/src/admin-operations.ts").includes("status IN ('manual_review','failed')")) errors.push("Admin payment health must surface both uncertain and explicitly failed Viva refund outcomes");
if (!read("packages/core/src/commerce/types.ts").includes('"requires_action"')) errors.push("PaymentStatus must include the requires_action state persisted by Viva Smart Checkout");
if (!read(".github/workflows/production-ci.yml").includes("Typecheck Viva payment adapter") || !read(".github/workflows/production-ci.yml").includes("npm run typecheck:viva")) errors.push("Production CI must typecheck the Viva payment adapter before live database/build validation");
if (!postgresCustomerCommerce.includes("visitorHash: visitorHash(input.visitorKey)") || !postgresCustomerCommerce.includes("belongs to another visitor")) errors.push("Checkout idempotency fingerprint must remain bound to the trusted visitor identity");
const productionSearchRuntime = read("packages/postgres-runtime/src/search.ts");
const meiliProvider = read("packages/meilisearch-search/src/index.ts");
const resendRuntime = read("packages/postgres-runtime/src/notifications.ts");
const resendProvider = read("packages/resend-notifications/src/index.ts");
if (!productionSearchRuntime.includes("PostgresUnitOfWork") || !productionSearchRuntime.includes("platformAccess:true") || !productionSearchRuntime.includes("hashSearchDocument") || !productionSearchRuntime.includes("search_index_state")) errors.push("Production search projection must use platform-scoped PostgreSQL state and durable document hashing");
if (!meiliProvider.includes("MEILISEARCH_SEARCH_KEY") || !meiliProvider.includes("MEILISEARCH_ADMIN_KEY") || !meiliProvider.includes("#adminKey()")) errors.push("Meilisearch must separate search credentials from index-management credentials");
if (!read("apps/web/src/lib/catalog-view.ts").includes("production.search.search") || !read("apps/web/src/lib/catalog-view.ts").includes('reason: "search_card"')) errors.push("Production customer search must query the external canonical index before Fair Vendor Exposure assignment");
if (!read("workers/search-worker.ts").includes("reconcileAll") || !read("workers/search-worker.ts").includes("runtime.search.configure")) errors.push("Production search worker must configure and reconcile the external index");
if (!resendRuntime.includes("PostgresUnitOfWork") || !resendRuntime.includes("notification_destination_suppressions") || !resendRuntime.includes("notification_provider_events")) errors.push("Resend webhook/suppression state must remain durable and platform-scoped");
if (!resendProvider.includes('"idempotency-key"') || !resendProvider.includes("svix-signature") || !resendProvider.includes("timingSafeEqual")) errors.push("Resend adapter must retain idempotent sends and signed webhook verification");
if (!read("apps/web/src/app/api/webhooks/resend/route.ts").includes("request.text()") || !read("apps/web/src/app/api/webhooks/resend/route.ts").includes("svix-signature")) errors.push("Resend webhook route must verify the signature against the raw request body");
if (!read("packages/core/src/notifications/delivery.ts").includes("channels = [...this.#providers.keys()]") || !read("packages/core/src/persistence/postgres-notifications.ts").includes("channel = ANY($5::text[])")) errors.push("Notification workers must lease only channels for configured providers");
if (!read("packages/postgres-runtime/src/viva-payments.ts").includes("order.payment_confirmed") || !read("packages/postgres-runtime/src/viva-payments.ts").includes("order.refund_completed")) errors.push("Captured/refunded customer payments must enqueue durable transactional notifications when email delivery is enabled");
if (!read("db/migrations/0035_search_email_providers.sql").includes("notification_provider_events") || !read("db/migrations/0035_search_email_providers.sql").includes("notification_destination_suppressions")) errors.push("Migration 0035 must persist provider webhook and suppression state");
const boxNowProvider = read("packages/boxnow-shipping/src/index.ts");
const boxNowRuntime = read("packages/postgres-runtime/src/boxnow-shipping.ts");
const boxNowWebhookRoute = read("apps/web/src/app/api/webhooks/boxnow/route.ts");
if (!rootPackage.scripts?.["test:boxnow"] || !rootPackage.scripts?.["typecheck:boxnow"]) errors.push("Root scripts must include BOX NOW provider tests and typecheck");
for (const boundary of ["/api/v1/auth-sessions", "/api/v1/delivery-requests", "/api/v1/parcels", "label.pdf", ":cancel"]) if (!boxNowProvider.includes(boundary)) errors.push(`BOX NOW provider adapter is missing ${boundary}`);
if (!boxNowProvider.includes("createHmac") || !boxNowProvider.includes("timingSafeEqual") || !boxNowProvider.includes("rawTopLevelProperty") || !boxNowProvider.includes("data.event")) errors.push("BOX NOW webhook verification must sign the exact raw data object and use data.event");
if (!boxNowRuntime.includes("reconcileDelivery") || !boxNowRuntime.includes("automatic re-creation is blocked") || !boxNowRuntime.includes("shipment_provider_events") || !boxNowRuntime.includes("latestEventTime")) errors.push("BOX NOW runtime must preserve uncertain-create reconciliation and durable/out-of-order provider events");
if (!boxNowWebhookRoute.includes("request.text()") || !boxNowWebhookRoute.includes("verifyBoxNowWebhook") || !boxNowWebhookRoute.includes("BOXNOW_WEBHOOK_SECRET")) errors.push("BOX NOW webhook route must verify the raw request body with the configured webhook secret");
if (!read("db/migrations/0036_boxnow_shipping_bridge.sql").includes("shipping_provider_locations") || !read("db/migrations/0036_boxnow_shipping_bridge.sql").includes("shipment_provider_attempts")) errors.push("Migration 0036 must persist BOX NOW origin mappings and provider attempts");
if (!read("apps/web/src/components/CheckoutPageClient.tsx").includes("BoxNowLockerSelector") || !read("apps/web/src/app/api/checkout/route.ts").includes("providerDestinationId")) errors.push("Customer shipping checkout must retain BOX NOW locker selection and server-side destination validation");


const activationPreflight = read("scripts/staging-preflight.ts");
const activationRecorder = read("scripts/record-activation-evidence.ts");
const stagingActivationWorkflow = read(".github/workflows/staging-activation.yml");
const stagingEvidenceWorkflow = read(".github/workflows/staging-scenario-evidence.yml");
if (!read("db/migrations/0037_activation_evidence.sql").includes("provider_activation_evidence") || !read("db/migrations/0037_activation_evidence.sql").includes("append-only")) errors.push("Migration 0037 must retain the append-only activation evidence ledger");
if (!postgresRuntimeSource.includes("PostgresActivationEvidenceService") || !postgresRuntimeSource.includes("activationEvidence")) errors.push("PostgreSQL runtime must expose activation evidence persistence");
for (const boundary of ["VivaPaymentsClient", "requestTransmittedDocs", "ResendEmailProvider", "S3ObjectStorage", "ClamAvScanner", "boxNowShipping", "/api/health/ready", "--record"]) if (!activationPreflight.includes(boundary)) errors.push(`Staging preflight must retain ${boundary} readiness boundary`);
if (!activationRecorder.includes("evidenceDigest") && !read("packages/postgres-runtime/src/activation-evidence.ts").includes('createHash("sha256")')) errors.push("Activation evidence must hash external references instead of persisting them raw");
if (!read("apps/web/src/app/admin/activation/page.tsx").includes("Activation evidence") || !read("apps/web/src/components/AdminWorkspaceHeader.tsx").includes('/admin/activation')) errors.push("Admin Command Centre must expose activation evidence");
if (!stagingActivationWorkflow.includes("workflow_dispatch") || !stagingActivationWorkflow.includes("stage:preflight") || !stagingActivationWorkflow.includes("--record") || !stagingActivationWorkflow.includes("environment: staging")) errors.push("Staging activation workflow must run the recorded read-only preflight under the staging environment");
if (!stagingEvidenceWorkflow.includes("stage:evidence") || !stagingEvidenceWorkflow.includes('EVIDENCE_PROVIDER') || stagingEvidenceWorkflow.includes('--provider=${{ inputs.provider }}')) errors.push("Scenario evidence workflow must quote/manual inputs rather than interpolate them directly into shell arguments");
if (!read("docs/STAGING_ACTIVATION_RUNBOOK.md").includes("Configuration") || !read("docs/STAGING_ACTIVATION_RUNBOOK.md").includes("Scenario") || !read("docs/STAGING_ACTIVATION_RUNBOOK.md").includes("Promotion rule")) errors.push("Staging activation runbook must distinguish configuration, connectivity, scenario and promotion evidence");
for (const envKey of ["BLS_DEPLOYMENT_ENVIRONMENT=", "BLS_ACTIVATION_REQUIRED_PROVIDERS=", "BLS_ACTIVATION_WEB_URL=", "BLS_ACTIVATION_EVIDENCE_TTL_HOURS="]) if (!read(".env.example").includes(envKey)) errors.push(`Activation environment contract is missing ${envKey}`);

const dbSmoke = read("scripts/db-integration-smoke.ts");
for (const proof of ["crossInstanceProductionSearchProjection", "crossInstanceResendDeliveryWebhook", "crossInstancePersistentCart", "idempotentCheckout", "concurrentOversellProtection", "crossInstanceCustomerOrders", "pendingPaymentExpiryCleanup", "crossInstanceVendorSession", "crossInstanceVendorInventory", "crossInstanceVendorCatalog", "crossInstanceVendorFulfilment", "vivaCrossInstancePaymentOrder", "vivaVerifiedPaymentConfirmation", "vivaPaidReservationProtection", "vivaRefundCancellation", "vivaReversalDeduplication", "vivaOutOfOrderWebhookMonotonicity", "vivaLateCaptureAutoRefund", "vendorTenantIsolation", "crossInstanceAdminSession", "crossInstanceAdminCategoryGovernance", "crossInstanceAdminCms", "crossInstanceAdminRecall", "adminSettlementMakerChecker", "crossInstanceAdminAudit", "crossInstanceActivationEvidence"]) {
  if (!dbSmoke.includes(proof)) errors.push(`Live PostgreSQL integration smoke must retain ${proof} proof`);
}
if (!dbSmoke.includes("Promise.allSettled") || !dbSmoke.includes("active_reservations")) errors.push("Live PostgreSQL smoke must exercise concurrent stock contention and verify reservation accounting");
if (!read("packages/postgres-runtime/src/admin-auth.ts").includes("PostgresAdminAuthService") || !read("packages/postgres-runtime/src/admin-operations.ts").includes("PostgresAdminOperationsService") || !postgresAdminGovernance.includes("PostgresAdminGovernanceService")) errors.push("PostgreSQL Admin auth, operations and governance services must remain present");
if (!postgresAdminGovernance.includes("route approved refunds through the configured Viva payments orchestration service") || !adminGovernance.includes("executeApprovedReturnRefund")) errors.push("Direct Admin refund mutation must stay fail-closed while the web orchestration routes approved money movement through Viva");
if (!postgresAdminGovernance.includes("SELECT expire_stock_reservations($1) AS n") || !postgresAdminGovernance.includes("window_started_at") || postgresAdminGovernance.includes("RETURNING id`")) errors.push("PostgreSQL Admin maintenance must use the actual reservation-expiry return value and auth-throttle schema columns");
if (!customerStateRuntime.includes("persistence.trust.saveNotification") || customerStateRuntime.includes("persistence.identity.saveNotification")) errors.push("Customer PostgreSQL notifications must persist through the trust/notification repository, not identity");
if (vendorOperations.includes("categoryCode: variant.categoryCode,")) errors.push("Vendor demo catalog projection must not pass an optional categoryCode into required catalog fields");
if (!read("db/migrations/0030_customer_commerce_runtime.sql").includes("expire_pending_payment_orders") || !read("workers/postgres-worker.ts").includes("expire_pending_payment_orders")) errors.push("Expired reservations must cancel abandoned pending-payment orders through the durable PostgreSQL worker");
if (!postgresCustomerCommerce.includes("co.status <> 'pending_payment'")) errors.push("Pending-payment fulfilments must not consume vendor capacity before payment authorization");
for (const route of [
  "apps/web/src/app/api/admin/logout/route.ts",
  "apps/web/src/app/api/admin/vendors/[id]/transition/route.ts",
  "apps/web/src/app/api/admin/catalog/action/route.ts",
  "apps/web/src/app/api/admin/catalog/canonical/route.ts",
  "apps/web/src/app/api/admin/trust/media/route.ts",
  "apps/web/src/app/api/admin/trust/compliance/route.ts",
  "apps/web/src/app/api/admin/finance/procurement/route.ts",
  "apps/web/src/app/api/admin/finance/settlement/route.ts",
  "apps/web/src/app/api/admin/tax/transmit/route.ts",
  "apps/web/src/app/api/admin/fairness/appeal/route.ts",
  "apps/web/src/app/api/admin/orders/action/route.ts",
  "apps/web/src/app/api/admin/returns/action/route.ts",
  "apps/web/src/app/api/admin/reviews/action/route.ts",
  "apps/web/src/app/api/admin/reviews/report/route.ts",
  "apps/web/src/app/api/admin/privacy/action/route.ts",
  "apps/web/src/app/api/admin/categories/route.ts",
  "apps/web/src/app/api/admin/content/route.ts",
  "apps/web/src/app/api/admin/content/action/route.ts",
  "apps/web/src/app/api/admin/recalls/route.ts",
  "apps/web/src/app/api/admin/recalls/action/route.ts",
  "apps/web/src/app/api/admin/maintenance/run/route.ts"
]) {
  const source = read(route);
  if (!source.includes("requireAdminSession") || !source.includes("csrf:true")) errors.push(`Admin mutation route ${route} must require authenticated CSRF protection`);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const appDir = join(root, "apps/web/src/app");
const routes = new Set<string>(["/"]);
for (const file of walk(appDir)) {
  if (!file.endsWith(`${sep}page.tsx`)) continue;
  const rel = relative(appDir, file).split(sep).join("/").replace(/\/page\.tsx$/, "");
  if (!rel || rel.includes("[")) continue;
  routes.add(`/${rel}`);
}

for (const file of walk(join(root, "apps/web/src")).filter((path) => path.endsWith(".tsx"))) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/href=["']([^"']+)["']/g)) {
    const href = match[1];
    if (!href.startsWith("/") || href.includes("${")) continue;
    const pathname = href.split(/[?#]/)[0] || "/";
    if (!routes.has(pathname)) errors.push(`Broken static Next.js link ${href} in ${relative(root, file)} (no ${pathname} page)`);
  }
}


const myDataSource = read("packages/aade-mydata/src/index.ts");
if (!myDataSource.includes("aade-user-id") || !myDataSource.includes("Ocp-Apim-Subscription-Key") || !myDataSource.includes("SendInvoices") || !myDataSource.includes("RequestTransmittedDocs")) errors.push("AADE myDATA ERP adapter must retain official ERP authentication and core transport methods");
const myDataRuntime = read("packages/postgres-runtime/src/mydata.ts");
if (!myDataRuntime.includes("manual_review") || !myDataRuntime.includes("reconcile it instead of retrying blindly") || !myDataRuntime.includes("BLS_MYDATA_MAPPING_VERSION")) errors.push("AADE myDATA transport must keep uncertain outcomes/manual reconciliation and mapping-version gate");
if (!read("apps/web/src/app/api/health/ready/route.ts").includes("myDataReadiness")) errors.push("Production readiness must include AADE myDATA when issuance is enabled");
if (!read("docs/MYDATA_ERP_RUNBOOK.md").includes("BLS_MYDATA_ISSUANCE_ENABLED=false")) errors.push("AADE myDATA deployment runbook must document the default issuance gate");

if (errors.length) {
  console.error("Project consistency check failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`Project consistency OK: build ${rootPackage.version}; release identity, security, PostgreSQL runtime/CI/schema alignment and static Next.js links verified.`);
