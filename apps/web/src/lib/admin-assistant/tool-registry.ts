import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCatalogueAttributeReviewWorkspace } from "../admin-catalogue-attribute-review";
import { adminCatalogueOverviewWorkspace } from "../admin-catalogue-overview-runtime";
import { adminMaintenanceWorkspace } from "../admin-governance-runtime";
import { adminOperationsWorkspace, adminSeoWorkspace, adminTaxWorkspace, hasAdminPermission } from "../admin-runtime";
import { adminGiftCards, giftCardsLiveEnabled } from "../gift-card-service";
import { getAdminAssistantOrderIntelligence } from "./order-intelligence";
import { recordAssistantToolAudit } from "./repository";
import type { AdminAssistantContext } from "./types";

type ToolFamily = "catalogue" | "orders" | "tax" | "seo" | "gift_cards" | "system";
type ToolArguments = Readonly<Record<string, unknown>>;
type ToolResult = Readonly<Record<string, unknown>>;

type ToolDefinition = Readonly<{
  name: string;
  family: ToolFamily;
  description: string;
  capability: string;
  pageTypes?: readonly string[];
  execute: (principal: SessionPrincipal, args: ToolArguments) => Promise<ToolResult>;
}>;

function textArg(args: ToolArguments, key: string, max = 200): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

const TOOLS: readonly ToolDefinition[] = [
  {
    name: "getCatalogueHealth",
    family: "catalogue",
    description: "Return bounded canonical catalogue, taxonomy and semantic attribute health metrics.",
    capability: "catalog.read",
    execute: async (principal) => {
      const data = await adminCatalogueOverviewWorkspace(principal);
      return {
        metrics: data.metrics,
        attributes: data.attributes,
        highestImpactUnmapped: data.unmappedAttributes.slice(0, 10)
      };
    }
  },
  {
    name: "getAttributeMappingIntelligence",
    family: "catalogue",
    description: "Return grouped unmapped attribute contexts, governed suggestions, observed units and blockers.",
    capability: "catalog.read",
    pageTypes: ["attribute_mapping", "catalogue_overview", "supplier_pim"],
    execute: async (principal, args) => {
      const data = await adminCatalogueAttributeReviewWorkspace(principal, { snapshotId: textArg(args, "snapshotId") });
      return {
        totalUnmapped: data.totalUnmapped,
        groupCount: data.groupCount,
        actionableGroups: data.actionableGroups,
        blockedGroups: data.blockedGroups,
        groups: data.groups.slice(0, 20).map((group) => ({
          sourceId: group.sourceId,
          sourceName: group.sourceName,
          sourceAttributeKey: group.sourceAttributeKey,
          scopeKind: group.scopeKind,
          scopeKey: group.scopeKey,
          contextLabel: group.contextLabel,
          approvedCategoryCode: group.approvedCategoryCode,
          observationCount: group.observationCount,
          productCount: group.productCount,
          sourceUnits: group.sourceUnits,
          actionable: group.actionable,
          blocker: group.blocker,
          samples: group.samples.slice(0, 3),
          suggestions: group.suggestions.slice(0, 3)
        }))
      };
    }
  },
  {
    name: "getOrderLifecycleIntelligence",
    family: "orders",
    description: "Correlate one order with payment, fulfilment, returns and linked tax documents.",
    capability: "orders.read",
    pageTypes: ["order_detail", "orders"],
    execute: async (principal, args) => {
      const orderId = textArg(args, "orderId");
      if (!orderId) throw new Error("orderId is required");
      return await getAdminAssistantOrderIntelligence(principal, orderId) as unknown as ToolResult;
    }
  },
  {
    name: "getTaxDocumentStatus",
    family: "tax",
    description: "Return bounded myDATA document state and deterministic transmission exceptions.",
    capability: "finance.read",
    pageTypes: ["tax_mydata", "order_detail"],
    execute: async (principal) => {
      const data = await adminTaxWorkspace(principal);
      return {
        documents: data.documents.slice(0, 100).map((document) => ({
          id: document.id,
          orderId: document.orderId,
          status: document.status,
          transmissionStatus: document.transmissionStatus,
          documentNumber: document.documentNumber,
          aadeMark: document.aadeMark,
          lastError: document.lastError,
          createdAt: document.createdAt
        }))
      };
    }
  },
  {
    name: "getSeoHealth",
    family: "seo",
    description: "Return deterministic KONTA MOY SEO metrics and current diagnostics.",
    capability: "seo.read",
    execute: async (principal) => {
      const data = await adminSeoWorkspace(principal);
      return { metrics: data.metrics, diagnostics: data.diagnostics.slice(0, 50) };
    }
  },
  {
    name: "getGiftCardHealth",
    family: "gift_cards",
    description: "Return bounded stored-value status needed to assess checkout redemption readiness.",
    capability: "finance.read",
    pageTypes: ["gift_cards"],
    execute: async (principal) => {
      const cards = await adminGiftCards(principal);
      return {
        publicPurchaseEnabled: giftCardsLiveEnabled(),
        cards: cards.slice(0, 250).map((card) => ({
          id: card.id,
          suffix: card.suffix,
          status: card.status,
          initialValueMinor: card.initialValueMinor,
          balanceMinor: card.balanceMinor,
          issuedAt: card.issuedAt,
          expiresAt: card.expiresAt
        }))
      };
    }
  },
  {
    name: "getSystemHealth",
    family: "system",
    description: "Return production dependency health and bounded background-job failure state.",
    capability: "audit.read",
    execute: async (principal) => {
      const [operations, maintenance] = await Promise.all([adminOperationsWorkspace(principal), adminMaintenanceWorkspace(principal)]);
      return {
        checks: operations.health.checks,
        jobs: maintenance.jobNames.slice(0, 100).map((job) => ({ name: job.name, state: job.state }))
      };
    }
  }
];

function capabilityAllowed(principal: SessionPrincipal, capability: string): boolean {
  if (capability === "catalog.read") return hasAdminPermission(principal, "catalog.read");
  if (capability === "orders.read") return hasAdminPermission(principal, "fulfilment.read");
  if (capability === "finance.read") return hasAdminPermission(principal, "finance.read");
  if (capability === "seo.read") return hasAdminPermission(principal, "content.read");
  if (capability === "audit.read") return hasAdminPermission(principal, "admin.audit.read");
  return false;
}

export function availableAssistantTools(principal: SessionPrincipal, context: AdminAssistantContext): readonly Readonly<{ name: string; family: ToolFamily; description: string }>[] {
  return TOOLS
    .filter((tool) => capabilityAllowed(principal, tool.capability))
    .filter((tool) => !tool.pageTypes || tool.pageTypes.includes(context.pageType) || context.domain === tool.family || (tool.family === "orders" && context.domain === "orders") || (tool.family === "system" && context.domain === "platform"))
    .map(({ name, family, description }) => ({ name, family, description }));
}

export async function executeAssistantTool(
  principal: SessionPrincipal,
  context: AdminAssistantContext,
  name: string,
  args: ToolArguments = {}
): Promise<ToolResult> {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error("ASSISTANT_TOOL_NOT_FOUND");
  if (!capabilityAllowed(principal, tool.capability)) throw new Error("ASSISTANT_TOOL_PERMISSION_REQUIRED");
  const available = availableAssistantTools(principal, context).some((candidate) => candidate.name === name);
  if (!available) throw new Error("ASSISTANT_TOOL_NOT_AVAILABLE_IN_CONTEXT");
  const startedAt = Date.now();
  try {
    const result = await tool.execute(principal, args);
    await recordAssistantToolAudit(principal, { toolName: name, parameters: args, resultState: "ok", durationMs: Date.now() - startedAt }).catch(() => undefined);
    return result;
  } catch (error) {
    await recordAssistantToolAudit(principal, { toolName: name, parameters: args, resultState: "error", error: error instanceof Error ? error.message : "tool_failed", durationMs: Date.now() - startedAt }).catch(() => undefined);
    throw error;
  }
}
