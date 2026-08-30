import type { SessionPrincipal } from "@buy-local-sparta/core";
import { suggestedQuestionsForContext } from "./context";
import { openIcecatIngestionIntelligence } from "./ingestion-intelligence";
import { productMatchingIntelligence } from "./matching-intelligence";
import { buildAdminAssistantOperationalSnapshot } from "./operational-snapshot";
import { searchConsoleIntelligence } from "./search-console-intelligence";
import { taxCrossDomainIntelligence } from "./tax-intelligence";
import type { AdminAssistantClientContext, AdminAssistantSnapshot } from "./types";
import { vendorOperationalIntelligence } from "./vendor-intelligence";

export async function buildAdminAssistantPhase1Snapshot(
  principal: SessionPrincipal,
  client: AdminAssistantClientContext
): Promise<AdminAssistantSnapshot> {
  let snapshot = await buildAdminAssistantOperationalSnapshot(principal, client);

  if (snapshot.context.pageType === "catalogue_import") {
    snapshot = await openIcecatIngestionIntelligence(principal, snapshot);
  }

  if (snapshot.context.pageType === "product_matching") {
    snapshot = await productMatchingIntelligence(principal, snapshot);
  }

  if (["vendor_detail", "vendor_catalogue"].includes(snapshot.context.pageType)) {
    snapshot = await vendorOperationalIntelligence(principal, snapshot);
  }

  if (snapshot.context.pageType === "tax_mydata") {
    snapshot = await taxCrossDomainIntelligence(principal, snapshot);
  }

  if (["seo_overview", "search_console"].includes(snapshot.context.pageType)) {
    snapshot = await searchConsoleIntelligence(principal, snapshot);
  }

  return {
    ...snapshot,
    suggestedQuestions: suggestedQuestionsForContext(snapshot.context)
  };
}
