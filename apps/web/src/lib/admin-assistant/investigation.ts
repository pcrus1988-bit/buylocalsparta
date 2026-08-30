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

  if (context.pageType === "order_detail" || contains(question, /order|payment|fulfil|fulfill|tax document|mark|refund|return|παραγγελ|πληρω|επιστροφ/)) {
    if (context.entityId) add("getOrderLifecycleIntelligence", { orderId: context.entityId });
  }
  if (context.pageType === "attribute_mapping" || contains(question, /unmapped|attribute|mapping|unit|icecat attribute|χαρακτηρισ|αντιστοιχ/)) {
    add("getAttributeMappingIntelligence", context.filters.snapshot ? { snapshotId: context.filters.snapshot } : {});
  }
  if (context.domain === "catalogue" || contains(question, /catalog|category|canonical|product quality|taxonomy|κατάλογ|κατηγορ/)) add("getCatalogueHealth");
  if (context.domain === "tax" || contains(question, /aade|mydata|mark|invoice|fiscal|tax|φορο|παραστατικ/)) add("getTaxDocumentStatus");
  if (context.domain === "seo" || contains(question, /seo|index|canonical|sitemap|search console|visibility|google|ορατότητα/)) add("getSeoHealth");
  if (context.domain === "gift_cards" || contains(question, /gift.?card|voucher|redemption|redeem|δωροκάρτ|εξαργ/)) add("getGiftCardHealth");
  if (context.domain === "platform" || contains(question, /system|job|queue|worker|health|failure|failed|background|σύστημα|εργασία/)) add("getSystemHealth");

  if (!candidates.length) {
    if (context.domain === "catalogue") add("getCatalogueHealth");
    else if (context.domain === "seo") add("getSeoHealth");
    else if (context.domain === "tax") add("getTaxDocumentStatus");
    else if (context.domain === "gift_cards") add("getGiftCardHealth");
    else if (context.domain === "platform") add("getSystemHealth");
  }

  return candidates.slice(0, 3);
}

export async function runAssistantInvestigation(
  principal: SessionPrincipal,
  context: AdminAssistantContext,
  question: string
): Promise<readonly AdminAssistantInvestigationResult[]> {
  const plan = planAssistantInvestigation(principal, context, question);
  return Promise.all(plan.map(async (item) => {
    try {
      const data = await executeAssistantTool(principal, context, item.name, item.args);
      return { toolName: item.name, state: "ok" as const, data };
    } catch (error) {
      return { toolName: item.name, state: "error" as const, error: error instanceof Error ? error.message.slice(0, 300) : "tool_failed" };
    }
  }));
}
