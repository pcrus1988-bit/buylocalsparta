import type { SessionPrincipal } from "@buy-local-sparta/core";
import { availableAssistantTools, executeAssistantTool } from "./tool-registry";
import type { AdminAssistantContext } from "./types";

export type AdminAssistantInvestigationResult = Readonly<{
  toolName: string;
  state: "ok" | "error";
  data?: Readonly<Record<string, unknown>>;
  error?: string;
}>;

function contains(question: string, pattern: RegExp): boolean { return pattern.test(question.toLocaleLowerCase("en")); }

function lookupQuery(question: string, context: AdminAssistantContext): string | undefined {
  if (context.pageType === "global_search" && context.searchQuery?.trim()) return context.searchQuery.trim().slice(0, 200);
  const quoted = question.match(/["“”]([^"“”]{2,120})["“”]/)?.[1]?.trim();
  if (quoted) return quoted;
  const reference = question.match(/\b(?:ORD|TKT)-[A-Z0-9-]+\b/i)?.[0];
  if (reference) return reference;
  const email = question.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) return email;
  const canonical = question.match(/\bcv_[a-z0-9_-]{3,}\b/i)?.[0];
  if (canonical) return canonical;
  const technical = question.match(/\b(?:vendor|order|customer|application|gift|tax)_[a-z0-9_-]{3,}\b/i)?.[0];
  if (technical) return technical;
  const gtin = question.match(/(?<!\d)\d{8,14}(?!\d)/)?.[0];
  if (gtin && contains(question, /product|gtin|ean|barcode|model|προϊόν|κωδικ|γραμμωτ/)) return gtin;
  if (!contains(question, /\b(find|search|look\s*up|lookup|open|where is|show me|check|inspect|analyse|analyze)\b|βρες|αναζήτη|άνοιξε|δείξε μου|έλεγξε|επιθεώρησε/)) return undefined;
  const stripped = question
    .replace(/^\s*(?:please\s+)?(?:find|search(?:\s+for)?|look\s*up|lookup|open|where\s+is|show\s+me|check|inspect|analyse|analyze|βρες|αναζήτησε|άνοιξε|δείξε\s+μου|έλεγξε|επιθεώρησε)\s+/i, "")
    .replace(/^(?:product|canonical product|προϊόν|customer|πελάτη|πελάτης)\s+/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();
  return stripped.length >= 2 ? stripped.slice(0, 200) : undefined;
}

export function planAssistantInvestigation(
  principal: SessionPrincipal,
  context: AdminAssistantContext,
  question: string
): readonly Readonly<{ name: string; args: Readonly<Record<string, unknown>> }>[] {
  const available = new Set(availableAssistantTools(principal, context).map((tool) => tool.name));
  const candidates: Array<{ name: string; args: Readonly<Record<string, unknown>> }> = [];
  const add = (name: string, args: Readonly<Record<string, unknown>> = {}) => {
    if (!available.has(name) || candidates.some((item) => item.name === name)) return;
    candidates.push({ name, args });
  };

  const lookup = lookupQuery(question, context);
  if (lookup) add("getGlobalAdminSearch", { query: lookup });

  if (context.pageType === "order_detail" || contains(question, /order|payment|fulfil|fulfill|tax document|mark|refund|return|παραγγελ|πληρω|επιστροφ/)) {
    if (context.entityId) add("getOrderLifecycleIntelligence", { orderId: context.entityId });
  }
  if (["vendor_detail", "vendor_catalogue"].includes(context.pageType) || contains(question, /partner|vendor|agreement|activation|location|approved offer|onboarding|συνεργάτ|συμφων|ενεργοποι/)) {
    if (context.entityType === "vendor" && context.entityId) add("getVendorOperationalIntelligence", { vendorId: context.entityId });
  }
  if (context.pageType === "customer_detail" || contains(question, /customer|account state|support case|privacy request|active session|notification failure|πελάτ|λογαριασμ|υποστήριξ|απόρρητ/)) {
    if (context.entityType === "customer" && context.entityId) add("getCustomerOperationalIntelligence", { customerId: context.entityId });
  }
  if (context.pageType === "icecat_control" || contains(question, /icecat|ingestion|checkpoint|rejected row|reject|filtered row|enrichment|gtin|εισαγωγ|απόρριψ/)) {
    add("getOpenIcecatIngestionStatus");
  }
  if (context.pageType === "catalogue_crawler" || contains(question, /crawler|website import|crawl job|source drift|extract(?:ion|or)|expired lease|robots|fetched page|scrap(?:e|ing)|ιστοσελίδ.*εισαγωγ|ανίχνευσ.*ιστοσελίδ/)) {
    add("getCatalogueCrawlerIntelligence");
  }
  if (context.pageType === "attribute_mapping" || contains(question, /unmapped|attribute|mapping|unit|icecat attribute|χαρακτηρισ|αντιστοιχ/)) {
    add("getAttributeMappingIntelligence", context.filters.snapshot ? { snapshotId: context.filters.snapshot } : {});
  }
  if (context.pageType === "product_matching" || contains(question, /product match|canonical candidate|duplicate product|match confidence|auto.?link|canonical conflict|matching submission|αντιστοίχιση.*προϊόν|διπλότυπ.*προϊόν/)) {
    add("getProductMatchingIntelligence", context.filters.submission ? { submissionId: context.filters.submission } : {});
  }
  if (context.domain === "catalogue" || contains(question, /catalog|category|canonical|product quality|taxonomy|κατάλογ|κατηγορ/)) add("getCatalogueHealth");
  if (context.pageType === "tax_mydata" || contains(question, /paid order.*missing|missing.*tax document|payment.*pending|captured.*pending|χωρίς.*παραστατικ/)) add("getTaxCrossDomainReconciliation");
  if (context.domain === "tax" || contains(question, /aade|mydata|mark|invoice|fiscal|tax|φορο|παραστατικ/)) add("getTaxDocumentStatus");

  const asksSearchConsole = context.pageType === "search_console" || contains(question, /search console|impression|click(?:s)?|\bctr\b|ranking|position|query performance|google demand|αναζήτησ.*google|εμφανίσε|κλικ|κατάταξ/);
  if (asksSearchConsole) add("getSearchConsoleIntelligence");
  if (context.domain === "seo" || contains(question, /seo|index|canonical|sitemap|visibility|google|ορατότητα/)) add("getSeoHealth");

  if (context.domain === "gift_cards" || contains(question, /gift.?card|voucher|redemption|redeem|δωροκάρτ|εξαργ/)) add("getGiftCardHealth");
  if (context.domain === "platform" || contains(question, /system|job|queue|worker|health|failure|failed|background|σύστημα|εργασία/)) add("getSystemHealth");

  if (!candidates.length) {
    if (context.domain === "catalogue") {
      if (context.pageType === "icecat_control") add("getOpenIcecatIngestionStatus");
      else if (context.pageType === "catalogue_crawler") add("getCatalogueCrawlerIntelligence");
      else if (context.pageType === "product_matching") add("getProductMatchingIntelligence", context.filters.submission ? { submissionId: context.filters.submission } : {});
      else add("getCatalogueHealth");
    } else if (context.domain === "partners" && context.entityId) add("getVendorOperationalIntelligence", { vendorId: context.entityId });
    else if (context.pageType === "customer_detail" && context.entityId) add("getCustomerOperationalIntelligence", { customerId: context.entityId });
    else if (context.domain === "seo") add(context.pageType === "search_console" ? "getSearchConsoleIntelligence" : "getSeoHealth");
    else if (context.domain === "tax") add("getTaxCrossDomainReconciliation");
    else if (context.domain === "gift_cards") add("getGiftCardHealth");
    else if (context.domain === "platform") add("getSystemHealth");
  }

  return candidates.slice(0, 3);
}

async function runOne(
  principal: SessionPrincipal,
  context: AdminAssistantContext,
  item: Readonly<{ name: string; args: Readonly<Record<string, unknown>> }>
): Promise<AdminAssistantInvestigationResult> {
  try {
    const data = await executeAssistantTool(principal, context, item.name, item.args);
    return { toolName: item.name, state: "ok", data };
  } catch (error) {
    return { toolName: item.name, state: "error", error: error instanceof Error ? error.message.slice(0, 300) : "tool_failed" };
  }
}

function followUpFromSearch(result: AdminAssistantInvestigationResult): Readonly<{ name: string; args: Readonly<Record<string, unknown>> }> | undefined {
  if (result.toolName !== "getGlobalAdminSearch" || result.state !== "ok") return undefined;
  const rows = result.data?.results;
  if (!Array.isArray(rows) || rows.length !== 1) return undefined;
  const item = rows[0];
  if (!item || typeof item !== "object") return undefined;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : undefined;
  if (!id) return undefined;
  if (row.kind === "product") return { name: "getProductIntelligence", args: { productId: id } };
  if (row.kind === "order") return { name: "getOrderLifecycleIntelligence", args: { orderId: id } };
  if (row.kind === "vendor") return { name: "getVendorOperationalIntelligence", args: { vendorId: id } };
  if (row.kind === "customer") return { name: "getCustomerOperationalIntelligence", args: { customerId: id } };
  const relatedCustomerId = typeof row.relatedCustomerId === "string" ? row.relatedCustomerId : undefined;
  if (row.kind === "support" && relatedCustomerId) return { name: "getCustomerOperationalIntelligence", args: { customerId: relatedCustomerId } };
  return undefined;
}

export async function runAssistantInvestigation(
  principal: SessionPrincipal,
  context: AdminAssistantContext,
  question: string
): Promise<readonly AdminAssistantInvestigationResult[]> {
  const plan = planAssistantInvestigation(principal, context, question);
  const results = await Promise.all(plan.map((item) => runOne(principal, context, item)));
  if (results.length >= 3) return results;

  const search = results.find((item) => item.toolName === "getGlobalAdminSearch");
  const followUp = search ? followUpFromSearch(search) : undefined;
  if (!followUp || results.some((item) => item.toolName === followUp.name)) return results;
  const available = new Set(availableAssistantTools(principal, context).map((tool) => tool.name));
  if (!available.has(followUp.name)) return results;
  return [...results, await runOne(principal, context, followUp)].slice(0, 3);
}
