import type { Money } from "../common/money.ts";
import type { EligibleOffer } from "../fairness/types.ts";

export type ConversationState =
  | "new"
  | "assigned"
  | "active"
  | "waiting_for_customer"
  | "waiting_for_vendor"
  | "offer_sent"
  | "converted"
  | "resolved"
  | "escalated"
  | "closed";

export type Conversation = {
  id: string;
  marketId: string;
  customerId: string;
  canonicalVariantId: string;
  vendorId: string;
  locationId: string;
  state: ConversationState;
  createdAt: number;
  updatedAt: number;
};

export type Message = {
  id: string;
  conversationId: string;
  senderType: "customer" | "vendor" | "platform";
  senderId: string;
  body: string;
  createdAt: number;
  readAt?: number;
};

export type AppointmentChannel = "in_store" | "phone" | "google_meet" | "whatsapp" | "viber";

export type Appointment = {
  id: string;
  marketId: string;
  customerId: string;
  adviserId: string;
  vendorId: string;
  canonicalVariantId?: string;
  channel: AppointmentChannel;
  startsAt: number;
  endsAt: number;
  status: "booked" | "cancelled" | "completed" | "no_show";
  externalProviderId?: string;
  createdAt: number;
};

export type CounterofferNeed = "price" | "availability" | "advice" | "bundle" | "installation" | "delivery";

export type CounterofferRequest = {
  id: string;
  marketId: string;
  customerId: string;
  visitorKey: string;
  canonicalVariantId: string;
  sourceUrl: string;
  quantity: number;
  postcode: string;
  need: CounterofferNeed;
  assignedOfferId: string;
  assignedVendorId: string;
  assignedLocationId: string;
  status: "assigned" | "waiting_vendor" | "needs_customer" | "offered" | "accepted" | "declined" | "expired" | "closed";
  assignedAt: number;
  responseDueAt: number;
  createdAt: number;
};

export type PrivateOffer = {
  id: string;
  requestId: string;
  vendorId: string;
  canonicalVariantId: string;
  price: Money;
  inclusions: string[];
  fulfilmentPromise: string;
  expiresAt: number;
  status: "active" | "accepted" | "declined" | "expired";
  createdAt: number;
};

export type CounterofferAssignmentInput = Readonly<{
  marketId: string;
  customerId: string;
  visitorKey: string;
  canonicalVariantId: string;
  sourceUrl: string;
  quantity: number;
  postcode: string;
  need: CounterofferNeed;
  offers: readonly EligibleOffer[];
  now: number;
  responseSlaMs?: number;
}>;
