import { id } from "../common/ids.ts";
import type {
  CustomerDataExport,
  PersonalizationPreferences,
  PrivacyRequest,
  PrivacyRequestStatus,
  PrivacyRequestType,
  PrivacyRetentionItem,
  RecentlyViewedProduct,
  SavedProduct,
  SavedVendor
} from "./types.ts";

const DAY = 24 * 60 * 60 * 1000;

export class CustomerPersonalizationService {
  readonly #preferences = new Map<string, PersonalizationPreferences>();
  readonly #savedProducts = new Map<string, SavedProduct>();
  readonly #savedVendors = new Map<string, SavedVendor>();
  readonly #recentlyViewed = new Map<string, RecentlyViewedProduct>();
  readonly #recentTtlMs: number;
  readonly #recentLimit: number;

  constructor(options: { recentTtlMs?: number; recentLimit?: number } = {}) {
    this.#recentTtlMs = options.recentTtlMs ?? 90 * DAY;
    this.#recentLimit = options.recentLimit ?? 50;
  }

  preferences(userId: string, now = Date.now()): PersonalizationPreferences {
    const existing = this.#preferences.get(userId);
    if (existing) return structuredClone(existing);
    const item: PersonalizationPreferences = { userId, recommendationsEnabled: true, recentlyViewedEnabled: true, updatedAt: now };
    this.#preferences.set(userId, item);
    return structuredClone(item);
  }

  updatePreferences(input: { userId: string; recommendationsEnabled?: boolean; recentlyViewedEnabled?: boolean; now: number }): PersonalizationPreferences {
    const current = this.preferences(input.userId, input.now);
    const next: PersonalizationPreferences = {
      userId: input.userId,
      recommendationsEnabled: input.recommendationsEnabled ?? current.recommendationsEnabled,
      recentlyViewedEnabled: input.recentlyViewedEnabled ?? current.recentlyViewedEnabled,
      updatedAt: input.now
    };
    this.#preferences.set(input.userId, next);
    if (!next.recentlyViewedEnabled) this.clearRecentlyViewed(input.userId);
    return structuredClone(next);
  }

  saveProduct(userId: string, canonicalVariantId: string, now: number): SavedProduct {
    if (!userId.trim() || !canonicalVariantId.trim()) throw new Error("User and canonical product are required");
    const key = `${userId}:${canonicalVariantId}`;
    const item = this.#savedProducts.get(key) ?? { userId, canonicalVariantId, savedAt: now };
    this.#savedProducts.set(key, item);
    return structuredClone(item);
  }

  unsaveProduct(userId: string, canonicalVariantId: string): boolean {
    return this.#savedProducts.delete(`${userId}:${canonicalVariantId}`);
  }

  savedProducts(userId: string): readonly SavedProduct[] {
    return structuredClone([...this.#savedProducts.values()].filter((item) => item.userId === userId).sort((a, b) => b.savedAt - a.savedAt));
  }

  saveVendor(userId: string, vendorId: string, now: number): SavedVendor {
    if (!userId.trim() || !vendorId.trim()) throw new Error("User and vendor are required");
    const key = `${userId}:${vendorId}`;
    const item = this.#savedVendors.get(key) ?? { userId, vendorId, savedAt: now };
    this.#savedVendors.set(key, item);
    return structuredClone(item);
  }

  unsaveVendor(userId: string, vendorId: string): boolean {
    return this.#savedVendors.delete(`${userId}:${vendorId}`);
  }

  savedVendors(userId: string): readonly SavedVendor[] {
    return structuredClone([...this.#savedVendors.values()].filter((item) => item.userId === userId).sort((a, b) => b.savedAt - a.savedAt));
  }

  recordView(userId: string, canonicalVariantId: string, now: number): RecentlyViewedProduct | undefined {
    if (!this.preferences(userId, now).recentlyViewedEnabled) return undefined;
    const key = `${userId}:${canonicalVariantId}`;
    const item: RecentlyViewedProduct = { userId, canonicalVariantId, viewedAt: now, expiresAt: now + this.#recentTtlMs };
    this.#recentlyViewed.set(key, item);
    const all = [...this.#recentlyViewed.entries()]
      .filter(([, value]) => value.userId === userId)
      .sort((a, b) => b[1].viewedAt - a[1].viewedAt);
    for (const [oldKey] of all.slice(this.#recentLimit)) this.#recentlyViewed.delete(oldKey);
    return structuredClone(item);
  }

  recentlyViewed(userId: string, now: number): readonly RecentlyViewedProduct[] {
    this.purgeExpired(now);
    return structuredClone([...this.#recentlyViewed.values()].filter((item) => item.userId === userId).sort((a, b) => b.viewedAt - a.viewedAt));
  }

  clearRecentlyViewed(userId: string): number {
    let removed = 0;
    for (const [key, item] of this.#recentlyViewed) if (item.userId === userId) { this.#recentlyViewed.delete(key); removed += 1; }
    return removed;
  }

  clearAll(userId: string): { savedProducts: number; savedVendors: number; recentlyViewed: number } {
    let savedProducts = 0;
    let savedVendors = 0;
    for (const [key, item] of this.#savedProducts) if (item.userId === userId) { this.#savedProducts.delete(key); savedProducts += 1; }
    for (const [key, item] of this.#savedVendors) if (item.userId === userId) { this.#savedVendors.delete(key); savedVendors += 1; }
    const recentlyViewed = this.clearRecentlyViewed(userId);
    this.#preferences.delete(userId);
    return { savedProducts, savedVendors, recentlyViewed };
  }

  eraseNonEssential(userId: string, now: number): { savedProducts: number; savedVendors: number; recentlyViewed: number; preferences: PersonalizationPreferences } {
    const erased = this.clearAll(userId);
    const preferences: PersonalizationPreferences = { userId, recommendationsEnabled: false, recentlyViewedEnabled: false, updatedAt: now };
    this.#preferences.set(userId, preferences);
    return { ...erased, preferences: structuredClone(preferences) };
  }

  purgeExpired(now: number): number {
    let removed = 0;
    for (const [key, item] of this.#recentlyViewed) if (item.expiresAt <= now) { this.#recentlyViewed.delete(key); removed += 1; }
    return removed;
  }
}

export class PrivacyRequestService {
  readonly #requests = new Map<string, PrivacyRequest>();
  readonly #responseTargetMs: number;

  constructor(options: { responseTargetMs?: number } = {}) {
    this.#responseTargetMs = options.responseTargetMs ?? 30 * DAY;
  }

  submit(input: { userId: string; type: PrivacyRequestType; now: number; details?: Readonly<Record<string, unknown>> }): PrivacyRequest {
    const duplicate = [...this.#requests.values()].find((item) => item.userId === input.userId && item.type === input.type && ["submitted", "processing"].includes(item.status));
    if (duplicate) return structuredClone(duplicate);
    const item: PrivacyRequest = {
      id: id("privacy"),
      userId: input.userId,
      type: input.type,
      status: "submitted",
      submittedAt: input.now,
      targetAt: input.now + this.#responseTargetMs,
      details: input.details ? structuredClone(input.details) : undefined,
      retention: []
    };
    this.#requests.set(item.id, item);
    return structuredClone(item);
  }

  start(input: { requestId: string; actorId: string; now: number }): PrivacyRequest {
    const current = this.#required(input.requestId);
    if (current.status !== "submitted") throw new Error("Privacy request cannot enter processing from its current state");
    return this.#replace(current, { status: "processing", processingStartedAt: input.now, outcome: { processingActor: input.actorId } });
  }

  complete(input: {
    requestId: string;
    actorId: string;
    now: number;
    status?: Extract<PrivacyRequestStatus, "completed" | "partially_completed">;
    retention?: readonly PrivacyRetentionItem[];
    outcome?: Readonly<Record<string, unknown>>;
  }): PrivacyRequest {
    const current = this.#required(input.requestId);
    if (!["submitted", "processing"].includes(current.status)) throw new Error("Privacy request is already terminal");
    const retention = structuredClone(input.retention ?? []);
    const status = input.status ?? (retention.some((item) => item.retained) ? "partially_completed" : "completed");
    return this.#replace(current, { status, completedAt: input.now, completedBy: input.actorId, retention, outcome: input.outcome ? structuredClone(input.outcome) : undefined });
  }

  cancel(input: { requestId: string; userId: string; now: number }): PrivacyRequest {
    const current = this.#required(input.requestId);
    if (current.userId !== input.userId) throw new Error("Privacy request ownership violation");
    if (current.status !== "submitted") throw new Error("Only a submitted privacy request can be cancelled");
    return this.#replace(current, { status: "cancelled", completedAt: input.now, completedBy: input.userId });
  }

  forUser(userId: string): readonly PrivacyRequest[] {
    return structuredClone([...this.#requests.values()].filter((item) => item.userId === userId).sort((a, b) => b.submittedAt - a.submittedAt));
  }

  all(): readonly PrivacyRequest[] {
    return structuredClone([...this.#requests.values()].sort((a, b) => b.submittedAt - a.submittedAt));
  }

  get(requestId: string): PrivacyRequest | undefined {
    const item = this.#requests.get(requestId);
    return item ? structuredClone(item) : undefined;
  }

  buildExport(input: {
    now: number;
    subject: CustomerDataExport["subject"];
    personalization: CustomerDataExport["personalization"];
    data: Readonly<Record<string, unknown>>;
    retention: readonly PrivacyRetentionItem[];
  }): CustomerDataExport {
    return Object.freeze({ exportVersion: "1.0", generatedAt: input.now, subject: structuredClone(input.subject), personalization: structuredClone(input.personalization), data: structuredClone(input.data), retention: structuredClone(input.retention) });
  }

  #required(requestId: string): PrivacyRequest {
    const item = this.#requests.get(requestId);
    if (!item) throw new Error("Privacy request not found");
    return item;
  }

  #replace(current: PrivacyRequest, patch: Partial<PrivacyRequest>): PrivacyRequest {
    const next: PrivacyRequest = Object.freeze({ ...current, ...patch });
    this.#requests.set(current.id, next);
    return structuredClone(next);
  }
}

export function defaultCustomerRetentionSnapshot(now: number): readonly PrivacyRetentionItem[] {
  return [
    { category: "tax_financial", retained: true, reason: "Customer tax, payment and accounting records may remain subject to statutory/business record-retention requirements; production retention duration requires Greek accountant/legal confirmation." },
    { category: "order_fulfilment", retained: true, reason: "Order and fulfilment evidence may be retained for outstanding obligations, support and dispute handling." },
    { category: "returns_guarantees", retained: true, reason: "Return, guarantee and product-safety history may remain necessary while consumer/product obligations are open." },
    { category: "fraud_security", retained: true, reason: "Minimal security evidence may be retained for abuse prevention under the configured security-retention policy.", until: now + 90 * DAY }
  ];
}
