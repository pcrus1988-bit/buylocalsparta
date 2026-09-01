import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planExternalResearch } from "../apps/web/src/lib/admin-assistant/research-policy.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [phase1, dashboard, matching, searchConsole, catalogGovernance, productIntelligence, customerIntelligence, crawlerIntelligence, globalSearch, toolRegistry, investigation, context, pageRegistry, service, config, researchPolicy, recommendationLifecycle, recommendationRoute, migration200, checksum200, postgresRuntime, shell] = await Promise.all([
  read("apps/web/src/lib/admin-assistant/phase1-snapshot.ts"),
  read("apps/web/src/lib/admin-assistant/dashboard-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/matching-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/search-console-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/catalog-governance-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/product-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/customer-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/crawler-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/global-search.ts"),
  read("apps/web/src/lib/admin-assistant/tool-registry.ts"),
  read("apps/web/src/lib/admin-assistant/investigation.ts"),
  read("apps/web/src/lib/admin-assistant/context.ts"),
  read("apps/web/src/lib/admin-assistant/page-registry.ts"),
  read("apps/web/src/lib/admin-assistant/service.ts"),
  read("apps/web/src/lib/admin-assistant/config.ts"),
  read("apps/web/src/lib/admin-assistant/research-policy.ts"),
  read("apps/web/src/lib/admin-assistant/recommendation-lifecycle.ts"),
  read("apps/web/src/app/api/admin/assistant/recommendations/route.ts"),
  read("db/migrations/0200_admin_assistant_recommendation_states.sql"),
  read("db/migrations/checksums.0200.json"),
  read("packages/postgres-runtime/src/index.ts"),
  read("apps/web/src/components/AdminAssistantShell.tsx")
]);

const productSnapshot = { context: { domain: "catalogue", pageType: "product_matching" }, findings: [{ ruleId: "product_no_canonical_candidate" }] } as any;
assert.equal(planExternalResearch("Should I create a new canonical for this genuinely new product?", productSnapshot, []).useExternalResearch, true);
assert.equal(planExternalResearch("Should I create a new canonical for this product?", productSnapshot, [{ toolName: "getProductMatchingIntelligence", state: "error" } as any]).useExternalResearch, false);
assert.equal(planExternalResearch("What does KONTA MOY currently know?", productSnapshot, []).useExternalResearch, false);

for (const symbol of ["dashboardOperationalIntelligence", "productMatchingIntelligence", "searchConsoleIntelligence", "categoryGovernanceIntelligence", "controlledValueIntelligence", "customerOperationalIntelligence", "crawlerOperationalIntelligence", "applyRecommendationLifecycle"]) assert.match(phase1, new RegExp(symbol));
for (const pageType of ["dashboard", "product_matching", "category_governance", "controlled_values", "customer_detail", "catalogue_crawler"]) assert.match(phase1, new RegExp(pageType));
assert.match(phase1, /applyRecommendationLifecycle\(principal, snapshot\)\.catch\(\(\) => snapshot\)/);

for (const rule of ["return_refund_ready", "paid_order_missing_tax_document", "payment_order_state_mismatch", "product_unmapped_attributes", "vendor_active_without_agreement", "seo_critical_diagnostic", "failed_background_job"]) assert.match(dashboard, new RegExp(rule));
assert.match(dashboard, /prioritizeRecommendations\(candidates, 5\)/);
assert.doesNotMatch(dashboard, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["canonical_conflict", "canonical_candidate_ambiguity", "canonical_low_confidence_auto_link", "product_unlinked_canonical", "product_no_canonical_candidate", "canonical_link_not_offer_ready"]) assert.match(matching, new RegExp(rule));
assert.match(matching, /absence of a candidate is not proof/i);
assert.doesNotMatch(matching, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["search_console_not_ready", "search_console_no_baseline", "search_visibility_decline", "search_console_high_impression_low_ctr", "search_console_near_page_one", "search_console_zero_click_demand"]) assert.match(searchConsole, new RegExp(rule));
assert.match(searchConsole, /do not infer causality/i);
assert.doesNotMatch(searchConsole, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["category_inactive_with_live_products", "category_nonassignable_with_direct_products", "category_empty_active_leaf", "controlled_value_no_target", "controlled_value_unmapped"]) assert.match(catalogGovernance, new RegExp(rule));
assert.match(catalogGovernance, /fuzzy synonym inference, multienum splitting and unit conversion remain review-required/i);
assert.doesNotMatch(catalogGovernance, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["product_missing_greek_title", "product_missing_greek_description", "product_unmapped_attributes", "product_no_approved_vendor_offer", "product_visible_without_sellable_stock", "inventory_stale", "product_active_but_suppressed", "seo_non_indexable_product"]) assert.match(productIntelligence, new RegExp(rule));
for (const table of ["product_identifiers", "vendor_offers", "inventory_balances", "catalog_source_product_links", "catalog_source_attribute_observations"]) assert.match(productIntelligence, new RegExp(table));
assert.match(productIntelligence, /readOnly: true/);
assert.doesNotMatch(productIntelligence, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["customer_active_without_email_verification", "customer_restricted_with_active_sessions", "customer_privacy_request_overdue", "customer_urgent_support_unassigned", "customer_support_followup_overdue", "customer_notification_failures"]) assert.match(customerIntelligence, new RegExp(rule));
for (const required of ["adminCustomerDetail", "adminCustomer360", "emailVerified", "activeSessionCount", "openPrivacyRequests", "openSupportCases"]) assert.match(customerIntelligence, new RegExp(required));
for (const forbidden of [/addresses:/, /phone:/, /email:/, /note:/]) assert.doesNotMatch(customerIntelligence, forbidden);

for (const rule of ["crawler_expired_worker_lease", "crawler_systemic_failures", "crawler_latest_failed", "crawler_high_page_failure_ratio", "crawler_zero_products_extracted", "crawler_possible_source_drift", "crawler_review_heavy_extraction", "crawler_completed_not_promoted"]) assert.match(crawlerIntelligence, new RegExp(rule));
assert.match(crawlerIntelligence, /possible source-template\/content-shape drift or extractor regression/i);
assert.match(crawlerIntelligence, /does not establish causality/i);
assert.doesNotMatch(crawlerIntelligence, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

assert.match(globalSearch, /searchAdminProducts/);
assert.match(globalSearch, /relatedCustomerId/);
assert.match(globalSearch, /hasAdminPermission\(principal, "catalog\.read"\)/);

for (const tool of ["getProductMatchingIntelligence", "getProductIntelligence", "getCustomerOperationalIntelligence", "getCatalogueCrawlerIntelligence", "getSearchConsoleIntelligence"]) assert.match(toolRegistry, new RegExp(tool));
assert.match(toolRegistry, /recordAssistantToolAudit/);
assert.match(toolRegistry, /ASSISTANT_TOOL_PERMISSION_REQUIRED/);

for (const pattern of [/getProductMatchingIntelligence/, /getProductIntelligence/, /getCustomerOperationalIntelligence/, /getCatalogueCrawlerIntelligence/, /getSearchConsoleIntelligence/, /row\.kind === "support"/, /candidates\.slice\(0, 3\)/, /availableAssistantTools/]) assert.match(investigation, pattern);

for (const pattern of [/getProductIntelligence/, /sellableStock=/, /staleInventory=/, /no identifier was inferred by the model/i, /Customer state:/, /open support/, /notificationFailures|notification failure/i]) assert.match(service, pattern);

assert.match(researchPolicy, /private_tool_failure/);
assert.match(researchPolicy, /Public web research must never be used to compensate for a failed private database\/tool read/i);
for (const reason of ["new_canonical_identity_check", "official_tax_guidance_verification", "public_search_intent_verification"]) assert.match(researchPolicy, new RegExp(reason));
assert.match(service, /planExternalResearch/);
assert.match(service, /tools: \[\{ type: "web_search" \}\]/);
assert.match(config, /ADMIN_ASSISTANT_EXTERNAL_RESEARCH", true/);

for (const pattern of [/recommendationEvidenceFingerprint/, /createHash\("sha256"\)/, /admin_user_id=\$1 AND recommendation_key=\$2/, /prior\.fingerprint !== fingerprint/, /state === "snoozed"/, /ASSISTANT_RECOMMENDATION_NOT_FOUND/, /admin_assistant_recommendation_states/]) assert.match(recommendationLifecycle, pattern);
assert.doesNotMatch(recommendationLifecycle, /UPDATE (?:users|customer_orders|vendor_offers|vendor_businesses|canonical_variants|tax_documents)|INSERT INTO (?:users|customer_orders|vendor_offers|vendor_businesses|canonical_variants|tax_documents)|DELETE FROM (?:users|customer_orders|vendor_offers|vendor_businesses|canonical_variants|tax_documents)/i);

assert.match(recommendationRoute, /requireAdminSession\(request, \{ csrf: true \}\)/);
assert.match(recommendationRoute, /setRecommendationLifecycleState/);
assert.match(recommendationRoute, /recordAssistantToolAudit/);
assert.doesNotMatch(recommendationRoute, /"accepted"|"resolved"/);

assert.match(shell, /\/api\/admin\/assistant\/recommendations/);
assert.match(shell, /"x-csrf-token": csrfToken/);
for (const label of [">Dismiss</button>", ">Snooze 1d</button>", ">Intentional</button>"]) assert.ok(shell.includes(label));

assert.match(migration200, /admin_assistant_recommendation_states/);
assert.match(migration200, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration200, /bls_private\.is_platform_runtime\(\)/);
assert.match(migration200, /REVOKE ALL .* FROM PUBLIC/i);
assert.match(migration200, /idx_admin_assistant_tool_audit_conversation/);
assert.match(migration200, /This is assistant metadata only/i);
assert.doesNotMatch(migration200, /GRANT .* TO anon|GRANT .* TO authenticated/i);
assert.match(checksum200, /0200_admin_assistant_recommendation_states\.sql/);
assert.match(checksum200, /e580518d6f43a98924365ad172c6c5c4560777200a6d3cc5f547761c1c3b8b43/);
assert.match(postgresRuntime, /EXPECTED_SCHEMA_VERSION = 200/);

for (const page of ["dashboard", "product_matching", "category_governance", "controlled_values", "customer_detail", "catalogue_crawler"]) assert.match(pageRegistry, new RegExp(page));
assert.match(context, /Find duplicate-risk products/i);
assert.match(context, /Which search queries are opportunities/i);
assert.match(context, /Check this customer's account and support state/i);
assert.match(context, /evidence of possible source drift/i);

console.log("Admin Assistant Phase 1 intelligence acceptance verifier passed.");
