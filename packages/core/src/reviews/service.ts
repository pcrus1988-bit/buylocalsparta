import { id } from "../common/ids.ts";
import type { AdviceService } from "../advice/service.ts";
import type { CommerceService } from "../commerce/order-service.ts";
import type {
  PublicReview,
  Review,
  ReviewAggregate,
  ReviewEvent,
  ReviewIncentiveType,
  ReviewReport,
  ReviewReportReason,
  ReviewReportStatus,
  ReviewStatus,
  VendorReviewResponse
} from "./types.ts";

function cleanBody(value: string | undefined, field: string, max: number): string | undefined {
  const cleaned = value?.trim();
  if (!cleaned) return undefined;
  if (cleaned.length > max) throw new Error(`${field} is too long`);
  return cleaned;
}

function assertRating(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 5) throw new Error("Review rating must be an integer from 1 to 5");
}

function incentive(input: { incentiveType?: ReviewIncentiveType; incentiveDetails?: string }): { incentiveType: ReviewIncentiveType; incentiveDetails?: string } {
  const type = input.incentiveType ?? "none";
  const details = cleanBody(input.incentiveDetails, "Incentive disclosure", 500);
  if (type !== "none" && !details) throw new Error("Incentivized reviews require a public disclosure");
  if (type === "none" && details) throw new Error("Incentive details require a non-none incentive type");
  return { incentiveType: type, incentiveDetails: details };
}

export class ReviewService {
  readonly #commerce: CommerceService;
  readonly #advice: AdviceService;
  readonly #reviews = new Map<string, Review>();
  readonly #responses = new Map<string, VendorReviewResponse>();
  readonly #reports = new Map<string, ReviewReport>();
  readonly #events: ReviewEvent[] = [];

  constructor(input: { commerce: CommerceService; advice: AdviceService }) {
    this.#commerce = input.commerce;
    this.#advice = input.advice;
  }

  submitOrderReview(input: {
    marketId: string;
    customerId: string;
    orderId: string;
    orderLineId: string;
    rating: number;
    body?: string;
    incentiveType?: ReviewIncentiveType;
    incentiveDetails?: string;
    now: number;
  }): Review {
    assertRating(input.rating);
    const order = this.#commerce.getOrder(input.orderId);
    if (!order.customerId || order.customerId !== input.customerId) throw new Error("Verified order review requires the customer's own order");
    if (order.marketId !== input.marketId) throw new Error("Order belongs to another market");
    const line = order.lines.find((entry) => entry.id === input.orderLineId);
    if (!line) throw new Error("Order line not found");
    if (line.fulfilledQuantity <= 0) throw new Error("Only fulfilled order lines can be reviewed");
    if ([...this.#reviews.values()].some((review) => review.customerId === input.customerId && review.orderLineId === line.id)) {
      throw new Error("This fulfilled order line already has a review");
    }
    const disclosed = incentive(input);
    const review: Review = {
      id: id("review"), marketId: input.marketId, customerId: input.customerId, vendorId: line.vendorId,
      canonicalVariantId: line.canonicalVariantId, interactionType: "verified_order", orderId: order.id, orderLineId: line.id,
      rating: input.rating, body: cleanBody(input.body, "Review body", 4_000), ...disclosed,
      status: "published", createdAt: input.now, updatedAt: input.now, publishedAt: input.now
    };
    this.#reviews.set(review.id, review);
    this.#event(review.id, input.customerId, "review.published_verified_order", input.now);
    return structuredClone(review);
  }

  submitAdviceReview(input: {
    marketId: string;
    customerId: string;
    conversationId?: string;
    appointmentId?: string;
    rating: number;
    body?: string;
    incentiveType?: ReviewIncentiveType;
    incentiveDetails?: string;
    now: number;
  }): Review {
    assertRating(input.rating);
    if ((input.conversationId ? 1 : 0) + (input.appointmentId ? 1 : 0) !== 1) throw new Error("Verified advice review requires exactly one conversation or appointment");
    let vendorId: string;
    let canonicalVariantId: string;
    let sourceKey: string;

    if (input.conversationId) {
      const conversation = this.#advice.conversation(input.conversationId);
      if (!conversation || conversation.customerId !== input.customerId) throw new Error("Verified advice review requires the customer's own conversation");
      if (conversation.marketId !== input.marketId) throw new Error("Conversation belongs to another market");
      const messages = this.#advice.messages(conversation.id);
      const hasCustomer = messages.some((message) => message.senderType === "customer");
      const hasVendor = messages.some((message) => message.senderType === "vendor");
      if (!hasCustomer || !hasVendor) throw new Error("Advice review requires a verified two-sided conversation");
      vendorId = conversation.vendorId;
      canonicalVariantId = conversation.canonicalVariantId;
      sourceKey = `conversation:${conversation.id}`;
    } else {
      const appointment = this.#advice.appointment(input.appointmentId!);
      if (!appointment || appointment.customerId !== input.customerId) throw new Error("Verified advice review requires the customer's own appointment");
      if (appointment.marketId !== input.marketId) throw new Error("Appointment belongs to another market");
      if (appointment.status !== "completed") throw new Error("Advice appointment must be completed before review");
      if (!appointment.canonicalVariantId) throw new Error("Appointment has no product context for a product review");
      vendorId = appointment.vendorId;
      canonicalVariantId = appointment.canonicalVariantId;
      sourceKey = `appointment:${appointment.id}`;
    }

    if ([...this.#reviews.values()].some((review) => review.customerId === input.customerId && (review.conversationId ? `conversation:${review.conversationId}` : review.appointmentId ? `appointment:${review.appointmentId}` : "") === sourceKey)) {
      throw new Error("This verified advice interaction already has a review");
    }
    const disclosed = incentive(input);
    const review: Review = {
      id: id("review"), marketId: input.marketId, customerId: input.customerId, vendorId, canonicalVariantId,
      interactionType: "verified_advice", conversationId: input.conversationId, appointmentId: input.appointmentId,
      rating: input.rating, body: cleanBody(input.body, "Review body", 4_000), ...disclosed,
      status: "published", createdAt: input.now, updatedAt: input.now, publishedAt: input.now
    };
    this.#reviews.set(review.id, review);
    this.#event(review.id, input.customerId, "review.published_verified_advice", input.now);
    return structuredClone(review);
  }

  respond(input: { reviewId: string; vendorId: string; actorId: string; body: string; now: number }): VendorReviewResponse {
    const review = this.#required(input.reviewId);
    if (review.vendorId !== input.vendorId) throw new Error("Vendor cannot respond to another vendor's review");
    if (review.status === "rejected") throw new Error("Rejected review cannot receive a vendor response");
    const body = cleanBody(input.body, "Review response", 2_000);
    if (!body) throw new Error("Review response body is required");
    const existing = this.#responses.get(review.id);
    const response: VendorReviewResponse = existing
      ? { ...existing, actorId: input.actorId, body, updatedAt: input.now }
      : { id: id("review_response"), reviewId: review.id, vendorId: input.vendorId, actorId: input.actorId, body, createdAt: input.now, updatedAt: input.now };
    this.#responses.set(review.id, response);
    this.#event(review.id, input.actorId, existing ? "review.vendor_response_updated" : "review.vendor_response_created", input.now);
    return structuredClone(response);
  }

  report(input: { reviewId: string; vendorId: string; actorId: string; reason: ReviewReportReason; details: string; now: number }): ReviewReport {
    const review = this.#required(input.reviewId);
    if (review.vendorId !== input.vendorId) throw new Error("Vendor cannot report another vendor's review");
    const details = cleanBody(input.details, "Review report details", 2_000);
    if (!details || details.length < 10) throw new Error("Review report requires a meaningful explanation");
    const open = [...this.#reports.values()].find((report) => report.reviewId === review.id && report.vendorId === input.vendorId && ["open", "under_review"].includes(report.status));
    if (open) throw new Error("This review already has an open vendor report");
    const report: ReviewReport = { id: id("review_report"), reviewId: review.id, vendorId: input.vendorId, reportedBy: input.actorId, reason: input.reason, details, status: "open", createdAt: input.now, updatedAt: input.now };
    this.#reports.set(report.id, report);
    this.#event(review.id, input.actorId, "review.reported_by_vendor", input.now, `${input.reason}: ${details}`);
    return structuredClone(report);
  }

  moderate(input: { reviewId: string; actorId: string; status: ReviewStatus; reason: string; now: number }): Review {
    const review = this.#required(input.reviewId);
    const reason = cleanBody(input.reason, "Moderation reason", 1_000);
    if (!reason || reason.length < 5) throw new Error("Review moderation requires a reason");
    review.status = input.status;
    review.updatedAt = input.now;
    if (input.status === "published" && !review.publishedAt) review.publishedAt = input.now;
    this.#event(review.id, input.actorId, `review.moderated_${input.status}`, input.now, reason);
    return structuredClone(review);
  }

  reviewReport(input: { reportId: string; actorId: string; status: Exclude<ReviewReportStatus, "open">; resolution?: string; now: number }): ReviewReport {
    const report = this.#reports.get(input.reportId);
    if (!report) throw new Error("Review report not found");
    if (["resolved", "rejected"].includes(report.status)) throw new Error("Review report is already closed");
    const resolution = cleanBody(input.resolution, "Review report resolution", 2_000);
    if (["resolved", "rejected"].includes(input.status) && (!resolution || resolution.length < 5)) throw new Error("Closed review reports require a resolution");
    report.status = input.status;
    report.resolution = resolution;
    report.reviewedBy = input.actorId;
    report.updatedAt = input.now;
    this.#event(report.reviewId, input.actorId, `review.report_${input.status}`, input.now, resolution);
    return structuredClone(report);
  }

  publicForProduct(canonicalVariantId: string): readonly PublicReview[] {
    return this.#public([...this.#reviews.values()].filter((review) => review.canonicalVariantId === canonicalVariantId));
  }

  publicForVendor(vendorId: string): readonly PublicReview[] {
    return this.#public([...this.#reviews.values()].filter((review) => review.vendorId === vendorId));
  }

  forCustomer(customerId: string): readonly Review[] {
    return [...this.#reviews.values()].filter((review) => review.customerId === customerId).sort((a, b) => b.createdAt - a.createdAt).map((review) => structuredClone(review));
  }

  forVendor(vendorId: string): readonly Review[] {
    return [...this.#reviews.values()].filter((review) => review.vendorId === vendorId).sort((a, b) => b.createdAt - a.createdAt).map((review) => structuredClone(review));
  }

  reportsForVendor(vendorId: string): readonly ReviewReport[] {
    return [...this.#reports.values()].filter((report) => report.vendorId === vendorId).sort((a, b) => b.createdAt - a.createdAt).map((report) => structuredClone(report));
  }

  reports(): readonly ReviewReport[] {
    return [...this.#reports.values()].sort((a, b) => b.createdAt - a.createdAt).map((report) => structuredClone(report));
  }

  all(): readonly Review[] {
    return [...this.#reviews.values()].sort((a, b) => b.createdAt - a.createdAt).map((review) => structuredClone(review));
  }

  get(reviewId: string): Review | undefined {
    const review = this.#reviews.get(reviewId);
    return review ? structuredClone(review) : undefined;
  }

  reportById(reportId: string): ReviewReport | undefined {
    const report = this.#reports.get(reportId);
    return report ? structuredClone(report) : undefined;
  }

  response(reviewId: string): VendorReviewResponse | undefined {
    const response = this.#responses.get(reviewId);
    return response ? structuredClone(response) : undefined;
  }

  events(reviewId?: string): readonly ReviewEvent[] {
    return this.#events.filter((event) => !reviewId || event.reviewId === reviewId).map((event) => structuredClone(event));
  }

  aggregateForProduct(canonicalVariantId: string): ReviewAggregate {
    return this.#aggregate([...this.#reviews.values()].filter((review) => review.canonicalVariantId === canonicalVariantId));
  }

  aggregateForVendor(vendorId: string): ReviewAggregate {
    return this.#aggregate([...this.#reviews.values()].filter((review) => review.vendorId === vendorId));
  }

  #aggregate(reviews: readonly Review[]): ReviewAggregate {
    const published = reviews.filter((review) => review.status === "published");
    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const review of published) distribution[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
    const averageRating = published.length ? Math.round((published.reduce((sum, review) => sum + review.rating, 0) / published.length) * 10) / 10 : null;
    return { count: published.length, averageRating, distribution: Object.freeze({ ...distribution }) };
  }

  #public(reviews: readonly Review[]): readonly PublicReview[] {
    return reviews.filter((review) => review.status === "published").sort((a, b) => b.createdAt - a.createdAt).map((review) => {
      const { customerId: _customerId, ...safe } = review;
      return {
        ...structuredClone(safe),
        authorLabel: review.interactionType === "verified_order" ? "Verified buyer" : "Verified advice customer",
        response: this.response(review.id)
      } as PublicReview;
    });
  }

  #required(reviewId: string): Review {
    const review = this.#reviews.get(reviewId);
    if (!review) throw new Error("Review not found");
    return review;
  }

  #event(reviewId: string, actorId: string, action: string, createdAt: number, reason?: string): void {
    this.#events.push({ id: id("review_event"), reviewId, actorId, action, reason, createdAt });
  }
}
