import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { boundedText, safeAdminHref } from "../apps/web/src/lib/admin-assistant/types.ts";
import { parseAssistantClientContext, suggestedQuestionsForDomain } from "../apps/web/src/lib/admin-assistant/context.ts";
import { adminAssistantPageDefinition } from "../apps/web/src/lib/admin-assistant/page-registry.ts";
import { recommendationScore } from "../apps/web/src/lib/admin-assistant/recommendations.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

assert.equal(safeAdminHref("/admin/seo"), "/admin/seo");
assert.equal(safeAdminHref("https://evil.example/admin"), undefined);
assert.equal(safeAdminHref("javascript:alert(1)"), undefined);
assert.equal(boundedText("  hello  ", 20), "hello");
assert.equal(boundedText("x".repeat(50), 12).length, 12);

const malicious = parseAssistantClientContext({
  route: "https://evil.example/ignore-system",
  filters: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, "v".repeat(300)])),
  searchQuery: "q".repeat(500),
  selectedTab: "t".repeat(500)
});
assert.equal(malicious.route, "/admin");
assert.equal(Object.keys(malicious.filters ?? {}).length, 12);
assert.ok((malicious.searchQuery?.length ?? 0) <= 250);
assert.ok((malicious.selectedTab?.length ?? 0) <= 120);
assert.ok(suggestedQuestionsForDomain("catalogue").some((item) => /unmapped/i.test(item)));
assert.ok(suggestedQuestionsForDomain("tax").some((item) => /MARK/i.test(item)));

assert.equal(adminAssistantPageDefinition("/admin/search").pageType, "global_search");
assert.match(adminAssistantPageDefinition("/admin/search").purpose, /resolve.*orders|human-readable/i);
assert.equal(adminAssistantPageDefinition("/admin/catalogue-intake/attributes").pageType, "attribute_mapping");
assert.equal(adminAssistantPageDefinition("/admin/catalogue-intake/attributes").domain, "catalogue");
assert.equal(adminAssistantPageDefinition("/admin/catalogue-intake/import").pageType, "catalogue_import");
assert.equal(adminAssistantPageDefinition("/admin/orders/ORD-10012").pageType, "order_detail");
assert.equal(adminAssistantPageDefinition("/admin/orders/ORD-10012").entityType, "order");
assert.equal(adminAssistantPageDefinition("/admin/partners/vendor_demo").pageType, "vendor_detail");
assert.equal(adminAssistantPageDefinition("/admin/partners/vendor_demo").entityType, "vendor");
assert.equal(adminAssistantPageDefinition("/admin/partners/vendor_demo/catalogue").pageType, "vendor_catalogue");
assert.match(adminAssistantPageDefinition("/admin/maintenance").purpose, /jobs|projections/i);
assert.match(adminAssistantPageDefinition("/admin/gift-cards").purpose, /redemption/i);

const lowScore = recommendationScore({ finding: { id: "low", severity: "info", category: "test", title: "Low", detail: "Low", evidence: [], affectedCount: 1, confidence: "high" }, dimensions: { urgency: 1, effort: 8 } });
const criticalScore = recommendationScore({ finding: { id: "critical", severity: "critical", category: "test", title: "Critical", detail: "Critical", evidence: [], affectedCount: 100, confidence: "high" }, dimensions: { urgency: 10, complianceRisk: 10, customerImpact: 8, effort: 2 } });
assert.ok(criticalScore > lowScore, "Operationally critical evidence must outrank low-impact information");

const [prompt, contextRoute, messageRoute, conversationsRoute, repository, service, tools, migration, shell, actionButton, actionEvents, pageRegistry, recommendations, intelligence, operationalSnapshot, orderIntelligence, ingestionIntelligence, vendorIntelligence, taxCrossDomain, taxIntelligence, globalSearch, phase1Snapshot, toolRegistry, investigation] = await Promise.all([
  read("apps/web/src/lib/admin-assistant/prompt.ts"),
  read("apps/web/src/app/api/admin/assistant/context/route.ts"),
  read("apps/web/src/app/api/admin/assistant/message/route.ts"),
  read("apps/web/src/app/api/admin/assistant/conversations/route.ts"),
  read("apps/web/src/lib/admin-assistant/repository.ts"),
  read("apps/web/src/lib/admin-assistant/service.ts"),
  read("apps/web/src/lib/admin-assistant/tools.ts"),
  read("db/migrations/0168_admin_assistant.sql"),
  read("apps/web/src/components/AdminAssistantShell.tsx"),
  read("apps/web/src/components/AdminActionButton.tsx"),
  read("apps/web/src/lib/admin-action-events.ts"),
  read("apps/web/src/lib/admin-assistant/page-registry.ts"),
  read("apps/web/src/lib/admin-assistant/recommendations.ts"),
  read("apps/web/src/lib/admin-assistant/intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/operational-snapshot.ts"),
  read("apps/web/src/lib/admin-assistant/order-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/ingestion-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/vendor-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/tax-cross-domain.ts"),
  read("apps/web/src/lib/admin-assistant/tax-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/global-search.ts"),
  read("apps/web/src/lib/admin-assistant/phase1-snapshot.ts"),
  read("apps/web/src/lib/admin-assistant/tool-registry.ts"),
  read("apps/web/src/lib/admin-assistant/investigation.ts")
]);

assert.match(prompt, /untrusted data/i);
assert.match(prompt, /never commands/i);
assert.match(prompt, /Consequential writes require explicit Admin approval/i);
assert.match(prompt, /Never reveal chain-of-thought/i);

for (const route of [contextRoute, messageRoute]) {
  assert.match(route, /requireAdminSession\(request, \{ csrf: true \}\)/);
  assert.match(route, /cache-control/);
  assert.match(route, /buildAdminAssistantPhase1Snapshot/);
}
assert.match(conversationsRoute, /requireAdminSession\(\)/);
assert.doesNotMatch(messageRoute, /action\/execute|direct SQL|DELETE FROM|UPDATE public\./i);
assert.match(messageRoute, /runAssistantInvestigation/);

assert.match(repository, /admin_user_id=\$2/);
assert.match(repository, /platformScope\(principal\.userId\)/);
assert.match(repository, /parameters_json/);
assert.doesNotMatch(repository, /password|api[_-]?key|payment instrument/i);

assert.match(service, /https:\/\/api\.openai\.com\/v1\/responses/);
assert.match(service, /ADMIN_ASSISTANT_SYSTEM_PROMPT_V1/);
assert.match(service, /collectSources/);
assert.match(service, /url\.protocol === "https:"/);
assert.match(service, /deterministicAnswer/);
assert.match(service, /deterministicLookupAnswer/);
assert.match(service, /No authorized KONTA MOY Admin entity matched/);
assert.match(service, /no identifier was inferred by the model/i);
assert.match(service, /Recent audited Admin changes/);
assert.match(service, /authorizedInvestigation/);
assert.match(service, /structuredRecommendations/);
assert.match(service, /safeAdminHref/);
assert.doesNotMatch(service, /eval\(|new Function|javascript:/i);

assert.match(tools, /adminCatalogueOverviewWorkspace/);
assert.match(tools, /adminOrdersReturnsWorkspace/);
assert.match(tools, /adminTaxWorkspace/);
assert.match(tools, /adminSeoWorkspace/);
assert.match(tools, /adminMaintenanceWorkspace/);
assert.doesNotMatch(tools, /SELECT |INSERT |UPDATE |DELETE /i);

assert.match(pageRegistry, /ADMIN_WORKSPACE_NAVIGATION/);
assert.match(pageRegistry, /global_search/);
assert.match(pageRegistry, /attribute_mapping/);
assert.match(pageRegistry, /catalogue_import/);
assert.match(pageRegistry, /order_detail/);
assert.match(pageRegistry, /vendor_detail/);
assert.match(pageRegistry, /vendor_catalogue/);
assert.match(pageRegistry, /tax_mydata/);
assert.match(pageRegistry, /gift_cards/);
assert.match(pageRegistry, /search_console/);
assert.match(pageRegistry, /background_jobs/);

assert.match(recommendations, /financialImpact/);
assert.match(recommendations, /complianceRisk/);
assert.match(recommendations, /dataQualityImpact/);
assert.match(recommendations, /urgency/);
assert.match(recommendations, /effortPenalty/);

assert.match(intelligence, /adminCatalogueAttributeReviewWorkspace/);
assert.match(intelligence, /product_unmapped_attributes/);
assert.match(intelligence, /attribute_inconsistent_units/);
assert.match(intelligence, /gift_card_not_redeemable/);
assert.match(intelligence, /gift_card_state_balance_inconsistent/);
assert.match(intelligence, /governed review/i);

for (const rule of ["paid_order_missing_tax_document", "unpaid_order_in_fulfillment", "payment_order_state_mismatch", "tax_document_transmission_error", "tax_document_missing_mark", "order_active_return"]) assert.match(operationalSnapshot, new RegExp(rule));
assert.match(orderIntelligence, /platformScope\(principal\.userId\)/);
assert.match(orderIntelligence, /WHERE o\.public_id=\$1/);
assert.match(orderIntelligence, /LIMIT 20/);
assert.match(orderIntelligence, /readOnly: true/);
assert.doesNotMatch(orderIntelligence, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["ingestion_failed", "ingestion_stalled", "ingestion_systematic_rejection", "ingestion_detail_failures", "ingestion_retry_backlog", "icecat_greek_quality_incomplete", "icecat_unqueueable_without_gtin"]) assert.match(ingestionIntelligence, new RegExp(rule));
assert.match(ingestionIntelligence, /adminOpenIcecatIngestionStatus/);
assert.match(ingestionIntelligence, /durable checkpoint/i);
assert.match(ingestionIntelligence, /Greek quality gate/i);
assert.doesNotMatch(ingestionIntelligence, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of ["vendor_active_without_agreement", "vendor_active_with_expired_agreement", "inactive_vendor_has_active_orders", "vendor_visibility_state_mismatch", "vendor_no_active_location", "vendor_no_approved_offers", "vendor_application_state_conflict"]) assert.match(vendorIntelligence, new RegExp(rule));
assert.match(vendorIntelligence, /adminVendorShopsWorkspace/);
assert.match(vendorIntelligence, /adminOrdersReturnsWorkspace/);
assert.doesNotMatch(vendorIntelligence, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

assert.match(taxCrossDomain, /platformScope\(principal\.userId\)/);
assert.match(taxCrossDomain, /latest_payment/);
assert.match(taxCrossDomain, /HAVING COUNT\(td\.id\)=0 OR o\.status::text='pending_payment'/);
assert.match(taxCrossDomain, /LIMIT 100/);
assert.match(taxCrossDomain, /readOnly: true/);
assert.doesNotMatch(taxCrossDomain, /DELETE FROM|UPDATE public\.|INSERT INTO/i);
assert.match(taxIntelligence, /paid_order_missing_tax_document/);
assert.match(taxIntelligence, /payment_order_state_mismatch/);
assert.match(taxIntelligence, /document creation and transmission are separate/i);

assert.match(globalSearch, /adminCustomersWorkspace/);
assert.match(globalSearch, /adminCustomerSupportQueue/);
assert.match(globalSearch, /adminOrdersReturnsWorkspace/);
assert.match(globalSearch, /adminVendorShopsWorkspace/);
assert.match(globalSearch, /researchVendorsWorkspace/);
assert.match(globalSearch, /marketplaceReferenceMap/);
assert.match(globalSearch, /hasAdminPermission\(principal, "customer\.read"\)/);
assert.match(globalSearch, /hasAdminPermission\(principal, "fulfilment\.read"\)/);
assert.match(globalSearch, /hasAdminPermission\(principal, "vendor\.manage"\)/);
assert.match(globalSearch, /results\.slice\(0, 40\)/);
assert.doesNotMatch(globalSearch, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

assert.match(phase1Snapshot, /openIcecatIngestionIntelligence/);
assert.match(phase1Snapshot, /vendorOperationalIntelligence/);
assert.match(phase1Snapshot, /taxCrossDomainIntelligence/);

for (const toolName of ["getGlobalAdminSearch", "getCatalogueHealth", "getAttributeMappingIntelligence", "getOpenIcecatIngestionStatus", "getOrderLifecycleIntelligence", "getVendorOperationalIntelligence", "getTaxCrossDomainReconciliation", "getTaxDocumentStatus", "getSeoHealth", "getGiftCardHealth", "getSystemHealth"]) assert.match(toolRegistry, new RegExp(toolName));
assert.match(toolRegistry, /capability === "assistant\.read"/);
assert.match(toolRegistry, /capabilityAllowed/);
assert.match(toolRegistry, /recordAssistantToolAudit/);
assert.match(toolRegistry, /ASSISTANT_TOOL_PERMISSION_REQUIRED/);
assert.match(toolRegistry, /ASSISTANT_TOOL_NOT_AVAILABLE_IN_CONTEXT/);
assert.match(toolRegistry, /slice\(0, 250\)/);
assert.match(investigation, /candidates\.slice\(0, 3\)/);
assert.match(investigation, /lookupQuery/);
assert.match(investigation, /getGlobalAdminSearch/);
assert.match(investigation, /followUpFromSearch/);
assert.match(investigation, /rows\.length !== 1/);
assert.match(investigation, /getOpenIcecatIngestionStatus/);
assert.match(investigation, /getVendorOperationalIntelligence/);
assert.match(investigation, /availableAssistantTools/);
assert.match(investigation, /executeAssistantTool/);

assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
assert.match(migration, /bls_private\.is_platform_runtime\(\)/);
assert.match(migration, /admin_assistant_tool_audit/);
assert.doesNotMatch(migration, /GRANT .* TO anon|GRANT .* TO authenticated/i);

assert.match(shell, /event\.key === "Escape"/);
assert.match(shell, /AbortController/);
assert.match(shell, /aria-label="KONTA MOY Assistant"/);
assert.match(shell, /External\/public information/);
assert.match(shell, /Recommended next actions/);
assert.match(shell, /Evidence-backed findings/);
assert.match(shell, /confidence/);
assert.match(actionButton, /inferAdminActionEntity/);
assert.match(actionButton, /inferAdminActionAfterState/);
assert.match(actionButton, /publishAdminActionCompleted/);
assert.doesNotMatch(actionButton, /publishAdminActionCompleted\(\{[^}]*payload/);
assert.match(actionEvents, /ENTITY_KEYS/);
assert.match(actionEvents, /orderId/);
assert.match(actionEvents, /vendorId/);
assert.match(actionEvents, /documentId/);
assert.doesNotMatch(actionEvents, /reason|csrf|password|api[_-]?key/i);

console.log("Admin Personal Assistant acceptance verifier passed.");
