import { id } from "../common/ids.ts";
import type { Money } from "../common/money.ts";
import { money } from "../common/money.ts";
import { matchProducts } from "./matching.ts";
import type { MatchResult, ProductCondition, ProductIdentity } from "./types.ts";

export type VendorProductSubmissionStatus =
  | "draft"
  | "submitted"
  | "needs_review"
  | "linked"
  | "approved"
  | "rejected"
  | "archived";

export type MatchCandidateStatus = "pending" | "auto_linked" | "approved" | "rejected" | "separated";

export type CatalogFulfilmentMode = "pickup" | "local_delivery" | "shipping";

export type CanonicalCatalogProduct = Readonly<{
  id: string;
  marketId: string;
  categoryCode: string;
  identity: ProductIdentity;
  titleEl: string;
  titleEn?: string;
  descriptionEl?: string;
  platformPrice: Money;
  taxRateBps: number;
  synonyms?: readonly string[];
  adviceAvailable?: boolean;
  active: boolean;
  suppressed: boolean;
  recalled: boolean;
  createdAt: number;
  updatedAt: number;
}>;

export type VendorProductSubmission = {
  id: string;
  marketId: string;
  vendorId: string;
  locationId: string;
  vendorSku?: string;
  categoryCode: string;
  identity: ProductIdentity;
  supplierUnitPrice: Money;
  supplierTaxRateBps: number;
  stockOnHand: number;
  safetyStock: number;
  fulfilmentModes: CatalogFulfilmentMode[];
  adviceAvailable: boolean;
  source: "manual" | "csv" | "api";
  sourcePayload?: Readonly<Record<string, unknown>>;
  status: VendorProductSubmissionStatus;
  canonicalVariantId?: string;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
};

export type ProductMatchCandidate = {
  id: string;
  submissionId: string;
  vendorId: string;
  candidateCanonicalVariantId: string;
  result: MatchResult;
  status: MatchCandidateStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  reviewReason?: string;
  createdAt: number;
};

export type CatalogWorkflowEvent = Readonly<{
  id: string;
  submissionId: string;
  actorId: string;
  action: string;
  fromStatus?: VendorProductSubmissionStatus;
  toStatus?: VendorProductSubmissionStatus;
  canonicalVariantId?: string;
  reason?: string;
  createdAt: number;
}>;

export class CatalogManagementService {
  readonly #canonicals = new Map<string, CanonicalCatalogProduct>();
  readonly #submissions = new Map<string, VendorProductSubmission>();
  readonly #candidates = new Map<string, ProductMatchCandidate>();
  readonly #events: CatalogWorkflowEvent[] = [];

  registerCanonical(product: CanonicalCatalogProduct): void {
    this.#assertCanonical(product);
    this.#canonicals.set(product.id, structuredClone(product));
  }

  canonical(idValue: string): CanonicalCatalogProduct | undefined {
    const value = this.#canonicals.get(idValue);
    return value ? structuredClone(value) : undefined;
  }

  setCanonicalAvailability(input: { canonicalVariantId: string; suppressed?: boolean; recalled?: boolean; active?: boolean; now: number }): CanonicalCatalogProduct {
    const current = this.#canonicals.get(input.canonicalVariantId);
    if (!current) throw new Error("Canonical product not found");
    const next: CanonicalCatalogProduct = {
      ...current,
      active: input.active ?? current.active,
      suppressed: input.suppressed ?? current.suppressed,
      recalled: input.recalled ?? current.recalled,
      updatedAt: input.now
    };
    this.#canonicals.set(next.id, next);
    return structuredClone(next);
  }

  canonicals(filter: { marketId?: string; categoryCode?: string; activeOnly?: boolean } = {}): readonly CanonicalCatalogProduct[] {
    return [...this.#canonicals.values()]
      .filter((product) => !filter.marketId || product.marketId === filter.marketId)
      .filter((product) => !filter.categoryCode || product.categoryCode === filter.categoryCode)
      .filter((product) => !filter.activeOnly || (product.active && !product.suppressed && !product.recalled))
      .map((product) => structuredClone(product));
  }

  createDraft(input: {
    marketId: string;
    vendorId: string;
    locationId: string;
    vendorSku?: string;
    categoryCode: string;
    title: string;
    brand?: string;
    model?: string;
    mpn?: string;
    gtin?: string;
    condition?: ProductCondition;
    warrantyBasis?: string;
    attributes?: Readonly<Record<string, string>>;
    supplierUnitPriceMinor: number;
    supplierTaxRateBps?: number;
    stockOnHand: number;
    safetyStock?: number;
    fulfilmentModes?: readonly CatalogFulfilmentMode[];
    adviceAvailable?: boolean;
    source?: VendorProductSubmission["source"];
    sourcePayload?: Readonly<Record<string, unknown>>;
    now: number;
  }): VendorProductSubmission {
    for (const value of [input.marketId, input.vendorId, input.locationId, input.categoryCode, input.title]) {
      if (!value.trim()) throw new Error("Vendor product is missing required information");
    }
    this.#assertNonNegativeMoney(input.supplierUnitPriceMinor, "Supplier unit price");
    this.#assertUnits(input.stockOnHand, "Stock on hand");
    this.#assertUnits(input.safetyStock ?? 0, "Safety stock");
    if ((input.safetyStock ?? 0) > input.stockOnHand) throw new Error("Safety stock cannot exceed on-hand stock");
    this.#assertTaxRate(input.supplierTaxRateBps ?? 2400);
    this.#assertCondition(input.condition ?? "new");
    const fulfilmentModes = this.#validatedFulfilmentModes(input.fulfilmentModes ?? ["pickup"]);

    const submission: VendorProductSubmission = {
      id: id("vprod"),
      marketId: input.marketId.trim(),
      vendorId: input.vendorId.trim(),
      locationId: input.locationId.trim(),
      vendorSku: input.vendorSku?.trim() || undefined,
      categoryCode: input.categoryCode.trim(),
      identity: {
        id: id("source-product"),
        title: input.title.trim(),
        brand: input.brand?.trim() || undefined,
        model: input.model?.trim() || undefined,
        mpn: input.mpn?.trim() || undefined,
        gtin: input.gtin?.trim() || undefined,
        condition: input.condition ?? "new",
        warrantyBasis: input.warrantyBasis?.trim() || undefined,
        attributes: structuredClone(input.attributes ?? {})
      },
      supplierUnitPrice: money(input.supplierUnitPriceMinor),
      supplierTaxRateBps: input.supplierTaxRateBps ?? 2400,
      stockOnHand: input.stockOnHand,
      safetyStock: input.safetyStock ?? 0,
      fulfilmentModes,
      adviceAvailable: input.adviceAvailable ?? false,
      source: input.source ?? "manual",
      sourcePayload: input.sourcePayload ? structuredClone(input.sourcePayload) : undefined,
      status: "draft",
      createdAt: input.now,
      updatedAt: input.now
    };
    this.#submissions.set(submission.id, submission);
    this.#record(submission.id, input.vendorId, "vendor_product.created", undefined, "draft", input.now);
    return structuredClone(submission);
  }

  updateDraft(input: {
    submissionId: string;
    vendorId: string;
    patch: Partial<Pick<VendorProductSubmission, "vendorSku" | "categoryCode" | "supplierTaxRateBps" | "stockOnHand" | "safetyStock" | "fulfilmentModes" | "adviceAvailable">> & {
      identity?: Partial<Omit<ProductIdentity, "id">>;
      supplierUnitPriceMinor?: number;
    };
    now: number;
  }): VendorProductSubmission {
    const submission = this.#owned(input.submissionId, input.vendorId);
    if (!(["draft", "needs_review", "linked"] as VendorProductSubmissionStatus[]).includes(submission.status)) {
      throw new Error(`Cannot edit product in ${submission.status} state`);
    }
    if (input.patch.vendorSku !== undefined) submission.vendorSku = input.patch.vendorSku.trim() || undefined;
    if (input.patch.categoryCode !== undefined) {
      if (!input.patch.categoryCode.trim()) throw new Error("Category is required");
      submission.categoryCode = input.patch.categoryCode.trim();
    }
    if (input.patch.supplierUnitPriceMinor !== undefined) {
      this.#assertNonNegativeMoney(input.patch.supplierUnitPriceMinor, "Supplier unit price");
      submission.supplierUnitPrice = money(input.patch.supplierUnitPriceMinor);
    }
    if (input.patch.supplierTaxRateBps !== undefined) {
      this.#assertTaxRate(input.patch.supplierTaxRateBps);
      submission.supplierTaxRateBps = input.patch.supplierTaxRateBps;
    }
    if (input.patch.stockOnHand !== undefined) {
      this.#assertUnits(input.patch.stockOnHand, "Stock on hand");
      submission.stockOnHand = input.patch.stockOnHand;
    }
    if (input.patch.safetyStock !== undefined) {
      this.#assertUnits(input.patch.safetyStock, "Safety stock");
      submission.safetyStock = input.patch.safetyStock;
    }
    if (submission.safetyStock > submission.stockOnHand) throw new Error("Safety stock cannot exceed on-hand stock");
    if (input.patch.fulfilmentModes !== undefined) submission.fulfilmentModes = this.#validatedFulfilmentModes(input.patch.fulfilmentModes);
    if (input.patch.adviceAvailable !== undefined) submission.adviceAvailable = input.patch.adviceAvailable;
    if (input.patch.identity) {
      const patch = input.patch.identity;
      if (patch.condition !== undefined) this.#assertCondition(patch.condition);
      submission.identity = {
        ...submission.identity,
        ...structuredClone(patch),
        title: patch.title !== undefined ? patch.title.trim() : submission.identity.title,
        brand: patch.brand !== undefined ? patch.brand?.trim() || undefined : submission.identity.brand,
        model: patch.model !== undefined ? patch.model?.trim() || undefined : submission.identity.model,
        mpn: patch.mpn !== undefined ? patch.mpn?.trim() || undefined : submission.identity.mpn,
        gtin: patch.gtin !== undefined ? patch.gtin?.trim() || undefined : submission.identity.gtin,
        warrantyBasis: patch.warrantyBasis !== undefined ? patch.warrantyBasis?.trim() || undefined : submission.identity.warrantyBasis,
        attributes: patch.attributes !== undefined ? structuredClone(patch.attributes) : submission.identity.attributes
      };
      if (!submission.identity.title.trim()) throw new Error("Product title is required");
    }
    submission.updatedAt = input.now;
    // Editing identity invalidates previous matching until the merchant submits again.
    if (input.patch.identity || input.patch.categoryCode !== undefined) {
      submission.canonicalVariantId = undefined;
      if (submission.status !== "draft") submission.status = "draft";
      this.#separateActiveCandidates(submission.id);
    }
    this.#record(submission.id, input.vendorId, "vendor_product.updated", undefined, submission.status, input.now);
    return structuredClone(submission);
  }

  submit(input: { submissionId: string; vendorId: string; now: number }): VendorProductSubmission {
    const submission = this.#owned(input.submissionId, input.vendorId);
    if (submission.status === "approved" || submission.status === "archived") throw new Error(`Cannot submit ${submission.status} product`);
    const from = submission.status;
    submission.status = "submitted";
    submission.updatedAt = input.now;

    const candidateProducts = this.canonicals({ marketId: submission.marketId, categoryCode: submission.categoryCode, activeOnly: true });
    const scored = candidateProducts
      .map((product) => ({ product, result: matchProducts(submission.identity, product.identity) }))
      .filter(({ result }) => result.level !== "different")
      .sort((a, b) => b.result.confidence - a.result.confidence);

    // Supersede every prior active match suggestion whenever a source is re-submitted.
    this.#separateActiveCandidates(submission.id);

    const best = scored[0];
    if (best) {
      const candidate: ProductMatchCandidate = {
        id: id("match"),
        submissionId: submission.id,
        vendorId: submission.vendorId,
        candidateCanonicalVariantId: best.product.id,
        result: structuredClone(best.result),
        status: best.result.autoMergeAllowed ? "auto_linked" : "pending",
        createdAt: input.now
      };
      this.#candidates.set(candidate.id, candidate);
      if (best.result.autoMergeAllowed) {
        submission.status = "linked";
        submission.canonicalVariantId = best.product.id;
      } else {
        submission.status = "needs_review";
      }
    } else {
      submission.status = "needs_review";
      submission.canonicalVariantId = undefined;
    }
    this.#record(submission.id, input.vendorId, "vendor_product.submitted", from, submission.status, input.now, submission.canonicalVariantId);
    return structuredClone(submission);
  }

  approveMatch(input: { candidateId: string; actorId: string; reason: string; now: number }): VendorProductSubmission {
    const candidate = this.#requiredCandidate(input.candidateId);
    if (!input.reason.trim()) throw new Error("Match approval reason is required");
    if (!(["pending", "auto_linked"] as MatchCandidateStatus[]).includes(candidate.status)) throw new Error(`Cannot approve ${candidate.status} candidate`);
    const submission = this.#requiredSubmission(candidate.submissionId);
    if (!( ["needs_review", "linked"] as VendorProductSubmissionStatus[]).includes(submission.status)) throw new Error(`Cannot approve a match while product is ${submission.status}`);
    const canonical = this.#canonicals.get(candidate.candidateCanonicalVariantId);
    if (!canonical || !canonical.active || canonical.suppressed || canonical.recalled) throw new Error("Canonical candidate is not publishable");
    const from = submission.status;
    candidate.status = "approved";
    candidate.reviewedBy = input.actorId;
    candidate.reviewedAt = input.now;
    candidate.reviewReason = input.reason.trim();
    this.#separateActiveCandidates(submission.id, candidate.id);
    submission.canonicalVariantId = canonical.id;
    submission.status = "linked";
    submission.updatedAt = input.now;
    this.#record(submission.id, input.actorId, "catalog.match_approved", from, "linked", input.now, canonical.id, input.reason);
    return structuredClone(submission);
  }

  rejectMatch(input: { candidateId: string; actorId: string; reason: string; now: number }): VendorProductSubmission {
    const candidate = this.#requiredCandidate(input.candidateId);
    if (!input.reason.trim()) throw new Error("Match rejection reason is required");
    if (!(["pending", "auto_linked"] as MatchCandidateStatus[]).includes(candidate.status)) throw new Error(`Cannot reject ${candidate.status} candidate`);
    const submission = this.#requiredSubmission(candidate.submissionId);
    const from = submission.status;
    candidate.status = "rejected";
    candidate.reviewedBy = input.actorId;
    candidate.reviewedAt = input.now;
    candidate.reviewReason = input.reason.trim();
    if (submission.canonicalVariantId === candidate.candidateCanonicalVariantId) submission.canonicalVariantId = undefined;
    submission.status = "needs_review";
    submission.updatedAt = input.now;
    this.#record(submission.id, input.actorId, "catalog.match_rejected", from, "needs_review", input.now, undefined, input.reason);
    return structuredClone(submission);
  }

  createCanonicalFromSubmission(input: {
    submissionId: string;
    actorId: string;
    platformPriceMinor: number;
    taxRateBps?: number;
    titleEl?: string;
    titleEn?: string;
    descriptionEl?: string;
    synonyms?: readonly string[];
    reason: string;
    now: number;
  }): CanonicalCatalogProduct {
    const submission = this.#requiredSubmission(input.submissionId);
    if (!input.reason.trim()) throw new Error("Canonical creation reason is required");
    if (submission.canonicalVariantId) throw new Error("Submission is already linked to a canonical product");
    if (!(["submitted", "needs_review", "linked"] as VendorProductSubmissionStatus[]).includes(submission.status)) {
      throw new Error(`Cannot create canonical from ${submission.status} product`);
    }
    this.#assertTaxRate(input.taxRateBps ?? submission.supplierTaxRateBps);
    this.#assertNonNegativeMoney(input.platformPriceMinor, "Platform retail price");
    const canonicalId = id("cv");
    const canonical: CanonicalCatalogProduct = {
      id: canonicalId,
      marketId: submission.marketId,
      categoryCode: submission.categoryCode,
      identity: { ...structuredClone(submission.identity), id: canonicalId },
      titleEl: input.titleEl?.trim() || submission.identity.title,
      titleEn: input.titleEn?.trim() || undefined,
      descriptionEl: input.descriptionEl?.trim() || undefined,
      platformPrice: money(input.platformPriceMinor),
      taxRateBps: input.taxRateBps ?? submission.supplierTaxRateBps,
      synonyms: input.synonyms ? [...input.synonyms] : undefined,
      adviceAvailable: submission.adviceAvailable,
      active: true,
      suppressed: false,
      recalled: false,
      createdAt: input.now,
      updatedAt: input.now
    };
    this.registerCanonical(canonical);
    const from = submission.status;
    submission.canonicalVariantId = canonical.id;
    submission.status = "linked";
    submission.updatedAt = input.now;
    this.#record(submission.id, input.actorId, "catalog.canonical_created", from, "linked", input.now, canonical.id, input.reason);
    return structuredClone(canonical);
  }

  approveOffer(input: { submissionId: string; actorId: string; reason: string; now: number }): VendorProductSubmission {
    const submission = this.#requiredSubmission(input.submissionId);
    if (!input.reason.trim()) throw new Error("Offer approval reason is required");
    if (!submission.canonicalVariantId) throw new Error("Product must be linked to a canonical variant before approval");
    if (!(["linked", "approved"] as VendorProductSubmissionStatus[]).includes(submission.status)) throw new Error(`Cannot approve ${submission.status} product`);
    const canonical = this.#canonicals.get(submission.canonicalVariantId);
    if (!canonical || !canonical.active || canonical.suppressed || canonical.recalled) throw new Error("Linked canonical product is not publishable");
    const from = submission.status;
    submission.status = "approved";
    submission.rejectionReason = undefined;
    submission.updatedAt = input.now;
    this.#record(submission.id, input.actorId, "catalog.offer_approved", from, "approved", input.now, submission.canonicalVariantId, input.reason);
    return structuredClone(submission);
  }

  rejectOffer(input: { submissionId: string; actorId: string; reason: string; now: number }): VendorProductSubmission {
    const submission = this.#requiredSubmission(input.submissionId);
    if (!input.reason.trim()) throw new Error("Offer rejection reason is required");
    const from = submission.status;
    submission.status = "rejected";
    submission.rejectionReason = input.reason.trim();
    submission.updatedAt = input.now;
    this.#record(submission.id, input.actorId, "catalog.offer_rejected", from, "rejected", input.now, submission.canonicalVariantId, input.reason);
    return structuredClone(submission);
  }

  archive(input: { submissionId: string; vendorId: string; now: number }): VendorProductSubmission {
    const submission = this.#owned(input.submissionId, input.vendorId);
    const from = submission.status;
    submission.status = "archived";
    submission.updatedAt = input.now;
    this.#record(submission.id, input.vendorId, "vendor_product.archived", from, "archived", input.now, submission.canonicalVariantId);
    return structuredClone(submission);
  }

  submission(idValue: string): VendorProductSubmission | undefined {
    const value = this.#submissions.get(idValue);
    return value ? structuredClone(value) : undefined;
  }

  submissions(filter: { vendorId?: string; status?: VendorProductSubmissionStatus } = {}): readonly VendorProductSubmission[] {
    return [...this.#submissions.values()]
      .filter((submission) => !filter.vendorId || submission.vendorId === filter.vendorId)
      .filter((submission) => !filter.status || submission.status === filter.status)
      .map((submission) => structuredClone(submission));
  }

  candidates(filter: { submissionId?: string; status?: MatchCandidateStatus } = {}): readonly ProductMatchCandidate[] {
    return [...this.#candidates.values()]
      .filter((candidate) => !filter.submissionId || candidate.submissionId === filter.submissionId)
      .filter((candidate) => !filter.status || candidate.status === filter.status)
      .map((candidate) => structuredClone(candidate));
  }

  events(filter: { submissionId?: string } = {}): readonly CatalogWorkflowEvent[] {
    return this.#events
      .filter((event) => !filter.submissionId || event.submissionId === filter.submissionId)
      .map((event) => structuredClone(event));
  }

  #owned(submissionId: string, vendorId: string): VendorProductSubmission {
    const submission = this.#requiredSubmission(submissionId);
    if (submission.vendorId !== vendorId) throw new Error("Vendor product ownership violation");
    return submission;
  }

  #requiredSubmission(submissionId: string): VendorProductSubmission {
    const submission = this.#submissions.get(submissionId);
    if (!submission) throw new Error("Vendor product not found");
    return submission;
  }

  #requiredCandidate(candidateId: string): ProductMatchCandidate {
    const candidate = this.#candidates.get(candidateId);
    if (!candidate) throw new Error("Product match candidate not found");
    return candidate;
  }

  #record(
    submissionId: string,
    actorId: string,
    action: string,
    fromStatus: VendorProductSubmissionStatus | undefined,
    toStatus: VendorProductSubmissionStatus | undefined,
    createdAt: number,
    canonicalVariantId?: string,
    reason?: string
  ): void {
    this.#events.push(Object.freeze({
      id: id("cat-event"), submissionId, actorId, action, fromStatus, toStatus, canonicalVariantId, reason, createdAt
    }));
  }

  #assertCanonical(product: CanonicalCatalogProduct): void {
    for (const value of [product.id, product.marketId, product.categoryCode, product.identity.title, product.titleEl]) {
      if (!value.trim()) throw new Error("Canonical product is missing required information");
    }
    this.#assertTaxRate(product.taxRateBps);
    this.#assertNonNegativeMoney(product.platformPrice.minor, "Platform retail price");
    this.#assertCondition(product.identity.condition ?? "new");
  }

  #assertNonNegativeMoney(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer in minor units`);
  }

  #assertCondition(value: ProductCondition): void {
    if (!( ["new", "refurbished", "used"] as ProductCondition[]).includes(value)) throw new Error("Condition must be new, refurbished or used");
  }

  #validatedFulfilmentModes(values: readonly CatalogFulfilmentMode[]): CatalogFulfilmentMode[] {
    const modes = [...new Set(values)];
    if (modes.length === 0) throw new Error("At least one fulfilment mode is required");
    const allowed = new Set<CatalogFulfilmentMode>(["pickup", "local_delivery", "shipping"]);
    if (modes.some((mode) => !allowed.has(mode))) throw new Error("Unsupported fulfilment mode");
    return modes;
  }

  #separateActiveCandidates(submissionId: string, exceptCandidateId?: string): void {
    for (const candidate of this.#candidates.values()) {
      if (candidate.submissionId !== submissionId || candidate.id === exceptCandidateId) continue;
      if (candidate.status === "pending" || candidate.status === "auto_linked") candidate.status = "separated";
    }
  }

  #assertTaxRate(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) throw new Error("Tax rate must be integer basis points between 0 and 10000");
  }

  #assertUnits(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  }
}
