export type AdminAssistantSeverity = "info" | "opportunity" | "warning" | "critical";
export type AdminAssistantDomain = "dashboard" | "catalogue" | "orders" | "partners" | "tax" | "seo" | "gift_cards" | "platform" | "generic";

export type AdminAssistantClientContext = Readonly<{
  route: string;
  filters?: Readonly<Record<string, string>>;
  searchQuery?: string;
  selectedTab?: string;
}>;

export type AdminAssistantContext = Readonly<{
  route: string;
  pageType: string;
  domain: AdminAssistantDomain;
  contextLabel: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  selectedTab?: string;
  filters: Readonly<Record<string, string>>;
  capabilities: readonly string[];
}>;

export type AdminAssistantFinding = Readonly<{
  id: string;
  severity: AdminAssistantSeverity;
  category: string;
  title: string;
  detail: string;
  evidence: readonly string[];
  recommendation?: string;
  href?: string;
  affectedCount?: number;
  confidence?: "high" | "medium" | "low";
}>;

export type AdminAssistantRecentAction = Readonly<{
  action: string;
  entityType: string;
  entityId: string;
  createdAt?: number;
}>;

export type AdminAssistantSnapshot = Readonly<{
  context: AdminAssistantContext;
  summary: string;
  facts: readonly string[];
  findings: readonly AdminAssistantFinding[];
  recentActions: readonly AdminAssistantRecentAction[];
  suggestedQuestions: readonly string[];
  generatedAt: number;
}>;

export type AdminAssistantSource = Readonly<{
  kind: "external";
  title: string;
  url: string;
}>;

export type AdminAssistantResponsePayload = Readonly<{
  summary: string;
  facts: readonly string[];
  interpretation?: string;
  recommendations: readonly string[];
  sources: readonly AdminAssistantSource[];
  provider: "deterministic" | "openai";
}>;

export type AdminAssistantStoredMessage = Readonly<{
  id: string;
  role: "user" | "assistant";
  content: string;
  structured?: AdminAssistantResponsePayload;
  createdAt: number;
}>;

export type AdminAssistantConversationSummary = Readonly<{
  id: string;
  title: string;
  lastRoute?: string;
  entityType?: string;
  entityId?: string;
  createdAt: number;
  updatedAt: number;
}>;

export function safeAdminHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const href = value.trim();
  return href === "/admin" || href.startsWith("/admin/") ? href.slice(0, 500) : undefined;
}

export function boundedText(value: unknown, max = 4_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
