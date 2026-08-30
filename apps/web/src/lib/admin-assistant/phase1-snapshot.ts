import type { SessionPrincipal } from "@buy-local-sparta/core";
import { suggestedQuestionsForContext } from "./context";
import { openIcecatIngestionIntelligence } from "./ingestion-intelligence";
import { buildAdminAssistantOperationalSnapshot } from "./operational-snapshot";
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

  if (["vendor_detail", "vendor_catalogue"].includes(snapshot.context.pageType)) {
    snapshot = await vendorOperationalIntelligence(principal, snapshot);
  }

  return {
    ...snapshot,
    suggestedQuestions: suggestedQuestionsForContext(snapshot.context)
  };
}
