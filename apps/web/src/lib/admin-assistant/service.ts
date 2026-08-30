import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminAssistantExternalResearchEnabled, adminAssistantMaxOutputTokens, adminAssistantModel, adminAssistantProviderConfigured } from "./config";
import type { AdminAssistantInvestigationResult } from "./investigation";
import { ADMIN_ASSISTANT_SYSTEM_PROMPT_V1 } from "./prompt";
import { recordAssistantToolAudit } from "./repository";
import { safeAdminHref, type AdminAssistantAction, type AdminAssistantResponsePayload, type AdminAssistantSnapshot, type AdminAssistantSource, type AdminAssistantStoredMessage } from "./types";

function researchRequested(question: string): boolean {
  if (!adminAssistantExternalResearchEnabled()) return false;
  return /(official|manufacturer|public source|web|online|verify|verification|gtin|ean|regulat|aade|mydata|government|documentation|search intent)/i.test(question);
}

function outputText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const data = value as Record<string, unknown>;
  if (typeof data.output_text === "string") return data.output_text;
  if (!Array.isArray(data.output)) return "";
  for (const item of data.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const row = part as Record<string, unknown>;
      if (row.type === "output_text" && typeof row.text === "string") return row.text;
    }
  }
  return "";
}

function collectSources(value: unknown): readonly AdminAssistantSource[] {
  const collected = new Map<string, AdminAssistantSource>();
  const visit = (node: unknown, depth = 0) => {
    if (depth > 8 || !node) return;
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    if (typeof node !== "object") return;
    const row = node as Record<string, unknown>;
    if ((row.type === "url_citation" || row.type === "web_search_result") && typeof row.url === "string") {
      try {
        const url = new URL(row.url);
        if (url.protocol === "https:") collected.set(url.href, { kind: "external", title: typeof row.title === "string" ? row.title.slice(0, 180) : url.hostname, url: url.href });
      } catch { /* ignore malformed provider annotations */ }
    }
    for (const child of Object.values(row)) visit(child, depth + 1);
  };
  visit(value);
  return [...collected.values()].slice(0, 8);
}

function parseModelPayload(text: string, sources: readonly AdminAssistantSource[]): AdminAssistantResponsePayload | undefined {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(normalized) as Record<string, unknown>;
    if (typeof value.summary !== "string" || !Array.isArray(value.facts) || !Array.isArray(value.recommendations)) return undefined;
    const facts = value.facts.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 800)).slice(0, 8);
    const recommendations = value.recommendations.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 900)).slice(0, 6);
    return { summary: value.summary.slice(0, 1_500), facts, interpretation: typeof value.interpretation === "string" ? value.interpretation.slice(0, 1_500) : undefined, recommendations, sources, provider: "openai" };
  } catch { return undefined; }
}

function investigationResult(investigation: readonly AdminAssistantInvestigationResult[] | undefined, toolName: string): AdminAssistantInvestigationResult | undefined {
  return investigation?.find((item) => item.toolName === toolName && item.state === "ok");
}

function deterministicLookupAnswer(
  investigation: readonly AdminAssistantInvestigationResult[] | undefined
): AdminAssistantResponsePayload | undefined {
  const search = investigationResult(investigation, "getGlobalAdminSearch");
  if (!search) return undefined;
  const rawResults = search.data?.results;
  if (!Array.isArray(rawResults)) return undefined;
  const rows = rawResults.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").slice(0, 8);
  if (!rows.length) {
    return {
      summary: "No authorized KONTA MOY Admin entity matched that lookup.",
      facts: ["The permission-aware Admin search returned zero matching orders, customers, support cases, partners, applications or research leads."],
      interpretation: "No identifier should be guessed when the authorized search has no match.",
      recommendations: ["Try a public order/ticket reference, email address, partner name or technical identifier."],
      actions: [],
      sources: [],
      provider: "deterministic"
    };
  }

  const facts = rows.map((row) => `${String(row.kind ?? "entity")}: ${String(row.label ?? row.id ?? "match")} · ${String(row.detail ?? "")}`.slice(0, 800));
  const actions: AdminAssistantAction[] = rows.flatMap((row, index) => {
    const href = safeAdminHref(row.href);
    if (!href) return [];
    return [{ id: `search-open-${index}`, kind: "open" as const, label: `Open ${String(row.label ?? row.id ?? "result")}`.slice(0, 160), href, requiresApproval: false }];
  }).slice(0, 6);

  let summary = rows.length === 1
    ? `Found one authorized match: ${String(rows[0]?.label ?? rows[0]?.id ?? "entity")}. ${String(rows[0]?.detail ?? "")}`
    : `Found ${rows.length} authorized matches. ${rows.slice(0, 3).map((row) => String(row.label ?? row.id ?? "entity")).join(", ")}${rows.length > 3 ? "…" : "."}`;
  const recommendations = rows.length === 1 ? ["Open the matched record or continue with the attached operational inspection."] : ["Choose the intended entity before making any operational conclusion."];

  if (rows.length === 1 && rows[0]?.kind === "order") {
    const orderResult = investigationResult(investigation, "getOrderLifecycleIntelligence");
    const order = orderResult?.data?.order;
    const payment = orderResult?.data?.payment;
    const taxDocuments = orderResult?.data?.taxDocuments;
    if (order && typeof order === "object") {
      const orderRow = order as Record<string, unknown>;
      const paymentRow = payment && typeof payment === "object" ? payment as Record<string, unknown> : undefined;
      summary += ` Order state: ${String(orderRow.status ?? "unknown")}; fulfilment: ${String(orderRow.fulfilmentMode ?? "unknown")}; payment: ${String(paymentRow?.status ?? "unavailable")}; fiscal documents: ${Array.isArray(taxDocuments) ? taxDocuments.length : 0}.`;
      facts.push(`Operational inspection: order=${String(orderRow.status ?? "unknown")}, payment=${String(paymentRow?.status ?? "unavailable")}, fiscalDocuments=${Array.isArray(taxDocuments) ? taxDocuments.length : 0}.`);
    }
  }

  if (rows.length === 1 && rows[0]?.kind === "vendor") {
    const vendorResult = investigationResult(investigation, "getVendorOperationalIntelligence");
    const vendor = vendorResult?.data?.vendor;
    const orders = vendorResult?.data?.orders;
    if (vendor && typeof vendor === "object") {
      const vendorRow = vendor as Record<string, unknown>;
      summary += ` Partner state: ${String(vendorRow.status ?? "unknown")}; agreement documented: ${vendorRow.cooperationDocumented === true ? "yes" : "no"}; approved offers: ${String(vendorRow.approvedOfferCount ?? 0)}; linked order sample: ${Array.isArray(orders) ? orders.length : 0}.`;
      facts.push(`Operational inspection: status=${String(vendorRow.status ?? "unknown")}, agreementDocumented=${vendorRow.cooperationDocumented === true ? "yes" : "no"}, approvedOffers=${String(vendorRow.approvedOfferCount ?? 0)}.`);
    }
  }

  return {
    summary: summary.slice(0, 1_500),
    facts: facts.slice(0, 8),
    interpretation: rows.length === 1 ? "The entity was resolved through authorized KONTA MOY data; no identifier was inferred by the model." : "Multiple authorized entities match, so a deeper operational conclusion would be ambiguous.",
    recommendations,
    actions,
    sources: [],
    provider: "deterministic"
  };
}

function deterministicAnswer(
  question: string,
  snapshot: AdminAssistantSnapshot,
  investigation?: readonly AdminAssistantInvestigationResult[]
): AdminAssistantResponsePayload {
  const lookup = deterministicLookupAnswer(investigation);
  if (lookup) return lookup;

  const normalized = question.toLocaleLowerCase("en");
  const structuredRecommendations = snapshot.recommendations ?? [];
  const recommendations = structuredRecommendations.length
    ? structuredRecommendations.map((item) => item.explanation).slice(0, 5)
    : snapshot.findings.map((item) => item.recommendation).filter((item): item is string => Boolean(item)).slice(0, 5);
  let summary = snapshot.summary;
  let facts = snapshot.facts;

  if (/what changed|changed recently|recent changes|what happened recently|τι.*άλλαξε|αλλαγ.*πρόσφατ/i.test(normalized)) {
    const recent = snapshot.recentActions.slice(0, 6);
    if (recent.length) {
      const actionFacts = recent.map((item) => {
        const when = item.createdAt ? new Date(item.createdAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" }) : "time unavailable";
        return `${item.action} · ${item.entityType} ${item.entityId} · ${when}`;
      });
      summary = `Recent audited Admin changes: ${recent.map((item) => `${item.action} on ${item.entityType} ${item.entityId}`).join("; ")}.`;
      facts = actionFacts;
    } else {
      summary = `No recent audited Admin action is available to this assistant for ${snapshot.context.contextLabel}.`;
      facts = snapshot.facts;
    }
  } else if (/what should i do next|priorit|τι.*επόμεν/i.test(normalized) && structuredRecommendations.length) {
    const top = structuredRecommendations[0];
    summary = `Highest priority: ${top.title}. ${top.explanation}`;
  } else if (/what should i do next|priorit|τι.*επόμεν/i.test(normalized) && snapshot.findings.length) {
    summary = `Highest priority: ${snapshot.findings[0]?.title}. ${snapshot.findings[0]?.detail}`;
  }

  if (/explain.*page|explain.*screen|εξήγη/i.test(normalized)) {
    const purpose = snapshot.context.pagePurpose ? `${snapshot.context.pagePurpose} ` : "";
    const attention = snapshot.context.attentionAreas?.length ? `Pay attention to ${snapshot.context.attentionAreas.join(", ")}. ` : "";
    summary = `${snapshot.context.contextLabel}. ${purpose}${attention}${snapshot.summary}`;
  }
  return {
    summary,
    facts,
    interpretation: snapshot.findings[0]?.detail,
    recommendations: recommendations.length ? recommendations : ["No additional action is justified by the deterministic checks currently available for this page."],
    structuredRecommendations,
    actions: structuredRecommendations.flatMap((item) => item.actions).filter((action) => !action.requiresApproval).slice(0, 6),
    sources: [],
    provider: "deterministic"
  };
}

export async function answerAdminAssistant(principal: SessionPrincipal, input: {
  question: string;
  snapshot: AdminAssistantSnapshot;
  history: readonly AdminAssistantStoredMessage[];
  conversationId: string;
  investigation?: readonly AdminAssistantInvestigationResult[];
  signal?: AbortSignal;
}): Promise<AdminAssistantResponsePayload> {
  if (!adminAssistantProviderConfigured()) return deterministicAnswer(input.question, input.snapshot, input.investigation);
  const useResearch = researchRequested(input.question);
  const compactHistory = input.history.slice(-12).map((message) => ({ role: message.role, content: message.content.slice(0, 2_000) }));
  const providerInput = JSON.stringify({
    currentAdminContext: input.snapshot.context,
    deterministicSnapshot: {
      summary: input.snapshot.summary,
      facts: input.snapshot.facts,
      findings: input.snapshot.findings,
      recommendations: input.snapshot.recommendations,
      recentActions: input.snapshot.recentActions
    },
    authorizedInvestigation: input.investigation?.map((item) => ({ toolName: item.toolName, state: item.state, data: item.data, error: item.error })) ?? [],
    recentConversation: compactHistory,
    adminQuestion: input.question
  });
  const startedAt = Date.now();
  try {
    const timeout = AbortSignal.timeout(25_000);
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}` },
      body: JSON.stringify({ model: adminAssistantModel(), instructions: ADMIN_ASSISTANT_SYSTEM_PROMPT_V1, input: providerInput, max_output_tokens: adminAssistantMaxOutputTokens(), ...(useResearch ? { tools: [{ type: "web_search" }] } : {}) }),
      signal
    });
    const data = await response.json() as unknown;
    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const text = outputText(data);
    const parsed = parseModelPayload(text, collectSources(data));
    if (!parsed) throw new Error("AI provider returned invalid structured output");
    await recordAssistantToolAudit(principal, { conversationId: input.conversationId, toolName: useResearch ? "openai.responses.web_search" : "openai.responses", parameters: { model: adminAssistantModel(), externalResearch: useResearch, contextDomain: input.snapshot.context.domain, investigationTools: input.investigation?.map((item) => item.toolName) ?? [] }, resultState: "ok", durationMs: Date.now() - startedAt }).catch(() => undefined);
    return parsed;
  } catch (cause) {
    await recordAssistantToolAudit(principal, { conversationId: input.conversationId, toolName: useResearch ? "openai.responses.web_search" : "openai.responses", parameters: { model: adminAssistantModel(), externalResearch: useResearch, contextDomain: input.snapshot.context.domain, investigationTools: input.investigation?.map((item) => item.toolName) ?? [] }, resultState: "error", error: cause instanceof Error ? cause.message : "provider_failed", durationMs: Date.now() - startedAt }).catch(() => undefined);
    return deterministicAnswer(input.question, input.snapshot, input.investigation);
  }
}
