import { id } from "../common/ids.ts";
import type { Money } from "../common/money.ts";
import { FairVendorExposureEngine } from "../fairness/engine.ts";
import type { EligibleOffer } from "../fairness/types.ts";
import type {
  Appointment,
  AppointmentChannel,
  Conversation,
  CounterofferAssignmentInput,
  CounterofferRequest,
  Message,
  PrivateOffer
} from "./types.ts";

export type AdviceAvailabilityOptions = Readonly<{
  appointmentAllowed?: (input: { vendorId: string; adviserId: string; startsAt: number; endsAt: number }) => boolean;
  responseDeadline?: (locationId: string, openedAt: number, businessMs: number) => number;
}>;

export class AdviceService {
  readonly #fairness: FairVendorExposureEngine;
  readonly #availability: AdviceAvailabilityOptions;
  readonly #conversations = new Map<string, Conversation>();
  readonly #messages = new Map<string, Message[]>();
  readonly #appointments = new Map<string, Appointment>();
  readonly #counteroffers = new Map<string, CounterofferRequest>();
  readonly #privateOffers = new Map<string, PrivateOffer>();

  constructor(fairness: FairVendorExposureEngine, availability: AdviceAvailabilityOptions = {}) {
    this.#fairness = fairness;
    this.#availability = availability;
  }

  startConversation(input: {
    marketId: string;
    customerId: string;
    visitorKey: string;
    canonicalVariantId: string;
    postcode: string;
    offers: readonly EligibleOffer[];
    now: number;
  }): Conversation {
    const assignment = this.#fairness.select(
      {
        marketId: input.marketId,
        canonicalVariantId: input.canonicalVariantId,
        visitorKey: input.visitorKey,
        postcode: input.postcode,
        desiredFulfilment: "pickup",
        reason: "chat",
        now: input.now
      },
      input.offers
    );

    const conversation: Conversation = {
      id: id("conv"),
      marketId: input.marketId,
      customerId: input.customerId,
      canonicalVariantId: input.canonicalVariantId,
      vendorId: assignment.vendorId,
      locationId: assignment.locationId,
      state: "assigned",
      createdAt: input.now,
      updatedAt: input.now
    };
    this.#conversations.set(conversation.id, conversation);
    this.#messages.set(conversation.id, []);
    return structuredClone(conversation);
  }

  sendMessage(input: {
    conversationId: string;
    senderType: Message["senderType"];
    senderId: string;
    body: string;
    now: number;
  }): Message {
    const conversation = this.#requireConversation(input.conversationId);
    const body = input.body.trim();
    if (!body) throw new Error("Message body is required");
    if (body.length > 10_000) throw new Error("Message body is too long");

    const message: Message = {
      id: id("msg"),
      conversationId: conversation.id,
      senderType: input.senderType,
      senderId: input.senderId,
      body,
      createdAt: input.now
    };
    this.#messages.get(conversation.id)?.push(message);
    conversation.state = input.senderType === "customer" ? "waiting_for_vendor" : "waiting_for_customer";
    conversation.updatedAt = input.now;
    return structuredClone(message);
  }

  conversation(id: string): Conversation | undefined {
    const item = this.#conversations.get(id);
    return item ? structuredClone(item) : undefined;
  }

  messages(conversationId: string): readonly Message[] {
    return structuredClone(this.#messages.get(conversationId) ?? []);
  }

  bookAppointment(input: {
    marketId: string;
    customerId: string;
    adviserId: string;
    vendorId: string;
    canonicalVariantId?: string;
    channel: AppointmentChannel;
    startsAt: number;
    endsAt: number;
    now: number;
  }): Appointment {
    if (input.endsAt <= input.startsAt) throw new Error("Appointment end must be after start");
    if (this.#availability.appointmentAllowed && !this.#availability.appointmentAllowed({ vendorId: input.vendorId, adviserId: input.adviserId, startsAt: input.startsAt, endsAt: input.endsAt })) throw new Error("Appointment is outside the local adviser schedule");

    for (const existing of this.#appointments.values()) {
      if (existing.adviserId !== input.adviserId || existing.status !== "booked") continue;
      const overlaps = input.startsAt < existing.endsAt && input.endsAt > existing.startsAt;
      if (overlaps) throw new Error("Appointment conflicts with existing adviser booking");
    }

    const appointment: Appointment = {
      id: id("appt"),
      marketId: input.marketId,
      customerId: input.customerId,
      adviserId: input.adviserId,
      vendorId: input.vendorId,
      canonicalVariantId: input.canonicalVariantId,
      channel: input.channel,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: "booked",
      createdAt: input.now
    };
    this.#appointments.set(appointment.id, appointment);
    return structuredClone(appointment);
  }

  cancelAppointment(id: string): Appointment {
    const appointment = this.#appointments.get(id);
    if (!appointment) throw new Error("Appointment not found");
    appointment.status = "cancelled";
    return structuredClone(appointment);
  }

  completeAppointment(id: string, now = Date.now()): Appointment {
    const appointment = this.#appointments.get(id);
    if (!appointment) throw new Error("Appointment not found");
    if (appointment.status !== "booked") throw new Error(`Cannot complete appointment in ${appointment.status}`);
    if (now < appointment.startsAt) throw new Error("Appointment cannot be completed before it starts");
    appointment.status = "completed";
    return structuredClone(appointment);
  }

  appointment(id: string): Appointment | undefined {
    const appointment = this.#appointments.get(id);
    return appointment ? structuredClone(appointment) : undefined;
  }

  requestCounteroffer(input: CounterofferAssignmentInput): CounterofferRequest {
    this.#assertSafeHttpUrl(input.sourceUrl);
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be a positive integer");

    const assignment = this.#fairness.select(
      {
        marketId: input.marketId,
        canonicalVariantId: input.canonicalVariantId,
        visitorKey: input.visitorKey,
        postcode: input.postcode,
        desiredFulfilment: "shipping",
        reason: "counteroffer",
        now: input.now
      },
      input.offers
    );

    const responseSlaMs = input.responseSlaMs ?? 24 * 60 * 60 * 1000;
    const request: CounterofferRequest = {
      id: id("cor"),
      marketId: input.marketId,
      customerId: input.customerId,
      visitorKey: input.visitorKey,
      canonicalVariantId: input.canonicalVariantId,
      sourceUrl: input.sourceUrl,
      quantity: input.quantity,
      postcode: input.postcode,
      need: input.need,
      assignedOfferId: assignment.offerId,
      assignedVendorId: assignment.vendorId,
      assignedLocationId: assignment.locationId,
      status: "waiting_vendor",
      assignedAt: input.now,
      responseDueAt: this.#availability.responseDeadline ? this.#availability.responseDeadline(assignment.locationId, input.now, responseSlaMs) : input.now + responseSlaMs,
      createdAt: input.now
    };
    this.#counteroffers.set(request.id, request);
    return structuredClone(request);
  }

  rerouteExpiredCounteroffer(requestId: string, offers: readonly EligibleOffer[], now: number): CounterofferRequest {
    const request = this.#requireCounteroffer(requestId);
    if (request.status !== "waiting_vendor") throw new Error("Counteroffer is not awaiting a vendor");
    if (now < request.responseDueAt) throw new Error("Counteroffer SLA has not expired");

    const previousOfferId = request.assignedOfferId;
    const rescueOffers = offers.filter((offer) => offer.offerId !== previousOfferId);
    if (rescueOffers.length === 0) {
      request.status = "expired";
      return structuredClone(request);
    }

    this.#fairness.releaseSticky({
      marketId: request.marketId,
      canonicalVariantId: request.canonicalVariantId,
      visitorKey: request.visitorKey,
      postcode: request.postcode
    });

    const assignment = this.#fairness.select(
      {
        marketId: request.marketId,
        canonicalVariantId: request.canonicalVariantId,
        visitorKey: request.visitorKey,
        postcode: request.postcode,
        desiredFulfilment: "shipping",
        reason: "counteroffer",
        now
      },
      rescueOffers
    );

    request.assignedOfferId = assignment.offerId;
    request.assignedVendorId = assignment.vendorId;
    request.assignedLocationId = assignment.locationId;
    request.assignedAt = now;
    request.responseDueAt = this.#availability.responseDeadline ? this.#availability.responseDeadline(assignment.locationId, now, 24 * 60 * 60 * 1000) : now + 24 * 60 * 60 * 1000;
    return structuredClone(request);
  }

  makePrivateOffer(input: {
    requestId: string;
    vendorId: string;
    price: Money;
    inclusions?: string[];
    fulfilmentPromise: string;
    expiresAt: number;
    now: number;
  }): PrivateOffer {
    const request = this.#requireCounteroffer(input.requestId);
    if (request.status !== "waiting_vendor" && request.status !== "needs_customer") throw new Error("Counteroffer cannot receive an offer in current state");
    if (request.assignedVendorId !== input.vendorId) throw new Error("Only the assigned vendor may respond");
    if (input.expiresAt <= input.now) throw new Error("Private offer expiry must be in the future");

    const offer: PrivateOffer = {
      id: id("poffer"),
      requestId: request.id,
      vendorId: input.vendorId,
      canonicalVariantId: request.canonicalVariantId,
      price: input.price,
      inclusions: [...(input.inclusions ?? [])],
      fulfilmentPromise: input.fulfilmentPromise,
      expiresAt: input.expiresAt,
      status: "active",
      createdAt: input.now
    };
    request.status = "offered";
    this.#privateOffers.set(offer.id, offer);
    return structuredClone(offer);
  }

  acceptPrivateOffer(offerId: string, now: number): PrivateOffer {
    const offer = this.#privateOffers.get(offerId);
    if (!offer) throw new Error("Private offer not found");
    if (offer.status !== "active") throw new Error("Private offer is no longer active");
    if (offer.expiresAt <= now) {
      offer.status = "expired";
      const request = this.#requireCounteroffer(offer.requestId);
      request.status = "expired";
      throw new Error("Private offer has expired");
    }
    offer.status = "accepted";
    const request = this.#requireCounteroffer(offer.requestId);
    request.status = "accepted";
    return structuredClone(offer);
  }

  conversationsForVendor(vendorId: string): readonly Conversation[] {
    return [...this.#conversations.values()].filter((item) => item.vendorId === vendorId).map((item) => structuredClone(item));
  }

  conversationsForCustomer(customerId: string): readonly Conversation[] {
    return [...this.#conversations.values()].filter((item) => item.customerId === customerId).map((item) => structuredClone(item));
  }

  appointmentsForVendor(vendorId: string): readonly Appointment[] {
    return [...this.#appointments.values()].filter((item) => item.vendorId === vendorId).map((item) => structuredClone(item));
  }

  appointmentsForCustomer(customerId: string): readonly Appointment[] {
    return [...this.#appointments.values()].filter((item) => item.customerId === customerId).map((item) => structuredClone(item));
  }

  counteroffersForVendor(vendorId: string): readonly CounterofferRequest[] {
    return [...this.#counteroffers.values()].filter((item) => item.assignedVendorId === vendorId).map((item) => structuredClone(item));
  }

  counteroffersForCustomer(customerId: string): readonly CounterofferRequest[] {
    return [...this.#counteroffers.values()].filter((item) => item.customerId === customerId).map((item) => structuredClone(item));
  }

  privateOffersForVendor(vendorId: string): readonly PrivateOffer[] {
    return [...this.#privateOffers.values()].filter((item) => item.vendorId === vendorId).map((item) => structuredClone(item));
  }

  privateOffersForCustomer(customerId: string): readonly PrivateOffer[] {
    const requestIds = new Set([...this.#counteroffers.values()].filter((item) => item.customerId === customerId).map((item) => item.id));
    return [...this.#privateOffers.values()].filter((item) => requestIds.has(item.requestId)).map((item) => structuredClone(item));
  }

  counteroffer(id: string): CounterofferRequest | undefined {
    const item = this.#counteroffers.get(id);
    return item ? structuredClone(item) : undefined;
  }

  privateOffer(id: string): PrivateOffer | undefined {
    const item = this.#privateOffers.get(id);
    return item ? structuredClone(item) : undefined;
  }

  #requireConversation(id: string): Conversation {
    const conversation = this.#conversations.get(id);
    if (!conversation) throw new Error("Conversation not found");
    return conversation;
  }

  #requireCounteroffer(id: string): CounterofferRequest {
    const request = this.#counteroffers.get(id);
    if (!request) throw new Error("Counteroffer request not found");
    return request;
  }

  #assertSafeHttpUrl(value: string): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Counteroffer source URL is invalid");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Only HTTP(S) counteroffer URLs are allowed");
    if (parsed.username || parsed.password) throw new Error("Credential-bearing URLs are not allowed");
  }
}
