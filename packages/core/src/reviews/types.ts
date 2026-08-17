export type ReviewInteractionType = "verified_order" | "verified_advice";
export type ReviewStatus = "published" | "hidden" | "rejected";
export type ReviewIncentiveType = "none" | "discount" | "gift" | "other";

export type Review = {
  id: string;
  marketId: string;
  customerId: string;
  vendorId: string;
  canonicalVariantId: string;
  interactionType: ReviewInteractionType;
  orderId?: string;
  orderLineId?: string;
  conversationId?: string;
  appointmentId?: string;
  rating: number;
  body?: string;
  incentiveType: ReviewIncentiveType;
  incentiveDetails?: string;
  status: ReviewStatus;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
};

export type VendorReviewResponse = {
  id: string;
  reviewId: string;
  vendorId: string;
  actorId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type ReviewReportReason = "not_genuine" | "abusive" | "personal_data" | "conflict_of_interest" | "other";
export type ReviewReportStatus = "open" | "under_review" | "resolved" | "rejected";

export type ReviewReport = {
  id: string;
  reviewId: string;
  vendorId: string;
  reportedBy: string;
  reason: ReviewReportReason;
  details: string;
  status: ReviewReportStatus;
  resolution?: string;
  reviewedBy?: string;
  createdAt: number;
  updatedAt: number;
};

export type ReviewEvent = {
  id: string;
  reviewId: string;
  actorId: string;
  action: string;
  reason?: string;
  createdAt: number;
};

export type ReviewAggregate = {
  count: number;
  averageRating: number | null;
  distribution: Readonly<Record<1 | 2 | 3 | 4 | 5, number>>;
};

export type PublicReview = Omit<Review, "customerId"> & {
  authorLabel: "Verified buyer" | "Verified advice customer";
  response?: VendorReviewResponse;
};
