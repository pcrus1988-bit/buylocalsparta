import type { SeoCrawlGraphNode } from "./seo-crawl-graph";
import { findSeoEntityOverride, type SeoEntityOverride, type SeoEntityReference } from "./seo-entity-policy";

export type SeoSchemaExpectation = Readonly<{
  managed: boolean;
  allowed: boolean;
  requiredTypes: readonly string[];
  reference?: SeoEntityReference;
}>;

const PRODUCT_SCHEMA_TYPES = ["Product", "Offer", "BreadcrumbList"] as const;
const VENDOR_SCHEMA_TYPES = ["LocalBusiness"] as const;

function referenceForNode(node: SeoCrawlGraphNode): SeoEntityReference | undefined {
  if (node.kind === "product") {
    const id = node.key.startsWith("product:") ? node.key.slice("product:".length) : "";
    return id ? { kind: "product", id } : undefined;
  }
  if (node.kind === "partner_vendor" || node.kind === "research_vendor") {
    const prefix = `${node.kind}:`;
    const id = node.key.startsWith(prefix) ? node.key.slice(prefix.length) : "";
    return id ? { kind: node.kind, id } : undefined;
  }
  return undefined;
}

export function schemaExpectationForNode(
  node: SeoCrawlGraphNode,
  overrides: readonly SeoEntityOverride[]
): SeoSchemaExpectation {
  const reference = referenceForNode(node);
  if (!reference) return { managed: false, allowed: false, requiredTypes: [] };

  const override = findSeoEntityOverride(overrides, reference);
  const allowed = Boolean(node.indexAllowed && override?.schemaDecision !== "deny");
  const requiredTypes = reference.kind === "product" ? PRODUCT_SCHEMA_TYPES : VENDOR_SCHEMA_TYPES;
  return { managed: true, allowed, requiredTypes: allowed ? requiredTypes : [], reference };
}

export function missingSchemaTypes(expectation: SeoSchemaExpectation, observedTypes: readonly string[]): readonly string[] {
  if (!expectation.managed || !expectation.allowed) return [];
  const observed = new Set(observedTypes);
  return expectation.requiredTypes.filter((type) => !observed.has(type));
}

export function issueCodeForMissingSchemaType(type: string): string {
  if (type === "Product") return "missing_product_schema";
  if (type === "Offer") return "missing_offer_schema";
  if (type === "BreadcrumbList") return "missing_breadcrumb_schema";
  if (type === "LocalBusiness") return "missing_local_business_schema";
  return "missing_schema_type";
}
