import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCatalogueAttributeReviewWorkspace } from "../admin-catalogue-attribute-review";
import { adminCatalogueOverviewWorkspace } from "../admin-catalogue-overview-runtime";
import { adminMaintenanceWorkspace, adminOrdersReturnsWorkspace } from "../admin-governance-runtime";
import { adminOpenIcecatIngestionStatus } from "../admin-open-icecat-ingestion";
import { adminMatchingWorkspace, adminOperationsWorkspace, adminTaxWorkspace, hasAdminPermission } from "../admin-runtime";
import { adminSeoWorkspace } from "../admin-seo-runtime";
import { adminGiftCards, giftCardsLiveEnabled } from "../gift-card-service";
import { getSearchConsoleHistoryWorkspace } from "../seo-gsc-history";
import { searchConsoleReadiness } from "../seo-search-console";
import { adminVendorShopsWorkspace } from "../vendor-admin-controls";
import { searchAdminEntities } from "./global-search";
import { getAdminAssistantOrderIntelligence } from "./order-intelligence";
import { getAdminAssistantProductState } from "./product-intelligence";
import { recordAssistantToolAudit } from "./repository";
import { getAdminAssistantTaxCrossDomain } from "./tax-cross-domain";
import type { AdminAssistantContext } from "./types";

type ToolFamily = "search" | "catalogue" | "orders" | "partners" | "tax" | "seo" | "gift_cards" | "system";
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
    name: "getGlobalAdminSearch",
    family: "search",
    description: "Resolve products, orders, customers, support tickets, partners, applications and research leads through permission-aware Admin search.",
    capability: "assistant.read",
    execute: async (principal, args) => {
      const query = textArg(args, "query");
      if (!query) throw new Error("query is required");
      return { results: await searchAdminEntities(principal, query) };
    }
  },
  {
    name: "getCatalogueHealth",
    family: "catalogue",
    description: "Return bounded canonical catalogue, taxonomy and semantic attribute health metrics.",
    capability: "catalog.read",
    execute: async (principal) => {
      const data = await adminCatalogueOverviewWorkspace(principal);
      return { metrics: data.metrics, attributes: data.attributes, highestImpactUnmapped: data.unmappedAttributes.slice(0, 10) };
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
    name: "getOpenIcecatIngestionStatus",
    family: "catalogue",
    description: "Return bounded Open Icecat bulk checkpoints, rejection/filtered counts and Greek detail queue health.",
    capability: "catalog.read",
    pageTypes: ["catalogue_import"],
    execute: async (principal) => {
      const data = await adminOpenIcecatIngestionStatus(principal);
      return {
        runs: data.runs.slice(0, 6).map((run) => ({
          runId: run.runId,
          sourceName: run.sourceName,
          importKind: run.importKind,
          status: run.status,
          checkpoint: run.checkpoint,
          persisted: run.persisted,
          removed: run.removed,
          rejected: run.rejected,
          filtered: run.filtered,
          activeIndexProducts: run.activeIndexProducts,
          removedIndexProducts: run.removedIndexProducts,
          updatedAt: run.updatedAt,
          completedAt: run.completedAt,
          failedAt: run.failedAt,
          lastError: run.lastError
        })),
        detail: data.detail ? {
          activeIndexProducts: data.detail.activeIndexProducts,
          unqueueableWithoutGtin: data.detail.unqueueableWithoutGtin,
          pending: data.detail.pending,
          processing: data.detail.processing,
          retry: data.detail.retry,
          ready: data.detail.ready,
          needsEnrichment: data.detail.needsEnrichment,
          failed: data.detail.failed,
          skipped: data.detail.skipped
        } : undefined
      };
    }
  },
  {
    name: "getProductMatchingIntelligence",
    family: "catalogue",
    description: "Return bounded source-product submissions, canonical candidates, confidence and offer-link lifecycle state from Product Matching.",
    capability: "catalog.read",
    pageTypes: ["product_matching"],
    execute: async (principal, args) => {
      const data = await adminMatchingWorkspace(principal);
      const submissionId = textArg(args, "submissionId");
      const rows = submissionId ? data.submissions.filter((item) => item.id === submissionId) : data.submissions;
      return {
        submissions: rows.slice(0, 100).map((submission) => ({
          id: submission.id,
          title: submission.title,
          vendorId: submission.vendorId,
          categoryCode: submission.categoryCode,
          supplierPrice: submission.supplierPrice,
          status: submission.status,
          canonicalVariantId: submission.canonicalVariantId,
          candidates: submission.candidates.slice(0, 12).map((candidate) => ({
            id: candidate.id,
            level: candidate.level,
            canonicalVariantId: candidate.canonicalVariantId,
            confidence: candidate.confidence,
            status: candidate.status
          }))
        }))
      };
    }
  },
  {
    name: "getProductIntelligence",
    family: "catalogue",
    description: "Return one canonical product's identity, Greek content, identifiers, vendor offers, inventory freshness, source links, unresolved source attributes and SEO intent.",
    capability: "catalog.read",
    execute: async (principal, args) => {
      const productId = textArg(args, "productId");
      if (!productId) throw new Error("productId is required");
      const product = await getAdminAssistantProductState(principal, productId);
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      return {
        product: {
          id: product.id,
          title: product.title,
          descriptionPresent: Boolean(product.description),
          gtin: product.gtin,
          brand: product.brand,
          model: product.model,
          mpn: product.mpn,
          categoryCode: product.categoryCode,
          categoryName: product.categoryName,
          active: product.active,
          suppressed: product.suppressed,
          recalled: product.recalled,
          identifiers: product.identifiers.slice(0, 20),
          offers: product.offers.slice(0, 25),
          sourceLinks: product.sourceLinks.slice(0, 20),
          unmappedAttributeCount: product.unmappedAttributeCount,
          seo: product.seo
        }
      };
    }
  },
  {
    name: "getOrderLifecycleIntelligence",
    family: "orders",
    description: "Correlate one order with payment, fulfilment, returns and linked tax documents.",
    capability: "orders.read",
    execute: async (principal, args) => {
      const orderId = textArg(args, "orderId");
      if (!orderId) throw new Error("orderId is required");
      return await getAdminAssistantOrderIntelligence(principal, orderId) as unknown as ToolResult;
    }
  },
  {
    name: "getVendorOperationalIntelligence",
    family: "partners",
    description: "Return one partner's bounded operational, agreement, location, catalogue and assigned-order state.",
    capability: "partners.read",
    execute: async (principal, args) => {
      const vendorId = textArg(args, "vendorId");
      if (!vendorId) throw new Error("vendorId is required");
      const [workspace, orderData] = await Promise.all([
        adminVendorShopsWorkspace(principal),
        hasAdminPermission(principal, "fulfilment.read") ? adminOrdersReturnsWorkspace(principal).catch(() => undefined) : undefined
      ]);
      const shop = workspace.shops.find((item) => item.id === vendorId);
      if (!shop) throw new Error("VENDOR_NOT_FOUND");
      const orders = orderData?.orders.filter((order) => order.lines.some((line) => line.vendorId === shop.id)) ?? [];
      return {
        vendor: {
          id: shop.id,
          tradingName: shop.tradingName,
          legalName: shop.legalName,
          status: shop.status,
          operationalActive: shop.operationalActive,
          publicDirectoryVisible: shop.publicDirectoryVisible,
          applicationId: shop.applicationId,
          applicationState: shop.applicationState,
          researchVendor: shop.researchVendor,
          locationCount: shop.locationCount,
          activeLocationCount: shop.activeLocationCount,
          approvedOfferCount: shop.approvedOfferCount,
          cooperationDocumented: shop.cooperationDocumented,
          agreement: shop.agreement
        },
        orders: orders.slice(0, 25).map((order) => ({ id: order.id, status: order.status, fulfilmentMode: order.fulfilmentMode, partnerLineCount: order.lines.filter((line) => line.vendorId === shop.id).length }))
      };
    }
  },
  {
    name: "getTaxCrossDomainReconciliation",
    family: "tax",
    description: "Return bounded paid/captured orders whose order/payment/fiscal state is inconsistent.",
    capability: "finance.read",
    pageTypes: ["tax_mydata"],
    execute: async (principal) => {
      const rows = await getAdminAssistantTaxCrossDomain(principal);
      return {
        rows: rows.slice(0, 100).map((row) => ({
          orderId: row.orderId,
          displayReference: row.displayReference,
          orderStatus: row.orderStatus,
          paymentStatus: row.paymentStatus,
          paymentProvider: row.paymentProvider,
          capturedMinor: row.capturedMinor,
          taxDocumentCount: row.taxDocumentCount,
          acceptedMarkCount: row.acceptedMarkCount,
          createdAt: row.createdAt
        }))
      };
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
    name: "getSearchConsoleIntelligence",
    family: "seo",
    description: "Return bounded retained Google Search Console readiness, immutable sync comparison and privacy-safe demand evidence.",
    capability: "seo.read",
    pageTypes: ["seo_overview", "search_console"],
    execute: async (principal) => {
      const [history, readiness] = await Promise.all([
        getSearchConsoleHistoryWorkspace(principal),
        Promise.resolve(searchConsoleReadiness())
      ]);
      return {
        readiness: {
          enabled: readiness.enabled,
          ready: readiness.ready,
          credentialsConfigured: readiness.credentialsConfigured,
          siteUrl: readiness.siteUrl
        },
        persistenceAvailable: history.persistenceAvailable,
        latest: history.latest,
        previous: history.previous,
        queries: history.queries.slice(0, 50),
        pages: history.pages.slice(0, 50)
      };
    }
  },
  {
    name: "getGiftCardHealth",
    family: "gift_cards",
    description: "Return bounded stored-value status needed to assess checkout redemption readiness.",
    capability: "gift_cards.read",
    pageTypes: ["gift_cards"],
    execute: async (principal) => {
      const cards = await adminGiftCards(principal);
      return {
        publicPurchaseEnabled: giftCardsLiveEnabled(),
        cards: cards.slice(0, 250).map((card) => ({ id: card.id, suffix: card.suffix, status: card.status, initialValueMinor: card.initialValueMinor, balanceMinor: card.balanceMinor, issuedAt: card.issuedAt, expiresAt: card.expiresAt }))
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
      return { checks: operations.health.checks, jobs: maintenance.jobNames.slice(0, 100).map((job) => ({ name: job.name, state: job.state })) };
    }
  }
];

function capabilityAllowed(principal: SessionPrincipal, capability: string): boolean {
  if (capability === "assistant.read") return true;
  if (capability === "catalog.read") return hasAdminPermission(principal, "catalog.read");
  if (capability === "orders.read") return hasAdminPermission(principal, "fulfilment.read");
  if (capability === "partners.read") return hasAdminPermission(principal, "vendor.manage");
  if (capability === "finance.read") return hasAdminPermission(principal, "finance.read");
  if (capability === "seo.read") return hasAdminPermission(principal, "content.read");
  if (capability === "audit.read") return hasAdminPermission(principal, "admin.audit.read");
  if (capability === "gift_cards.read") return principal.roles.includes("super_admin");
  return false;
}

export function availableAssistantTools(principal: SessionPrincipal, context: AdminAssistantContext): readonly Readonly<{ name: string; family: ToolFamily; description: string }>[] {
  return TOOLS
    .filter((tool) => capabilityAllowed(principal, tool.capability))
    .filter((tool) => !tool.pageTypes || tool.pageTypes.includes(context.pageType) || context.domain === tool.family || (tool.family === "orders" && context.domain === "orders") || (tool.family === "system" && context.domain === "platform"))
    .map(({ name, family, description }) => ({ name, family, description }));
}

export async function executeAssistantTool(principal: SessionPrincipal, context: AdminAssistantContext, name: string, args: ToolArguments = {}): Promise<ToolResult> {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error("ASSISTANT_TOOL_NOT_FOUND");
  if (!capabilityAllowed(principal, tool.capability)) throw new Error("ASSISTANT_TOOL_PERMISSION_REQUIRED");
  if (!availableAssistantTools(principal, context).some((candidate) => candidate.name === name)) throw new Error("ASSISTANT_TOOL_NOT_AVAILABLE_IN_CONTEXT");
  const startedAt = Date.now();
  try {
    const result = await tool.execute(principal, args);
    await recordAssistantToolAudit(principal, { toolName: name, parameters: { ...args }, resultState: "ok", durationMs: Date.now() - startedAt }).catch(() => undefined);
    return result;
  } catch (error) {
    await recordAssistantToolAudit(principal, { toolName: name, parameters: { ...args }, resultState: "error", error: error instanceof Error ? error.message : "tool_failed", durationMs: Date.now() - startedAt }).catch(() => undefined);
    throw error;
  }
}
