import type { FulfilmentMode } from "../fairness/types.ts";

export type CategoryCommerceMode =
  | "standard"
  | "logistics_sensitive"
  | "compatibility_sensitive"
  | "regulated_mixed"
  | "vehicles"
  | "directory_only";

export type AttributeDataType = "text" | "number" | "boolean" | "enum" | "multienum" | "dimension";

export type AttributeDefinition = Readonly<{
  code: string;
  labelEl: string;
  labelEn?: string;
  dataType: AttributeDataType;
  unit?: string;
  values?: readonly string[];
  variantIdentity?: boolean;
  filterable?: boolean;
}>;

export type CategoryAttributeBinding = Readonly<{
  attributeCode: string;
  required?: boolean;
  sortOrder?: number;
}>;

export type CategoryGovernancePolicy = Readonly<{
  categoryCode: string;
  labelEl: string;
  labelEn?: string;
  commerceMode: CategoryCommerceMode;
  attributes?: readonly CategoryAttributeBinding[];
  requireCompatibilityConfirmation?: boolean;
  regulatedCheckoutAllowed?: boolean;
  checkoutFulfilmentModes?: readonly FulfilmentMode[];
  counterofferAllowed?: boolean;
  adviceAllowed?: boolean;
}>;

export type AttributeValidationIssue = Readonly<{
  attributeCode: string;
  code: "required" | "invalid_type" | "invalid_value";
  message: string;
}>;

export type CategoryAttributeSchema = Readonly<{
  categoryCode: string;
  commerceMode: CategoryCommerceMode;
  attributes: readonly (AttributeDefinition & { required: boolean; sortOrder: number })[];
}>;

export type CommerceAction = "discover" | "advice" | "counteroffer" | "checkout";

export type CommercePolicyDecision = Readonly<{
  allowed: boolean;
  action: CommerceAction;
  categoryCode: string;
  commerceMode: CategoryCommerceMode;
  code?: "compatibility_confirmation_required" | "regulated_checkout_blocked" | "enquiry_only" | "fulfilment_mode_not_allowed" | "counteroffer_not_allowed" | "advice_not_allowed";
  message?: string;
}>;

export class CategoryGovernanceService {
  readonly #attributes = new Map<string, AttributeDefinition>();
  readonly #policies = new Map<string, CategoryGovernancePolicy>();

  registerAttribute(definition: AttributeDefinition): void {
    const code = definition.code.trim();
    if (!code) throw new Error("Attribute code is required");
    if (!definition.labelEl.trim()) throw new Error(`Attribute ${code} requires a Greek label`);
    if ((definition.dataType === "enum" || definition.dataType === "multienum") && !(definition.values?.length)) {
      throw new Error(`Attribute ${code} requires governed enum values`);
    }
    this.#attributes.set(code, { ...definition, code, values: definition.values ? [...definition.values] : undefined });
  }

  registerCategory(policy: CategoryGovernancePolicy): void {
    const categoryCode = policy.categoryCode.trim();
    if (!categoryCode) throw new Error("Category code is required");
    if (!policy.labelEl.trim()) throw new Error(`Category ${categoryCode} requires a Greek label`);
    for (const binding of policy.attributes ?? []) {
      if (!this.#attributes.has(binding.attributeCode)) throw new Error(`Unknown governed attribute ${binding.attributeCode}`);
    }
    this.#policies.set(categoryCode, {
      ...policy,
      categoryCode,
      attributes: [...(policy.attributes ?? [])],
      checkoutFulfilmentModes: policy.checkoutFulfilmentModes ? [...policy.checkoutFulfilmentModes] : undefined
    });
  }

  policy(categoryCode: string): CategoryGovernancePolicy {
    return structuredClone(this.#policies.get(categoryCode) ?? {
      categoryCode,
      labelEl: categoryCode,
      commerceMode: "standard",
      adviceAllowed: true,
      counterofferAllowed: true
    });
  }

  schema(categoryCode: string): CategoryAttributeSchema {
    const policy = this.policy(categoryCode);
    const attributes = (policy.attributes ?? [])
      .map((binding) => {
        const definition = this.#attributes.get(binding.attributeCode);
        if (!definition) throw new Error(`Unknown governed attribute ${binding.attributeCode}`);
        return { ...structuredClone(definition), required: binding.required ?? false, sortOrder: binding.sortOrder ?? 0 };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    return { categoryCode, commerceMode: policy.commerceMode, attributes };
  }

  categories(): readonly CategoryGovernancePolicy[] {
    return [...this.#policies.values()].map((item) => structuredClone(item));
  }

  attributeDefinitions(): readonly AttributeDefinition[] {
    return [...this.#attributes.values()].map((item) => structuredClone(item));
  }

  validateAttributes(categoryCode: string, raw: Readonly<Record<string, string>>): Readonly<{ valid: boolean; normalized: Readonly<Record<string, string>>; issues: readonly AttributeValidationIssue[] }> {
    const schema = this.schema(categoryCode);
    const issues: AttributeValidationIssue[] = [];
    const normalized: Record<string, string> = {};
    const known = new Set(schema.attributes.map((attribute) => attribute.code));

    for (const attribute of schema.attributes) {
      const source = raw[attribute.code]?.trim();
      if (!source) {
        if (attribute.required) issues.push({ attributeCode: attribute.code, code: "required", message: `${attribute.labelEl} is required` });
        continue;
      }
      const result = normalizeValue(attribute, source);
      if ("code" in result) issues.push({ attributeCode: attribute.code, code: result.code, message: result.message });
      else normalized[attribute.code] = result.value;
    }

    // Preserve non-governed vendor attributes for matching/content, but governed fields are normalized above.
    for (const [key, value] of Object.entries(raw)) if (!known.has(key) && value.trim()) normalized[key] = value.trim();
    return { valid: issues.length === 0, normalized, issues };
  }

  decide(input: {
    categoryCode: string;
    action: CommerceAction;
    fulfilmentMode?: FulfilmentMode;
    compatibilityConfirmed?: boolean;
    complianceCleared?: boolean;
  }): CommercePolicyDecision {
    const policy = this.policy(input.categoryCode);
    const base = { action: input.action, categoryCode: input.categoryCode, commerceMode: policy.commerceMode } as const;
    if (input.action === "discover") return { ...base, allowed: true };
    if (input.action === "advice" && policy.adviceAllowed === false) return { ...base, allowed: false, code: "advice_not_allowed", message: "Advice is not enabled for this category" };
    if (input.action === "counteroffer" && policy.counterofferAllowed === false) return { ...base, allowed: false, code: "counteroffer_not_allowed", message: "Private counteroffers are not enabled for this category" };
    if (input.action !== "checkout") return { ...base, allowed: true };

    if (policy.commerceMode === "directory_only" || policy.commerceMode === "vehicles") {
      return { ...base, allowed: false, code: "enquiry_only", message: "This category is enquiry/appointment only and cannot use ordinary checkout" };
    }
    if (policy.commerceMode === "regulated_mixed" && !policy.regulatedCheckoutAllowed && !input.complianceCleared) {
      return { ...base, allowed: false, code: "regulated_checkout_blocked", message: "Checkout requires product-level compliance clearance for this category" };
    }
    if (policy.commerceMode === "compatibility_sensitive" && (policy.requireCompatibilityConfirmation ?? true) && !input.compatibilityConfirmed) {
      return { ...base, allowed: false, code: "compatibility_confirmation_required", message: "Confirm compatibility or ask the local adviser before checkout" };
    }
    if (policy.checkoutFulfilmentModes?.length && input.fulfilmentMode && !policy.checkoutFulfilmentModes.includes(input.fulfilmentMode)) {
      return { ...base, allowed: false, code: "fulfilment_mode_not_allowed", message: `Checkout is not enabled for ${input.fulfilmentMode} in this category` };
    }
    return { ...base, allowed: true };
  }

  facetValues(categoryCode: string, products: readonly Readonly<Record<string, string>>[]): Readonly<Record<string, readonly { value: string; count: number }[]>> {
    const schema = this.schema(categoryCode);
    const result: Record<string, readonly { value: string; count: number }[]> = {};
    for (const attribute of schema.attributes.filter((item) => item.filterable !== false)) {
      const counts = new Map<string, number>();
      for (const product of products) {
        const raw = product[attribute.code];
        if (!raw) continue;
        const values = attribute.dataType === "multienum" ? raw.split("|").map((value) => value.trim()).filter(Boolean) : [raw];
        for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      result[attribute.code] = [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "el"));
    }
    return result;
  }
}

function normalizeValue(attribute: AttributeDefinition, input: string): { ok: true; value: string } | { ok: false; code: "invalid_type" | "invalid_value"; message: string } {
  if (attribute.dataType === "boolean") {
    const normalized = input.toLowerCase();
    if (["true", "1", "yes", "ναι"].includes(normalized)) return { ok: true, value: "true" };
    if (["false", "0", "no", "οχι", "όχι"].includes(normalized)) return { ok: true, value: "false" };
    return { ok: false, code: "invalid_type", message: `${attribute.labelEl} must be yes/no` };
  }
  if (attribute.dataType === "number" || attribute.dataType === "dimension") {
    const numeric = Number(input.replace(",", "."));
    if (!Number.isFinite(numeric)) return { ok: false, code: "invalid_type", message: `${attribute.labelEl} must be numeric` };
    return { ok: true, value: String(numeric) };
  }
  if (attribute.dataType === "enum") {
    const match = attribute.values?.find((value) => value.toLocaleLowerCase("el-GR") === input.toLocaleLowerCase("el-GR"));
    return match ? { ok: true, value: match } : { ok: false, code: "invalid_value", message: `${attribute.labelEl} must be one of: ${(attribute.values ?? []).join(", ")}` };
  }
  if (attribute.dataType === "multienum") {
    const inputValues = input.split("|").map((value) => value.trim()).filter(Boolean);
    const normalized: string[] = [];
    for (const value of inputValues) {
      const match = attribute.values?.find((candidate) => candidate.toLocaleLowerCase("el-GR") === value.toLocaleLowerCase("el-GR"));
      if (!match) return { ok: false, code: "invalid_value", message: `${attribute.labelEl} contains unsupported value ${value}` };
      if (!normalized.includes(match)) normalized.push(match);
    }
    return { ok: true, value: normalized.join("|") };
  }
  return { ok: true, value: input.trim() };
}
