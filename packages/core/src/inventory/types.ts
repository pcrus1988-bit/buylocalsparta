export type InventoryBalance = {
  offerId: string;
  onHand: number;
  activeReservations: number;
  safetyStock: number;
  blocked: number;
  updatedAt: number;
};

export type ReservationStatus = "active" | "consumed" | "released" | "expired" | "reversed";

export type StockReservation = {
  id: string;
  checkoutKey: string;
  offerId: string;
  quantity: number;
  status: ReservationStatus;
  createdAt: number;
  expiresAt: number;
};

export type InventoryMovement = {
  id: string;
  offerId: string;
  type: "set_on_hand" | "reserve" | "release" | "consume" | "block" | "unblock" | "adjust" | "return_sellable" | "return_blocked" | "return_to_customer" | "cancel_restore";
  quantityDelta: number;
  reservationId?: string;
  source: string;
  actorId?: string;
  createdAt: number;
};
