export type AdminAssistantSeverity = "info" | "opportunity" | "warning" | "critical";
export type AdminAssistantPriority = "low" | "medium" | "high" | "critical";
export type AdminAssistantConfidence = "high" | "medium" | "low";
export type AdminAssistantDomain = "dashboard" | "catalogue" | "orders" | "partners" | "tax" | "seo" | "gift_cards" | "platform" | "generic";
export type AdminAssistantEvidenceKind = "kontamou" | "external" | "admin_event" | "derived";
export type AdminAssistantActionKind = "open" | "inspect" | "compare" | "diagnostic" | "preview" | "prepare" | "execute";

export type AdminAssistantClientContext = Readonly<{
  route: string;
  filters?: Readonly<Record<string, string>>;
  searchQuery?: string;
  selectedTab?: string;
}>;

export type AdminAssistantEntityRef = Readonly<{
  type: string;
  id: string;
  label: string;
  href?: string;
}>;

export type AdminAssistantContext = Readonly<{
  route: string;
  pageType: string;
  domain: AdminAssistantDomain;
  contextLabel: string;
  pagePurpose?: string;
  attentionAreas?: readonly string[];
  entityType?: string;
  entityId?: string;
  entityName?: string;
  selectedTab?: string;
  searchQuery?: string;
  filters: Readonly<Record<string, string>>;
  permissions?: readonly string[];
  capabilities: readonly string[];
}>;

export type AdminAssistantEvidence = Readonly<{
  id: string;
  kind: AdminAssistantEvidenceKind;
  label: string;
  detail: string;
  metric?: number | string | boolean;
  entity?: AdminAssistantEntityRef;
  sourceTool?: string;
  observedAt?: number;
}>;

export type AdminAssistantFact = Readonly<{
  id: string;
  label: string;
  value: string;
  evidenceIds: readonly string[];
  entity?: AdminAssistantEntityRef;
}>;

export type AdminAssistantAction = Readonly<{
  id: string;
  kind: AdminAssistantActionKind;
  label: string;
  href?: string;
  command?: string;
  entity?: AdminAssistantEntityRef;
  requiresApproval: boolean;
}>;

export type AdminAssistantFinding = Readonly<{
  id: string;
  severity: AdminAssistantSeverity;
  category: string;
  title: string;
  detail: string;
  evidence: readonly string[];
  evidenceIds?: readonly string[];
  recommendation?: string;
  href?: string;
  affectedCount?: number;
  affectedEntities?: readonly AdminAssistantEntityRef[];
  confidence?: AdminAssistantConfidence;
  ruleId?: string;
}>;

export type AdminAssistantRecommendation = Readonly<{
  id: string;
  title: string;
  explanation: string;
  priority: AdminAssistantPriority;
  confidence: AdminAssistantConfidence;
  evidenceIds: readonly string[];
  affectedEntities: readonly AdminAssistantEntityRef[];
  actions: readonly AdminAssistantAction[];
  dimensions: Readonly<{
    financialImpact?: number;
    customerImpact?: number;
    vendorImpact?: number;
    complianceRisk?: number;
    dataQualityImpact?: number;
    seoImpact?: number;
    urgency?: number;
    effort?: number;
    reversibility?: number;
  }>;
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
  structuredFacts?: readonly AdminAssistantFact[];
  evidence?: readonly AdminAssistantEvidence[];
  findings: readonly AdminAssistantFinding[];
  recommendations?: readonly AdminAssistantRecommendation[];
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
  structuredRecommendations?: readonly AdminAssistantRecommendation[];
  actions?: readonly AdminAssistantAction[];
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
