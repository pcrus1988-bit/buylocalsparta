import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { id } from "../common/ids.ts";
import { CommerceService } from "../commerce/order-service.ts";

export type PickupCredentialStatus = "ready" | "collected" | "expired" | "locked" | "cancelled";

export type PickupCredential = Readonly<{
  id: string;
  orderId: string;
  fulfilmentId: string;
  vendorId: string;
  customerId?: string;
  status: PickupCredentialStatus;
  readyAt: number;
  expiresAt: number;
  failedAttempts: number;
  maxAttempts: number;
  collectedAt?: number;
  shortCode: string;
  qrToken: string;
}>;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type StoredPickupCredential = Omit<Mutable<PickupCredential>, "shortCode" | "qrToken"> & { nonce: string };

export class PickupService {
  readonly #commerce: CommerceService;
  readonly #secret: string;
  readonly #credentials = new Map<string, StoredPickupCredential>();
  readonly #fulfilmentIndex = new Map<string, string>();

  constructor(input: { commerce: CommerceService; secret: string }) {
    if (input.secret.length < 32) throw new Error("Pickup signing secret must contain at least 32 characters");
    this.#commerce = input.commerce;
    this.#secret = input.secret;
  }

  markReady(input: {
    orderId: string;
    fulfilmentId: string;
    vendorId: string;
    customerId?: string;
    now: number;
    ttlMs?: number;
    maxAttempts?: number;
  }): PickupCredential {
    const order = this.#commerce.getOrder(input.orderId);
    if (order.fulfilmentMode !== "pickup") throw new Error("Pickup credential can only be issued for pickup fulfilment");
    const fulfilment = order.fulfilments.find((item) => item.id === input.fulfilmentId);
    if (!fulfilment) throw new Error("Fulfilment not found");
    if (fulfilment.vendorId !== input.vendorId) throw new Error("Only the assigned vendor can prepare this pickup");
    const existingId = this.#fulfilmentIndex.get(input.fulfilmentId);
    if (existingId) {
      const existing = this.#required(existingId);
      this.#refreshExpiry(existing, input.now);
      if (existing.status === "ready") return this.#public(existing);
      if (existing.status === "collected") return this.#public(existing);
    }

    this.#commerce.markReadyForHandover(input.orderId, input.fulfilmentId);
    const credential: StoredPickupCredential = {
      id: id("pickup"),
      orderId: input.orderId,
      fulfilmentId: input.fulfilmentId,
      vendorId: input.vendorId,
      customerId: input.customerId,
      status: "ready",
      readyAt: input.now,
      expiresAt: input.now + (input.ttlMs ?? 48 * 60 * 60 * 1000),
      failedAttempts: 0,
      maxAttempts: input.maxAttempts ?? 8,
      nonce: randomBytes(16).toString("hex")
    };
    if (credential.maxAttempts < 3 || credential.maxAttempts > 20) throw new Error("Pickup max attempts must be between 3 and 20");
    this.#credentials.set(credential.id, credential);
    this.#fulfilmentIndex.set(input.fulfilmentId, credential.id);
    return this.#public(credential);
  }

  verifyAndCollect(input: { pickupId: string; vendorId: string; proof: string; now: number }): PickupCredential {
    const credential = this.#required(input.pickupId);
    this.#refreshExpiry(credential, input.now);
    if (credential.vendorId !== input.vendorId) throw new Error("Pickup vendor isolation violation");
    if (credential.status === "collected") return this.#public(credential);
    if (credential.status !== "ready") throw new Error(`Pickup is ${credential.status}`);

    if (!this.#validProof(credential, input.proof.trim())) {
      credential.failedAttempts += 1;
      if (credential.failedAttempts >= credential.maxAttempts) credential.status = "locked";
      throw new Error(credential.status === "locked" ? "Pickup verification locked after repeated failures" : "Invalid pickup verification code");
    }

    credential.status = "collected";
    credential.collectedAt = input.now;
    this.#commerce.markDelivered(credential.orderId, credential.fulfilmentId, input.now);
    return this.#public(credential);
  }

  forCustomer(customerId: string, now: number): readonly PickupCredential[] {
    return [...this.#credentials.values()]
      .filter((item) => item.customerId === customerId)
      .map((item) => { this.#refreshExpiry(item, now); return this.#public(item); });
  }

  forVendor(vendorId: string, now: number): readonly PickupCredential[] {
    return [...this.#credentials.values()]
      .filter((item) => item.vendorId === vendorId)
      .map((item) => { this.#refreshExpiry(item, now); return this.#public(item); });
  }

  get(idValue: string, now: number): PickupCredential | undefined {
    const item = this.#credentials.get(idValue);
    if (!item) return undefined;
    this.#refreshExpiry(item, now);
    return this.#public(item);
  }

  #refreshExpiry(item: StoredPickupCredential, now: number): void {
    if (item.status === "ready" && item.expiresAt <= now) item.status = "expired";
  }

  #public(item: StoredPickupCredential): PickupCredential {
    return {
      id: item.id,
      orderId: item.orderId,
      fulfilmentId: item.fulfilmentId,
      vendorId: item.vendorId,
      customerId: item.customerId,
      status: item.status,
      readyAt: item.readyAt,
      expiresAt: item.expiresAt,
      failedAttempts: item.failedAttempts,
      maxAttempts: item.maxAttempts,
      collectedAt: item.collectedAt,
      shortCode: this.#shortCode(item),
      qrToken: this.#qrToken(item)
    };
  }

  #shortCode(item: StoredPickupCredential): string {
    const digest = createHmac("sha256", this.#secret).update(`code|${item.id}|${item.nonce}`).digest();
    const value = digest.readUInt32BE(0) % 1_000_000;
    return String(value).padStart(6, "0");
  }

  #qrToken(item: StoredPickupCredential): string {
    const payload = `${item.id}.${item.nonce}`;
    const signature = createHmac("sha256", this.#secret).update(`qr|${payload}`).digest("base64url");
    return `${payload}.${signature}`;
  }

  #validProof(item: StoredPickupCredential, proof: string): boolean {
    if (/^\d{6}$/.test(proof)) return safeEqual(proof, this.#shortCode(item));
    return safeEqual(proof, this.#qrToken(item));
  }

  #required(idValue: string): StoredPickupCredential {
    const item = this.#credentials.get(idValue);
    if (!item) throw new Error("Pickup credential not found");
    return item;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
