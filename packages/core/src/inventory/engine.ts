import { id } from "../common/ids.ts";
import type { InventoryBalance, InventoryMovement, StockReservation } from "./types.ts";

export class InventoryEngine {
  readonly #balances = new Map<string, InventoryBalance>();
  readonly #reservations = new Map<string, StockReservation>();
  readonly #checkoutIndex = new Map<string, string>();
  readonly #movements: InventoryMovement[] = [];

  seed(balance: InventoryBalance): void {
    this.#validateUnits(balance.onHand);
    this.#validateUnits(balance.activeReservations);
    this.#validateUnits(balance.safetyStock);
    this.#validateUnits(balance.blocked);
    this.#balances.set(balance.offerId, { ...balance });
  }

  availableToSell(offerId: string): number {
    const b = this.#requiredBalance(offerId);
    return Math.max(0, b.onHand - b.activeReservations - b.safetyStock - b.blocked);
  }

  hasOffer(offerId: string): boolean {
    return this.#balances.has(offerId);
  }

  reserve(input: { offerId: string; quantity: number; checkoutKey: string; now: number; ttlMs?: number }): StockReservation {
    this.expire(input.now);
    this.#validatePositiveUnits(input.quantity);

    const idempotencyKey = `${input.checkoutKey}:${input.offerId}`;
    const existingId = this.#checkoutIndex.get(idempotencyKey);
    if (existingId) {
      const existing = this.#reservations.get(existingId);
      if (existing && existing.status === "active") {
        if (existing.quantity !== input.quantity) {
          throw new Error("Idempotent reservation replay changed quantity");
        }
        return { ...existing };
      }
    }

    if (this.availableToSell(input.offerId) < input.quantity) {
      throw new Error(`Insufficient stock for offer ${input.offerId}`);
    }

    const reservation: StockReservation = {
      id: id("res"),
      checkoutKey: input.checkoutKey,
      offerId: input.offerId,
      quantity: input.quantity,
      status: "active",
      createdAt: input.now,
      expiresAt: input.now + (input.ttlMs ?? 10 * 60 * 1000)
    };
    const balance = this.#requiredBalance(input.offerId);
    balance.activeReservations += input.quantity;
    balance.updatedAt = input.now;
    this.#reservations.set(reservation.id, reservation);
    this.#checkoutIndex.set(idempotencyKey, reservation.id);
    this.#movement(input.offerId, "reserve", -input.quantity, "checkout", input.now, reservation.id);
    return { ...reservation };
  }

  consume(reservationId: string, now: number): StockReservation {
    const reservation = this.#requiredReservation(reservationId);
    if (reservation.status === "consumed") return { ...reservation };
    if (reservation.status !== "active") throw new Error(`Cannot consume ${reservation.status} reservation`);

    const balance = this.#requiredBalance(reservation.offerId);
    if (balance.onHand < reservation.quantity) throw new Error("Inventory corruption: onHand below reserved quantity");
    balance.activeReservations -= reservation.quantity;
    balance.onHand -= reservation.quantity;
    balance.updatedAt = now;
    reservation.status = "consumed";
    this.#movement(reservation.offerId, "consume", -reservation.quantity, "order", now, reservation.id);
    return { ...reservation };
  }

  reverseConsumed(reservationId: string, now: number, reason = "order_cancellation"): StockReservation {
    const reservation = this.#requiredReservation(reservationId);
    if (reservation.status === "reversed") return { ...reservation };
    if (reservation.status !== "consumed") throw new Error(`Cannot reverse ${reservation.status} reservation`);
    const balance = this.#requiredBalance(reservation.offerId);
    balance.onHand += reservation.quantity;
    balance.updatedAt = now;
    reservation.status = "reversed";
    this.#movement(reservation.offerId, "cancel_restore", reservation.quantity, reason, now, reservation.id);
    return { ...reservation };
  }

  release(reservationId: string, now: number, reason = "manual_release"): StockReservation {
    const reservation = this.#requiredReservation(reservationId);
    if (reservation.status === "released" || reservation.status === "expired") return { ...reservation };
    if (reservation.status === "consumed") throw new Error("Consumed reservation cannot be released");
    this.#releaseActive(reservation, now, "released", reason);
    return { ...reservation };
  }

  expire(now: number): number {
    let count = 0;
    for (const reservation of this.#reservations.values()) {
      if (reservation.status === "active" && reservation.expiresAt <= now) {
        this.#releaseActive(reservation, now, "expired", "reservation_expiry");
        count += 1;
      }
    }
    return count;
  }

  adjustOnHand(offerId: string, newOnHand: number, now: number, source: string, actorId?: string): void {
    this.#validateUnits(newOnHand);
    const balance = this.#requiredBalance(offerId);
    const delta = newOnHand - balance.onHand;
    balance.onHand = newOnHand;
    balance.updatedAt = now;
    this.#movement(offerId, "set_on_hand", delta, source, now, undefined, actorId);
  }

  receiveReturn(input: { offerId: string; quantity: number; disposition: "sellable" | "blocked"; now: number; source?: string; actorId?: string }): void {
    this.#validatePositiveUnits(input.quantity);
    const balance = this.#requiredBalance(input.offerId);
    balance.onHand += input.quantity;
    if (input.disposition === "blocked") balance.blocked += input.quantity;
    balance.updatedAt = input.now;
    this.#movement(
      input.offerId,
      input.disposition === "sellable" ? "return_sellable" : "return_blocked",
      input.quantity,
      input.source ?? "return",
      input.now,
      undefined,
      input.actorId
    );
  }

  returnBlockedItemToCustomer(input: { offerId: string; quantity: number; now: number; source?: string; actorId?: string }): void {
    this.#validatePositiveUnits(input.quantity);
    const balance = this.#requiredBalance(input.offerId);
    if (balance.blocked < input.quantity || balance.onHand < input.quantity) throw new Error("Blocked return inventory is insufficient");
    balance.blocked -= input.quantity;
    balance.onHand -= input.quantity;
    balance.updatedAt = input.now;
    this.#movement(input.offerId, "return_to_customer", -input.quantity, input.source ?? "return_remedy", input.now, undefined, input.actorId);
  }

  balance(offerId: string): InventoryBalance {
    return { ...this.#requiredBalance(offerId) };
  }

  reservations(): readonly StockReservation[] {
    return [...this.#reservations.values()].map((r) => ({ ...r }));
  }

  movements(): readonly InventoryMovement[] {
    return this.#movements.map((m) => ({ ...m }));
  }

  #releaseActive(reservation: StockReservation, now: number, status: "released" | "expired", source: string): void {
    const balance = this.#requiredBalance(reservation.offerId);
    balance.activeReservations -= reservation.quantity;
    if (balance.activeReservations < 0) throw new Error("Inventory corruption: negative active reservations");
    balance.updatedAt = now;
    reservation.status = status;
    this.#movement(reservation.offerId, "release", reservation.quantity, source, now, reservation.id);
  }

  #movement(offerId: string, type: InventoryMovement["type"], quantityDelta: number, source: string, createdAt: number, reservationId?: string, actorId?: string) {
    this.#movements.push({ id: id("mov"), offerId, type, quantityDelta, reservationId, source, actorId, createdAt });
  }

  #requiredBalance(offerId: string): InventoryBalance {
    const balance = this.#balances.get(offerId);
    if (!balance) throw new Error(`Unknown inventory offer ${offerId}`);
    return balance;
  }

  #requiredReservation(reservationId: string): StockReservation {
    const reservation = this.#reservations.get(reservationId);
    if (!reservation) throw new Error(`Unknown reservation ${reservationId}`);
    return reservation;
  }

  #validateUnits(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Inventory units must be non-negative integers");
  }

  #validatePositiveUnits(value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Quantity must be a positive integer");
  }
}
