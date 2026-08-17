import { id } from "../common/ids.ts";
import type { Money } from "../common/money.ts";
import { money } from "../common/money.ts";
import type { CommerceService } from "../commerce/order-service.ts";

export type ShipmentStatus = "created" | "label_ready" | "handed_to_carrier" | "in_transit" | "delivered" | "exception" | "lost" | "returned" | "cancelled";

export type ShippingQuote = Readonly<{
  carrier: string;
  service: string;
  amount: Money;
  estimatedBusinessDays: number;
}>;

export type ShippingLabel = Readonly<{
  providerShipmentId: string;
  carrier: string;
  service: string;
  trackingNumber: string;
  labelObjectKey: string;
}>;

export interface ShippingProvider {
  quote(input: { fromPostcode: string; toPostcode: string; packageCount: number }): ShippingQuote;
  createLabel(input: { shipmentId: string; fromPostcode: string; toPostcode: string; packageCount: number; service?: string }): ShippingLabel;
}

export type ShipmentRecord = {
  id: string;
  orderId: string;
  fulfilmentId: string;
  vendorId: string;
  locationId: string;
  fromPostcode: string;
  toPostcode: string;
  packageCount: number;
  carrier?: string;
  service?: string;
  trackingNumber?: string;
  providerShipmentId?: string;
  labelObjectKey?: string;
  status: ShipmentStatus;
  quotedAmount?: Money;
  createdAt: number;
  handedOverAt?: number;
  deliveredAt?: number;
  updatedAt: number;
  exceptionReason?: string;
  proof?: Readonly<Record<string, unknown>>;
};

export class DevCourierProvider implements ShippingProvider {
  quote(input: { fromPostcode: string; toPostcode: string; packageCount: number }): ShippingQuote {
    if (!/^\d{5}$/.test(input.fromPostcode) || !/^\d{5}$/.test(input.toPostcode)) throw new Error("Greek shipping postcodes must be five digits in the development provider");
    if (!Number.isSafeInteger(input.packageCount) || input.packageCount <= 0) throw new Error("Package count must be a positive integer");
    const local = input.fromPostcode.slice(0, 3) === input.toPostcode.slice(0, 3);
    return {
      carrier: "dev-courier",
      service: local ? "local-standard" : "greece-standard",
      amount: money((local ? 450 : 690) + Math.max(0, input.packageCount - 1) * 150),
      estimatedBusinessDays: local ? 1 : 3
    };
  }

  createLabel(input: { shipmentId: string; fromPostcode: string; toPostcode: string; packageCount: number; service?: string }): ShippingLabel {
    const quote = this.quote({ fromPostcode: input.fromPostcode, toPostcode: input.toPostcode, packageCount: input.packageCount });
    return {
      providerShipmentId: `dev-shp-${input.shipmentId}`,
      carrier: quote.carrier,
      service: input.service ?? quote.service,
      trackingNumber: `DEV${input.shipmentId.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`,
      labelObjectKey: `shipping-labels/${input.shipmentId}.pdf`
    };
  }
}

export class ShippingService {
  readonly #commerce: CommerceService;
  readonly #provider: ShippingProvider;
  readonly #shipments = new Map<string, ShipmentRecord>();
  readonly #providerEventIds = new Set<string>();

  constructor(input: { commerce: CommerceService; provider: ShippingProvider }) {
    this.#commerce = input.commerce;
    this.#provider = input.provider;
  }

  quote(input: { fromPostcode: string; toPostcode: string; packageCount?: number }): ShippingQuote {
    return this.#provider.quote({ ...input, packageCount: input.packageCount ?? 1 });
  }

  create(input: { orderId: string; fulfilmentId: string; vendorId: string; fromPostcode: string; packageCount?: number; now: number }): ShipmentRecord {
    const order = this.#commerce.getOrder(input.orderId);
    if (order.fulfilmentMode !== "shipping") throw new Error("Shipment can only be created for shipping orders");
    const fulfilment = order.fulfilments.find((item) => item.id === input.fulfilmentId);
    if (!fulfilment) throw new Error("Fulfilment not found");
    if (fulfilment.vendorId !== input.vendorId) throw new Error("Only the assigned vendor can create this shipment");
    if (!new Set(["accepted", "picking", "packed"]).has(fulfilment.status)) throw new Error(`Cannot create shipment while fulfilment is ${fulfilment.status}`);
    const existing = [...this.#shipments.values()].find((item) => item.fulfilmentId === input.fulfilmentId && item.status !== "cancelled");
    if (existing) return structuredClone(existing);
    const packageCount = input.packageCount ?? 1;
    const quote = this.#provider.quote({ fromPostcode: input.fromPostcode, toPostcode: order.postcode, packageCount });
    const shipment: ShipmentRecord = {
      id: id("shipment"),
      orderId: order.id,
      fulfilmentId: fulfilment.id,
      vendorId: fulfilment.vendorId,
      locationId: fulfilment.locationId,
      fromPostcode: input.fromPostcode,
      toPostcode: order.postcode,
      packageCount,
      status: "created",
      quotedAmount: quote.amount,
      carrier: quote.carrier,
      service: quote.service,
      createdAt: input.now,
      updatedAt: input.now
    };
    this.#shipments.set(shipment.id, shipment);
    return structuredClone(shipment);
  }

  createLabel(input: { shipmentId: string; vendorId: string; now: number }): ShipmentRecord {
    const shipment = this.#required(input.shipmentId);
    this.#assertVendor(shipment, input.vendorId);
    if (shipment.status === "label_ready") return structuredClone(shipment);
    if (shipment.status !== "created") throw new Error(`Cannot create label while shipment is ${shipment.status}`);
    const label = this.#provider.createLabel({
      shipmentId: shipment.id,
      fromPostcode: shipment.fromPostcode,
      toPostcode: shipment.toPostcode,
      packageCount: shipment.packageCount,
      service: shipment.service
    });
    Object.assign(shipment, {
      providerShipmentId: label.providerShipmentId,
      carrier: label.carrier,
      service: label.service,
      trackingNumber: label.trackingNumber,
      labelObjectKey: label.labelObjectKey,
      status: "label_ready" as ShipmentStatus,
      updatedAt: input.now
    });
    return structuredClone(shipment);
  }

  handToCarrier(input: { shipmentId: string; vendorId: string; now: number }): ShipmentRecord {
    const shipment = this.#required(input.shipmentId);
    this.#assertVendor(shipment, input.vendorId);
    if (shipment.status === "handed_to_carrier" || shipment.status === "in_transit") return structuredClone(shipment);
    if (shipment.status !== "label_ready") throw new Error(`Cannot hand over shipment while it is ${shipment.status}`);
    shipment.status = "handed_to_carrier";
    shipment.handedOverAt = input.now;
    shipment.updatedAt = input.now;
    this.#commerce.markShipped(shipment.orderId, shipment.fulfilmentId);
    return structuredClone(shipment);
  }

  processProviderEvent(input: { providerEventId: string; shipmentId: string; status: "in_transit" | "delivered" | "exception" | "lost" | "returned"; reason?: string; proof?: Readonly<Record<string, unknown>>; now: number }): { duplicate: boolean; shipment: ShipmentRecord } {
    if (!input.providerEventId.trim()) throw new Error("Provider event id is required");
    const shipment = this.#required(input.shipmentId);
    if (this.#providerEventIds.has(input.providerEventId)) return { duplicate: true, shipment: structuredClone(shipment) };
    if (shipment.status === "cancelled") throw new Error("Cancelled shipment cannot accept carrier events");
    const allowed: Record<typeof input.status, readonly ShipmentStatus[]> = {
      in_transit: ["handed_to_carrier", "in_transit", "exception"],
      delivered: ["handed_to_carrier", "in_transit", "exception", "delivered"],
      exception: ["handed_to_carrier", "in_transit", "exception"],
      lost: ["handed_to_carrier", "in_transit", "exception", "lost"],
      returned: ["handed_to_carrier", "in_transit", "exception", "delivered", "returned"]
    };
    if (!allowed[input.status].includes(shipment.status)) throw new Error(`Carrier status ${input.status} is invalid while shipment is ${shipment.status}`);

    // Complete the commerce transition before recording provider idempotency so a failed
    // transition can be retried safely rather than becoming an unrecoverable "duplicate".
    if (input.status === "delivered" && shipment.status !== "delivered") this.#commerce.markDelivered(shipment.orderId, shipment.fulfilmentId, input.now);

    shipment.status = input.status;
    shipment.updatedAt = input.now;
    shipment.exceptionReason = input.status === "exception" || input.status === "lost" ? input.reason?.trim() || input.status : undefined;
    shipment.proof = input.proof ? structuredClone(input.proof) : shipment.proof;
    if (input.status === "delivered") shipment.deliveredAt ??= input.now;
    this.#providerEventIds.add(input.providerEventId);
    return { duplicate: false, shipment: structuredClone(shipment) };
  }

  cancel(input: { shipmentId: string; vendorId: string; now: number }): ShipmentRecord {
    const shipment = this.#required(input.shipmentId);
    this.#assertVendor(shipment, input.vendorId);
    if (new Set<ShipmentStatus>(["handed_to_carrier", "in_transit", "delivered", "lost", "returned"]).has(shipment.status)) throw new Error(`Cannot cancel shipment in ${shipment.status}`);
    shipment.status = "cancelled";
    shipment.updatedAt = input.now;
    return structuredClone(shipment);
  }

  forVendor(vendorId: string): readonly ShipmentRecord[] {
    return [...this.#shipments.values()].filter((item) => item.vendorId === vendorId).map((item) => structuredClone(item));
  }

  forOrder(orderId: string): readonly ShipmentRecord[] {
    return [...this.#shipments.values()].filter((item) => item.orderId === orderId).map((item) => structuredClone(item));
  }

  all(): readonly ShipmentRecord[] {
    return [...this.#shipments.values()].map((item) => structuredClone(item));
  }

  get(shipmentId: string): ShipmentRecord {
    return structuredClone(this.#required(shipmentId));
  }

  #required(shipmentId: string): ShipmentRecord {
    const shipment = this.#shipments.get(shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    return shipment;
  }

  #assertVendor(shipment: ShipmentRecord, vendorId: string): void {
    if (shipment.vendorId !== vendorId) throw new Error("Only the assigned vendor can access this shipment");
  }
}
