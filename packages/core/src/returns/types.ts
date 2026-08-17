import type { Money } from "../common/money.ts";
import type { FulfilmentMode } from "../fairness/types.ts";

export type ReturnReason = "withdrawal" | "defect" | "nonconformity" | "transit_damage" | "wrong_item" | "missing_part" | "safety_recall" | "other";
export type ReturnDisposition = "sellable" | "blocked";
export type ReturnStatus = "requested" | "approved" | "inspection_required" | "in_transit" | "received" | "inspected" | "remedy_approved" | "refunded" | "replaced" | "closed" | "rejected";
export type ReturnRemedy = "refund" | "replacement" | "repair" | "price_reduction";
export type ReturnEligibilityState = "eligible" | "manual_review" | "ineligible";
export type ReturnSource = "customer" | "safety_recall";
export type ReturnCostPayer = "customer" | "platform" | "vendor";
export type ReturnDestinationType = "vendor" | "platform_inspection" | "repairer";
export type ReturnCustodyParty = "customer" | "carrier" | "vendor" | "platform" | "repairer";

export type ReturnEligibility = Readonly<{
  state: ReturnEligibilityState;
  basis: "withdrawal_window" | "consumer_guarantee" | "delivery_error" | "safety_recall" | "manual_review";
  reason: string;
  expiresAt?: number;
}>;

export type ReturnEvidence = Readonly<{
  id: string;
  kind: "photo" | "document" | "message" | "carrier_proof" | "product_serial" | "other";
  reference?: string;
  note?: string;
  submittedBy: string;
  createdAt: number;
}>;

export type ReturnCustodyEvent = Readonly<{
  id: string;
  from: ReturnCustodyParty;
  to: ReturnCustodyParty;
  actorId: string;
  reference?: string;
  note?: string;
  occurredAt: number;
}>;

export type ReturnAuthorization = Readonly<{
  rmaCode: string;
  destinationType: ReturnDestinationType;
  destinationVendorId?: string;
  instructions: string;
  returnCostPayer: ReturnCostPayer;
  returnByAt?: number;
  carrier?: string;
  trackingNumber?: string;
  issuedAt: number;
  issuedBy: string;
}>;

export type ReplacementRemedy = {
  id: string;
  returnId: string;
  vendorId: string;
  locationId: string;
  offerId: string;
  reservationId: string;
  quantity: number;
  fulfilmentMode: FulfilmentMode;
  status: "awaiting_vendor" | "accepted" | "ready_for_handover" | "shipped" | "delivered" | "rejected" | "cancelled";
  createdAt: number;
  acceptedAt?: number;
  deliveredAt?: number;
  reference?: string;
};

export type RepairRemedy = {
  id: string;
  returnId: string;
  vendorId: string;
  status: "approved" | "in_repair" | "awaiting_part" | "ready_for_customer" | "returned" | "failed";
  dueAt: number;
  createdAt: number;
  startedAt?: number;
  readyAt?: number;
  returnedAt?: number;
  repairerReference?: string;
  findings?: string;
};

export type ReturnCase = {
  id: string;
  orderId: string;
  orderLineId: string;
  customerId: string;
  vendorId: string;
  canonicalVariantId: string;
  quantity: number;
  reason: ReturnReason;
  source: ReturnSource;
  recallNoticeId?: string;
  notes?: string;
  requestedRemedy: ReturnRemedy;
  eligibility: ReturnEligibility;
  status: ReturnStatus;
  requestedAt: number;
  approvedAt?: number;
  receivedAt?: number;
  inspectedAt?: number;
  refundedAt?: number;
  closedAt?: number;
  disposition?: ReturnDisposition;
  inspectionFindings?: string;
  authorization?: ReturnAuthorization;
  evidence: ReturnEvidence[];
  custody: ReturnCustodyEvent[];
  approvedRemedy?: ReturnRemedy;
  priceReduction?: Money;
  replacement?: ReplacementRemedy;
  repair?: RepairRemedy;
  audit: { at: number; actorId: string; action: string; note?: string }[];
};

export type RecallAffectedCase = {
  id: string;
  noticeId: string;
  canonicalVariantId: string;
  orderId: string;
  orderLineId: string;
  customerId?: string;
  vendorId: string;
  affectedQuantity: number;
  status: "identified" | "notified" | "acknowledged" | "remedy_requested" | "resolved";
  identifiedAt: number;
  notifiedAt?: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
  selectedRemedy?: ReturnRemedy;
  returnId?: string;
};
