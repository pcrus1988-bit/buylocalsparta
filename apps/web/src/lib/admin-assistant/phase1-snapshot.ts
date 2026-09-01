import type { SessionPrincipal } from "@buy-local-sparta/core";
import { evaluateRecentAdminActions } from "./action-evaluation";
import { categoryGovernanceIntelligence, controlledValueIntelligence } from "./catalog-governance-intelligence";
import { suggestedQuestionsForContext } from "./context";
import { crawlerOperationalIntelligence } from "./crawler-intelligence";
import { customerOperationalIntelligence } from "./customer-intelligence";
import { dashboardOperationalIntelligence } from "./dashboard-intelligence";
import { openIcecatIngestionIntelligence } from "./ingestion-intelligence";
import { productMatchingIntelligence } from "./matching-intelligence";
import { buildAdminAssistantOperationalSnapshot } from "./operational-snapshot";
import { applyRecommendationLifecycle } from "./recommendation-lifecycle";
import { searchConsoleIntelligence } from "./search-console-intelligence";
import { taxCrossDomainIntelligence } from "./tax-intelligence";
import type { AdminAssistantClientContext, AdminAssistantSnapshot } from "./types";
import { vendorOperationalIntelligence } from "./vendor-intelligence";

export async function buildAdminAssistantPhase1Snapshot(
  principal: SessionPrincipal,
  client: AdminAssistantClientContext
): Promise<AdminAssistantSnapshot> {
  let snapshot = await buildAdminAssistantOperationalSnapshot(principal, client);

  if (snapshot.context.pageType === "dashboard") {
    snapshot = await dashboardOperationalIntelligence(principal, snapshot);
  }

  if (snapshot.context.pageType === "catalogue_import") {
    snapshot = await openIcecatIngestionIntelligence(principal, snapshot);
  }

  if (snapshot.context.pageType === "catalogue_crawler") {
    snapshot = await crawlerOperationalIntelligence(principal, snapshot);
  }

  if (snapshot.context.pageType === "product_matching") {
    snapshot = await productMatchingIntelligence(principal, snapshot);
  }

  if (snapshot.context.pageType === "category_governance") {
    snapshot = await categoryGovernanceIntelligence(principal, snapshot);
  }

  if (snapshot.context.pageType === "controlled_values") {
    snapshot = await controlledValueIntelligence(principal, snapshot);
  }

  if (["vendor_detail", "vendor_catalogue"].includes(snapshot.context.pageType)) {
    snapshot = await vendorOperationalIntelligence(principal, snapshot);
  }

  if (snapshot.context.pageType === "customer_detail" && snapshot.context.entityId) {
    snapshot = await customerOperationalIntelligence(principal, snapshot, snapshot.context.entityId);
  }

  if (snapshot.context.pageType === "tax_mydata") {
    snapshot = await taxCrossDomainIntelligence(principal, snapshot);
  }

  if (["seo_overview", "search_console"].includes(snapshot.context.pageType)) {
    snapshot = await searchConsoleIntelligence(principal, snapshot);
  }

  snapshot = await applyRecommendationLifecycle(principal, snapshot).catch(() => snapshot);
  snapshot = await evaluateRecentAdminActions(principal, snapshot).catch(() => ({ ...snapshot, actionEvaluations: [] }));

  return {
    ...snapshot,
    suggestedQuestions: suggestedQuestionsForContext(snapshot.context)
  };
}
