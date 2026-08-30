function enabled(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

export function adminAssistantEnabled(): boolean { return enabled("ADMIN_ASSISTANT_ENABLED", true); }
export function adminAssistantProactiveEnabled(): boolean { return enabled("ADMIN_ASSISTANT_PROACTIVE_INSIGHTS", true); }
export function adminAssistantExternalResearchEnabled(): boolean { return enabled("ADMIN_ASSISTANT_EXTERNAL_RESEARCH", false); }
export function adminAssistantActionsEnabled(): boolean { return enabled("ADMIN_ASSISTANT_ACTIONS", false); }
export function adminAssistantModel(): string { return process.env.ADMIN_ASSISTANT_MODEL?.trim() || "gpt-5.6-luna"; }
export function adminAssistantMaxOutputTokens(): number {
  const value = Number(process.env.ADMIN_ASSISTANT_MAX_OUTPUT_TOKENS ?? 1800);
  return Number.isSafeInteger(value) ? Math.min(4_000, Math.max(300, value)) : 1800;
}
export function adminAssistantProviderConfigured(): boolean { return Boolean(process.env.OPENAI_API_KEY?.trim()); }
