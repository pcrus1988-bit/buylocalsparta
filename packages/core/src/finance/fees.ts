import { id } from "../common/ids.ts";
import { addMoney, applyBasisPoints, money, type Money } from "../common/money.ts";
import type { FulfilmentMode } from "../fairness/types.ts";

export type FeeRuleSource = "vendor_contract" | "campaign_credit" | "plan" | "category" | "market_default";
export type FeeBasis = "supplier_net" | "supplier_gross" | "retail_net" | "retail_gross" | "shipping_reimbursement";
export type FeeCalculation = "fixed" | "percentage" | "credit";

export type FeeRule = Readonly<{
  id: string;
  feeCode: string;
  marketId: string;
  source: FeeRuleSource;
  calculation: FeeCalculation;
  basis: FeeBasis;
  vendorId?: string;
  planCode?: string;
  categoryCode?: string;
  fulfilmentMode?: FulfilmentMode;
  fixedAmount?: Money;
  rateBps?: number;
  capAmount?: Money;
  floorAmount?: Money;
  taxRateBps: number;
  priority: number;
  version: number;
  active: boolean;
  startsAt: number;
  endsAt?: number;
}>;

export type FeeContext = Readonly<{
  marketId: string;
  vendorId: string;
  planCode?: string;
  categoryCode?: string;
  fulfilmentMode: FulfilmentMode;
  supplierNet: Money;
  supplierGross: Money;
  retailNet: Money;
  retailGross: Money;
  shippingReimbursement: Money;
  now: number;
}>;

export type FeeSnapshot = Readonly<{
  id: string;
  feeCode: string;
  ruleId: string;
  ruleVersion: number;
  source: FeeRuleSource;
  basis: FeeBasis;
  basisAmount: Money;
  netAmount: Money;
  taxAmount: Money;
  grossAmount: Money;
  resolvedAt: number;
  resolvedRule: Readonly<Record<string, unknown>>;
}>;

const SOURCE_RANK: Record<FeeRuleSource, number> = {
  vendor_contract: 5,
  campaign_credit: 4,
  plan: 3,
  category: 2,
  market_default: 1
};

function basisAmount(rule: FeeRule, context: FeeContext): Money {
  switch (rule.basis) {
    case "supplier_net": return context.supplierNet;
    case "supplier_gross": return context.supplierGross;
    case "retail_net": return context.retailNet;
    case "retail_gross": return context.retailGross;
    case "shipping_reimbursement": return context.shippingReimbursement;
  }
}

function clampAmount(value: Money, floor?: Money, cap?: Money): Money {
  let minor = value.minor;
  if (floor) {
    if (floor.currency !== value.currency) throw new Error("Fee floor currency mismatch");
    minor = Math.max(minor, floor.minor);
  }
  if (cap) {
    if (cap.currency !== value.currency) throw new Error("Fee cap currency mismatch");
    minor = Math.min(minor, cap.minor);
  }
  return money(minor, value.currency);
}

export class FeeRuleEngine {
  readonly #rules = new Map<string, FeeRule>();

  register(input: Omit<FeeRule, "id"> & { id?: string }): FeeRule {
    if (!input.feeCode.trim()) throw new Error("Fee code is required");
    if (!input.marketId.trim()) throw new Error("Fee market is required");
    if (!Number.isSafeInteger(input.priority)) throw new Error("Fee priority must be an integer");
    if (!Number.isSafeInteger(input.version) || input.version <= 0) throw new Error("Fee rule version must be positive");
    if (!Number.isSafeInteger(input.taxRateBps) || input.taxRateBps < 0) throw new Error("Fee tax rate must be non-negative basis points");
    if (input.endsAt !== undefined && input.endsAt <= input.startsAt) throw new Error("Fee rule end must be after start");
    if (input.calculation === "fixed" && !input.fixedAmount) throw new Error("Fixed fee rule requires fixed amount");
    if (input.calculation !== "fixed" && !Number.isSafeInteger(input.rateBps)) throw new Error(`${input.calculation} fee rule requires rate basis points`);
    if (input.rateBps !== undefined && input.rateBps < 0) throw new Error("Fee rate cannot be negative");
    const record: FeeRule = Object.freeze({ ...input, id: input.id ?? id("fee-rule") });
    this.#rules.set(record.id, record);
    return structuredClone(record);
  }

  rules(): readonly FeeRule[] {
    return [...this.#rules.values()].map((rule) => structuredClone(rule));
  }

  resolve(context: FeeContext): readonly FeeSnapshot[] {
    const matching = [...this.#rules.values()].filter((rule) => {
      if (!rule.active || rule.marketId !== context.marketId) return false;
      if (rule.startsAt > context.now || (rule.endsAt !== undefined && rule.endsAt <= context.now)) return false;
      if (rule.vendorId && rule.vendorId !== context.vendorId) return false;
      if (rule.planCode && rule.planCode !== context.planCode) return false;
      if (rule.categoryCode && rule.categoryCode !== context.categoryCode) return false;
      if (rule.fulfilmentMode && rule.fulfilmentMode !== context.fulfilmentMode) return false;
      return true;
    });

    const byCode = new Map<string, FeeRule[]>();
    for (const rule of matching) {
      const current = byCode.get(rule.feeCode) ?? [];
      current.push(rule);
      byCode.set(rule.feeCode, current);
    }

    const snapshots: FeeSnapshot[] = [];
    for (const [feeCode, rules] of byCode.entries()) {
      rules.sort((a, b) => SOURCE_RANK[b.source] - SOURCE_RANK[a.source] || b.priority - a.priority || b.version - a.version || a.id.localeCompare(b.id));
      const rule = rules[0];
      const basis = basisAmount(rule, context);
      let netAmount: Money;
      if (rule.calculation === "fixed") {
        if (!rule.fixedAmount) throw new Error("Resolved fixed fee has no amount");
        if (rule.fixedAmount.currency !== basis.currency) throw new Error("Fixed fee currency mismatch");
        netAmount = rule.fixedAmount;
      } else {
        netAmount = applyBasisPoints(basis, rule.rateBps ?? 0);
        if (rule.calculation === "credit") netAmount = money(-Math.abs(netAmount.minor), netAmount.currency);
      }
      netAmount = clampAmount(netAmount, rule.floorAmount, rule.capAmount);
      const taxAmount = applyBasisPoints(netAmount, rule.taxRateBps);
      const grossAmount = addMoney(netAmount, taxAmount);
      snapshots.push(Object.freeze({
        id: id("fee-snapshot"), feeCode, ruleId: rule.id, ruleVersion: rule.version,
        source: rule.source, basis: rule.basis, basisAmount: basis, netAmount, taxAmount, grossAmount,
        resolvedAt: context.now,
        resolvedRule: Object.freeze({
          calculation: rule.calculation,
          rateBps: rule.rateBps,
          fixedMinor: rule.fixedAmount?.minor,
          taxRateBps: rule.taxRateBps,
          vendorId: rule.vendorId,
          planCode: rule.planCode,
          categoryCode: rule.categoryCode,
          fulfilmentMode: rule.fulfilmentMode,
          priority: rule.priority
        })
      }));
    }
    return snapshots.sort((a, b) => a.feeCode.localeCompare(b.feeCode));
  }
}
