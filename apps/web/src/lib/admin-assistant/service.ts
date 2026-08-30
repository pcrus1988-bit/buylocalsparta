import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminAssistantExternalResearchEnabled, adminAssistantMaxOutputTokens, adminAssistantModel, adminAssistantProviderConfigured } from "./config";
import { ADMIN_ASSISTANT_SYSTEM_PROMPT_V1 } from "./prompt";
import { recordAssistantToolAudit } from "./repository";
import type { AdminAssistantResponsePayload, AdminAssistantSnapshot, AdminAssistantSource, AdminAssistantStoredMessage } from "./types";

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

function deterministicAnswer(question: string, snapshot: AdminAssistantSnapshot): AdminAssistantResponsePayload {
  const normalized = question.toLocaleLowerCase("en");
  const recommendations = snapshot.findings.map((item) => item.recommendation).filter((item): item is string => Boolean(item)).slice(0, 5);
  let summary = snapshot.summary;
  if (/what should i do next|priorit|τι.*επόμεν/i.test(normalized) && snapshot.findings.length) summary = `Highest priority: ${snapshot.findings[0]?.title}. ${snapshot.findings[0]?.detail}`;
  if (/explain.*page|explain.*screen|εξήγη/i.test(normalized)) summary = `${snapshot.context.contextLabel} is currently supported by ${snapshot.context.capabilities.join(", ") || "read-only context"}. ${snapshot.summary}`;
  return { summary, facts: snapshot.facts, interpretation: snapshot.findings[0]?.detail, recommendations: recommendations.length ? recommendations : ["No additional action is justified by the deterministic checks currently available for this page."], sources: [], provider: "deterministic" };
}

export async function answerAdminAssistant(principal: SessionPrincipal, input: { question: string; snapshot: AdminAssistantSnapshot; history: readonly AdminAssistantStoredMessage[]; conversationId: string; signal?: AbortSignal }): Promise<AdminAssistantResponsePayload> {
  if (!adminAssistantProviderConfigured()) return deterministicAnswer(input.question, input.snapshot);
  const useResearch = researchRequested(input.question);
  const compactHistory = input.history.slice(-12).map((message) => ({ role: message.role, content: message.content.slice(0, 2_000) }));
  const providerInput = JSON.stringify({ currentAdminContext: input.snapshot.context, deterministicSnapshot: { summary: input.snapshot.summary, facts: input.snapshot.facts, findings: input.snapshot.findings, recentActions: input.snapshot.recentActions }, recentConversation: compactHistory, adminQuestion: input.question });
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
    await recordAssistantToolAudit(principal, { conversationId: input.conversationId, toolName: useResearch ? "openai.responses.web_search" : "openai.responses", parameters: { model: adminAssistantModel(), externalResearch: useResearch, contextDomain: input.snapshot.context.domain }, resultState: "ok", durationMs: Date.now() - startedAt }).catch(() => undefined);
    return parsed;
  } catch (cause) {
    await recordAssistantToolAudit(principal, { conversationId: input.conversationId, toolName: useResearch ? "openai.responses.web_search" : "openai.responses", parameters: { model: adminAssistantModel(), externalResearch: useResearch, contextDomain: input.snapshot.context.domain }, resultState: "error", error: cause instanceof Error ? cause.message : "provider_failed", durationMs: Date.now() - startedAt }).catch(() => undefined);
    return deterministicAnswer(input.question, input.snapshot);
  }
}
