import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planExternalResearch } from "../apps/web/src/lib/admin-assistant/research-policy.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [phase1, dashboard, matching, searchConsole, catalogGovernance, productIntelligence, customerIntelligence, globalSearch, toolRegistry, investigation, context, pageRegistry, service, config, researchPolicy] = await Promise.all([
  read("apps/web/src/lib/admin-assistant/phase1-snapshot.ts"),
  read("apps/web/src/lib/admin-assistant/dashboard-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/matching-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/search-console-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/catalog-governance-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/product-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/customer-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/global-search.ts"),
  read("apps/web/src/lib/admin-assistant/tool-registry.ts"),
  read("apps/web/src/lib/admin-assistant/investigation.ts"),
  read("apps/web/src/lib/admin-assistant/context.ts"),
  read("apps/web/src/lib/admin-assistant/page-registry.ts"),
  read("apps/web/src/lib/admin-assistant/service.ts"),
  read("apps/web/src/lib/admin-assistant/config.ts"),
  read("apps/web/src/lib/admin-assistant/research-policy.ts")
]);

const productSnapshot = { context: { domain: "catalogue", pageType: "product_matching" }, findings: [{ ruleId: "product_no_canonical_candidate" }] } as any;
assert.equal(planExternalResearch("Should I create a new canonical for this genuinely new product?", productSnapshot, []).useExternalResearch, true);
assert.equal(planExternalResearch("Should I create a new canonical for this product?", productSnapshot, [{ toolName: "getProductMatchingIntelligence", state: "error" } as any]).useExternalResearch, false);
assert.equal(planExternalResearch("What does KONTA MOY currently know?", productSnapshot, []).useExternalResearch, false);

for (const symbol of ["dashboardOperationalIntelligence", "productMatchingIntelligence", "searchConsoleIntelligence", "categoryGovernanceIntelligence", "controlledValueIntelligence", "customerOperationalIntelligence"]) assert.match(phase1, new RegExp(symbol));
for (const pageType of ["dashboard", "product_matching", "category_governance", "controlled_values", "customer_detail"]) assert.match(phase1, new RegExp(pageType));
assert.match(phase1, /\["seo_overview", "search_console"\]/);

for (const rule of ["return_refund_ready", "paid_order_missing_tax_document", "payment_order_state_mismatch", "product_unmapped_attributes", "vendor_active_without_agreement", "vendor_no_active_location", "seo_critical_diagnostic", "failed_background_job"]) assert.match(dashboard, new RegExp(rule));
assert.match(dashboard, /Promise\.all/);
assert.match(dashboard, /hasAdminPermission/);
assert.match(dashboard, /prioritizeRecommendations\(candidates, 5\)/);
assert.match(dashboard, /Command Centre briefing/);
assert.match(dashboard, /This is a document-creation gap, not an AADE transmission retry problem/i);
assert.doesNotMatch(dashboard, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["canonical_conflict", "canonical_candidate_ambiguity", "canonical_low_confidence_auto_link", "product_unlinked_canonical", "product_no_canonical_candidate", "canonical_link_not_offer_ready"]) assert.match(matching, new RegExp(rule));
assert.match(matching, /adminMatchingWorkspace/);
assert.match(matching, /AMBIGUITY_DELTA/);
assert.match(matching, /absence of a candidate is not proof/i);
assert.match(matching, /linkage and offer approval are separate governance steps/i);
assert.doesNotMatch(matching, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["search_console_not_ready", "search_console_no_baseline", "search_visibility_decline", "search_console_high_impression_low_ctr", "search_console_near_page_one", "search_console_zero_click_demand"]) assert.match(searchConsole, new RegExp(rule));
assert.match(searchConsole, /getSearchConsoleHistoryWorkspace/);
assert.match(searchConsole, /searchConsoleReadiness/);
assert.match(searchConsole, /privacy-minimized/i);
assert.match(searchConsole, /do not infer causality/i);
assert.doesNotMatch(searchConsole, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["category_inactive_with_live_products", "category_nonassignable_with_direct_products", "category_empty_active_leaf", "controlled_value_no_target", "controlled_value_unmapped"]) assert.match(catalogGovernance, new RegExp(rule));
assert.match(catalogGovernance, /adminCatalogueOverviewWorkspace/);
assert.match(catalogGovernance, /adminCategoryWorkspace/);
assert.match(catalogGovernance, /adminCatalogueControlledValueQueue/);
assert.match(catalogGovernance, /non-standard commerce policy\/ies are treated as deliberate configuration, not errors/i);
assert.match(catalogGovernance, /fuzzy synonym inference, multienum splitting and unit conversion remain review-required/i);
assert.doesNotMatch(catalogGovernance, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["product_missing_greek_title", "product_missing_greek_description", "product_unmapped_attributes", "product_no_approved_vendor_offer", "product_visible_without_sellable_stock", "inventory_stale", "product_active_but_suppressed", "seo_non_indexable_product"]) assert.match(productIntelligence, new RegExp(rule));
assert.match(productIntelligence, /assertAdminPermission\(principal, "catalog\.read"\)/);
assert.match(productIntelligence, /platformScope\(principal\.userId, "sparta"\)/);
for (const table of ["product_identifiers", "vendor_offers", "inventory_balances", "catalog_source_product_links", "catalog_source_attribute_observations"]) assert.match(productIntelligence, new RegExp(table));
for (const freshness of ["freshness_status", "stock_confirmed_at", "freshness_ttl_seconds"]) assert.match(productIntelligence, new RegExp(freshness));
assert.match(productIntelligence, /csp\.id::text AS source_product_id/);
assert.doesNotMatch(productIntelligence, /csp\.public_id/);
assert.match(productIntelligence, /readOnly: true/);
assert.doesNotMatch(productIntelligence, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["customer_active_without_email_verification", "customer_restricted_with_active_sessions", "customer_privacy_request_overdue", "customer_urgent_support_unassigned", "customer_support_followup_overdue", "customer_notification_failures"]) assert.match(customerIntelligence, new RegExp(rule));
assert.match(customerIntelligence, /adminCustomerDetail/);
assert.match(customerIntelligence, /adminCustomer360/);
assert.match(customerIntelligence, /emailVerified/);
assert.match(customerIntelligence, /activeSessionCount/);
assert.match(customerIntelligence, /openPrivacyRequests/);
assert.match(customerIntelligence, /openSupportCases/);
assert.doesNotMatch(customerIntelligence, /addresses:/);
assert.doesNotMatch(customerIntelligence, /phone:/);
assert.doesNotMatch(customerIntelligence, /email:/);
assert.doesNotMatch(customerIntelligence, /note:/);
assert.doesNotMatch(customerIntelligence, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

assert.match(globalSearch, /searchAdminProducts/);
assert.match(globalSearch, /kind: "order" \| "product"/);
assert.match(globalSearch, /hasAdminPermission\(principal, "catalog\.read"\)/);

for (const tool of ["getProductMatchingIntelligence", "getProductIntelligence", "getCustomerOperationalIntelligence", "getSearchConsoleIntelligence"]) assert.match(toolRegistry, new RegExp(tool));
assert.match(toolRegistry, /getAdminAssistantProductState/);
assert.match(toolRegistry, /getAdminAssistantCustomerState/);
assert.match(toolRegistry, /customers\.read/);
assert.match(toolRegistry, /hasAdminPermission\(principal, "customer\.read"\)/);
assert.match(toolRegistry, /adminMatchingWorkspace/);
assert.match(toolRegistry, /getSearchConsoleHistoryWorkspace/);
assert.match(toolRegistry, /pageTypes: \["product_matching"\]/);
assert.match(toolRegistry, /pageTypes: \["seo_overview", "search_console"\]/);
assert.match(toolRegistry, /recordAssistantToolAudit/);
assert.match(toolRegistry, /ASSISTANT_TOOL_PERMISSION_REQUIRED/);

assert.match(investigation, /getProductMatchingIntelligence/);
assert.match(investigation, /context\.filters\.submission/);
assert.match(investigation, /row\.kind === "product"/);
assert.match(investigation, /getProductIntelligence/);
assert.match(investigation, /row\.kind === "customer"/);
assert.match(investigation, /getCustomerOperationalIntelligence/);
assert.match(investigation, /customer_detail/);
assert.match(investigation, /cv_/);
assert.match(investigation, /8,14/);
assert.match(investigation, /getSearchConsoleIntelligence/);
assert.match(investigation, /candidates\.slice\(0, 3\)/);
assert.match(investigation, /availableAssistantTools/);

assert.match(service, /rows\[0\]\?\.kind === "product"/);
assert.match(service, /getProductIntelligence/);
assert.match(service, /sellableStock=/);
assert.match(service, /staleInventory=/);
assert.match(service, /no identifier was inferred by the model/i);

assert.match(researchPolicy, /private_tool_failure/);
assert.match(researchPolicy, /Public web research must never be used to compensate for a failed private database\/tool read/i);
assert.match(researchPolicy, /new_canonical_identity_check/);
assert.match(researchPolicy, /official_tax_guidance_verification/);
assert.match(researchPolicy, /public_search_intent_verification/);
assert.match(service, /planExternalResearch/);
assert.match(service, /externalResearchPolicy/);
assert.match(service, /researchReason/);
assert.match(service, /tools: \[\{ type: "web_search" \}\]/);
assert.match(config, /ADMIN_ASSISTANT_EXTERNAL_RESEARCH", true/);

assert.match(pageRegistry, /dashboard/);
assert.match(pageRegistry, /product_matching/);
assert.match(pageRegistry, /category_governance/);
assert.match(pageRegistry, /controlled_values/);
assert.match(pageRegistry, /customer_detail/);
assert.match(pageRegistry, /entityType: "customer"/);
assert.match(pageRegistry, /canonical readiness/i);
assert.match(context, /Find duplicate-risk products/i);
assert.match(context, /Which search queries are opportunities/i);
assert.match(context, /Check this customer's account and support state/i);
assert.match(context, /add\("customer\.read", "customers\.read"\)/);

console.log("Admin Assistant Phase 1 intelligence acceptance verifier passed.");
