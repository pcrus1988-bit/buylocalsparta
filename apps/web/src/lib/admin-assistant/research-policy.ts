import type { AdminAssistantInvestigationResult } from "./investigation";
import type { AdminAssistantSnapshot } from "./types";

export type AdminAssistantResearchDecision = Readonly<{
  useExternalResearch: boolean;
  reason?: string;
  sourcePriority: readonly string[];
}>;

const explicitExternal = /\b(official|manufacturer|public source|web|online|verify|verification|current regulation|current guidance|documentation|search intent|google results?|serp)\b|επίσημ|κατασκευαστ|επαλήθευσ|δημόσια πηγή|τρέχουσ.*οδηγ|πρόθεση αναζήτησης/i;
const productVerification = /\b(gtin|ean|upc|isbn|model number|part number|mpn|specification|specs?|voltage|dimension|manufacturer|genuinely new product|create canonical|new canonical)\b|χαρακτηριστικ|κωδικό.*κατασκευαστ|νέο canonical/i;
const officialTax = /\b(aade|mydata|tax|invoice|fiscal|vat)\b.*\b(official|current|rule|regulation|guidance|requirement|changed|latest)\b|\b(official|current|latest)\b.*\b(aade|mydata|tax|invoice|vat)\b|ααδε.*(τρέχ|επίσημ|κανόν|οδηγ)/i;
const seoResearch = /\b(search intent|google demand|serp|competitor result|organic result|what people search|current google)\b|πρόθεση αναζήτησης|τι ψάχν.*google/i;

function hasFinding(snapshot: AdminAssistantSnapshot, ruleId: string): boolean {
  return snapshot.findings.some((finding) => finding.ruleId === ruleId);
}

function privateLookupFailed(investigation: readonly AdminAssistantInvestigationResult[]): boolean {
  const privateTools = investigation.filter((item) => item.toolName !== "getSearchConsoleIntelligence");
  return privateTools.length > 0 && privateTools.every((item) => item.state === "error");
}

export function planExternalResearch(
  question: string,
  snapshot: AdminAssistantSnapshot,
  investigation: readonly AdminAssistantInvestigationResult[] = []
): AdminAssistantResearchDecision {
  const sourcePriority = [
    "official manufacturer/product documentation",
    "Greek government or AADE official sources",
    "official standards or technical documentation",
    "primary public business sources"
  ] as const;

  // Public web research must never be used to compensate for a failed private database/tool read.
  // If KONTA MOY could not retrieve its own state, the assistant must report that limitation instead.
  if (privateLookupFailed(investigation)) return { useExternalResearch: false, reason: "private_tool_failure", sourcePriority };

  if (explicitExternal.test(question)) return { useExternalResearch: true, reason: "explicit_public_verification", sourcePriority };
  if (productVerification.test(question) && snapshot.context.domain === "catalogue") return { useExternalResearch: true, reason: "product_identity_or_specification_verification", sourcePriority };
  if (officialTax.test(question) && snapshot.context.domain === "tax") return { useExternalResearch: true, reason: "official_tax_guidance_verification", sourcePriority };
  if (seoResearch.test(question) && snapshot.context.domain === "seo") return { useExternalResearch: true, reason: "public_search_intent_verification", sourcePriority };

  if (snapshot.context.pageType === "product_matching" && hasFinding(snapshot, "product_no_canonical_candidate") && /\b(create|new|canonical|really new|genuinely new)\b|δημιουργ|πραγματικά νέο/i.test(question)) {
    return { useExternalResearch: true, reason: "new_canonical_identity_check", sourcePriority };
  }

  return { useExternalResearch: false, sourcePriority };
}
