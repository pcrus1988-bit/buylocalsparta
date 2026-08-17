export type PersonalizationPreferences = Readonly<{
  userId: string;
  recommendationsEnabled: boolean;
  recentlyViewedEnabled: boolean;
  updatedAt: number;
}>;

export type SavedProduct = Readonly<{
  userId: string;
  canonicalVariantId: string;
  savedAt: number;
}>;

export type SavedVendor = Readonly<{
  userId: string;
  vendorId: string;
  savedAt: number;
}>;

export type RecentlyViewedProduct = Readonly<{
  userId: string;
  canonicalVariantId: string;
  viewedAt: number;
  expiresAt: number;
}>;

export type PrivacyRequestType =
  | "access"
  | "export"
  | "correction"
  | "deletion"
  | "objection"
  | "marketing_withdrawal"
  | "account_closure";

export type PrivacyRequestStatus = "submitted" | "processing" | "completed" | "partially_completed" | "cancelled";

export type PrivacyRetentionItem = Readonly<{
  category: "tax_financial" | "order_fulfilment" | "returns_guarantees" | "fraud_security" | "legal_dispute" | "none";
  retained: boolean;
  reason: string;
  until?: number;
}>;

export type PrivacyRequest = Readonly<{
  id: string;
  userId: string;
  type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  submittedAt: number;
  targetAt: number;
  processingStartedAt?: number;
  completedAt?: number;
  completedBy?: string;
  details?: Readonly<Record<string, unknown>>;
  retention: readonly PrivacyRetentionItem[];
  outcome?: Readonly<Record<string, unknown>>;
}>;

export type CustomerDataExport = Readonly<{
  exportVersion: "1.0";
  generatedAt: number;
  subject: Readonly<{ userId: string; accountStatus: string; email: string }>;
  personalization: Readonly<{
    preferences: PersonalizationPreferences;
    savedProducts: readonly SavedProduct[];
    savedVendors: readonly SavedVendor[];
    recentlyViewed: readonly RecentlyViewedProduct[];
  }>;
  data: Readonly<Record<string, unknown>>;
  retention: readonly PrivacyRetentionItem[];
}>;
