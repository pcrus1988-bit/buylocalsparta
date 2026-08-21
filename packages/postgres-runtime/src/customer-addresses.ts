import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, id, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "@buy-local-sparta/core";

export type CustomerSavedAddress = Readonly<{
  id: string;
  label: string;
  fullName: string;
  companyName?: string;
  vatNumber?: string;
  line1: string;
  line2?: string;
  locality: string;
  region?: string;
  postcode: string;
  countryCode: string;
  phone?: string;
  isDefaultBilling: boolean;
  isDefaultDelivery: boolean;
}>;

export type CustomerAddressInput = Readonly<{
  id?: string;
  label?: string;
  fullName: string;
  companyName?: string;
  vatNumber?: string;
  line1: string;
  line2?: string;
  locality: string;
  region?: string;
  postcode: string;
  countryCode?: string;
  phone?: string;
  isDefaultBilling?: boolean;
  isDefaultDelivery?: boolean;
}>;

export type CustomerCheckoutProfile = Readonly<{
  customerId: string;
  fullName: string;
  addresses: readonly CustomerSavedAddress[];
}>;

type OrderFulfilmentMode = "pickup" | "local_delivery" | "shipping" | "bulky_special";

function customerScope(customerId: string, requestId?: string): DatabaseScope {
  return { actorUserId: customerId, marketId: "sparta", requestId };
}

function clean(value: string | undefined, max: number): string | undefined {
  const result = value?.trim();
  if (!result) return undefined;
  if (result.length > max) throw new Error("Address field is too long");
  return result;
}

function required(value: string, label: string, max: number): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  if (result.length > max) throw new Error(`${label} is too long`);
  return result;
}

function fullNameParts(value: string): { firstName: string; lastName?: string } {
  const fullName = required(value, "Full name", 160).replace(/\s+/g, " ");
  const parts = fullName.split(" ");
  if (parts.length < 2) throw new Error("Enter your full name and surname");
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

function rowText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function savedAddress(row: SqlRow): CustomerSavedAddress {
  return {
    id: String(row.public_id),
    label: rowText(row.label) ?? "Διεύθυνση",
    fullName: rowText(row.recipient_name) ?? "",
    companyName: rowText(row.company_name),
    vatNumber: rowText(row.vat_number),
    line1: String(row.line1 ?? ""),
    line2: rowText(row.line2),
    locality: String(row.locality ?? ""),
    region: rowText(row.region),
    postcode: String(row.postcode ?? ""),
    countryCode: String(row.country_code ?? "GR"),
    phone: rowText(row.phone),
    isDefaultBilling: row.is_default_billing === true,
    isDefaultDelivery: row.is_default_delivery === true
  };
}

function billingSnapshot(address: CustomerSavedAddress, customerFullName: string) {
  return {
    addressId: address.id,
    fullName: customerFullName,
    recipientName: address.fullName || customerFullName,
    companyName: address.companyName,
    vatNumber: address.vatNumber,
    line1: address.line1,
    line2: address.line2,
    locality: address.locality,
    region: address.region,
    postcode: address.postcode,
    countryCode: address.countryCode,
    phone: address.phone
  };
}

function localDeliverySnapshot(address: CustomerSavedAddress, customerFullName: string) {
  return {
    addressId: address.id,
    fullName: customerFullName,
    recipientName: address.fullName || customerFullName,
    companyName: address.companyName,
    line1: address.line1,
    line2: address.line2,
    locality: address.locality,
    region: address.region,
    postcode: address.postcode,
    countryCode: address.countryCode,
    phone: address.phone
  };
}

function boxNowSnapshot(existing: Record<string, unknown> | undefined) {
  if (!existing || rowText(existing.provider) !== "boxnow") throw new Error("BOX NOW shipping metadata is missing");
  const providerDestinationId = rowText(existing.providerDestinationId);
  const recipientName = rowText(existing.recipientName);
  const recipientEmail = rowText(existing.recipientEmail);
  const recipientPhone = rowText(existing.recipientPhone);
  if (!providerDestinationId || !recipientName || !recipientEmail || !recipientPhone) throw new Error("BOX NOW recipient metadata is incomplete");
  return {
    provider: "boxnow",
    providerDestinationId,
    providerDestinationLabel: rowText(existing.providerDestinationLabel),
    recipientName,
    recipientEmail,
    recipientPhone,
    postcode: rowText(existing.postcode),
    countryCode: rowText(existing.countryCode) ?? "GR"
  };
}

function orderMode(value: unknown): OrderFulfilmentMode {
  if (value === "pickup" || value === "local_delivery" || value === "shipping" || value === "bulky_special") return value;
  throw new Error("Order fulfilment mode is invalid");
}

export class PostgresCustomerAddressService {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool, { statementTimeoutMs: 10_000, lockTimeoutMs: 5_000 });
  }

  async profile(customerId: string): Promise<CustomerCheckoutProfile> {
    return this.#uow.withTransaction(customerScope(customerId, "customer-address-profile"), async (tx) => {
      const userUuid = await this.#userUuid(tx, customerId);
      const profile = await tx.query<SqlRow>("SELECT first_name,last_name FROM customer_profiles WHERE user_id=$1", [userUuid]);
      const first = rowText(profile.rows[0]?.first_name);
      const last = rowText(profile.rows[0]?.last_name);
      const addresses = await tx.query<SqlRow>(`
        SELECT public_id,label,recipient_name,company_name,vat_number,line1,line2,locality,region,postcode,country_code,phone,
               is_default_billing,is_default_delivery
        FROM addresses
        WHERE user_id=$1
        ORDER BY is_default_billing DESC,is_default_delivery DESC,updated_at DESC,created_at DESC,public_id
      `, [userUuid]);
      return {
        customerId,
        fullName: [first, last].filter(Boolean).join(" "),
        addresses: addresses.rows.map(savedAddress)
      };
    }, { readOnly: true });
  }

  async upsert(customerId: string, input: CustomerAddressInput, now = Date.now()): Promise<CustomerCheckoutProfile> {
    const name = fullNameParts(input.fullName);
    const label = clean(input.label, 80) ?? "Διεύθυνση";
    const line1 = required(input.line1, "Address", 240);
    const line2 = clean(input.line2, 240);
    const locality = required(input.locality, "City", 120);
    const region = clean(input.region, 120);
    const postcode = required(input.postcode, "Postcode", 16);
    if (!/^\d{5}$/.test(postcode)) throw new Error("A five-digit Greek postcode is required");
    const countryCode = (clean(input.countryCode, 2) ?? "GR").toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error("A valid country code is required");
    const phone = clean(input.phone, 40);
    if (phone && !/^\+?[0-9 ()-]{8,24}$/.test(phone)) throw new Error("A valid phone number is required");
    const companyName = clean(input.companyName, 200);
    const vatNumber = clean(input.vatNumber, 40);

    await this.#uow.withTransaction(customerScope(customerId, "customer-address-upsert"), async (tx) => {
      const userUuid = await this.#userUuid(tx, customerId);
      const marketUuid = await this.#marketUuid(tx, "sparta");
      const timestamp = new Date(now);
      await tx.query(`
        INSERT INTO customer_profiles(user_id,first_name,last_name,created_at,updated_at)
        VALUES($1,$2,$3,$4,$4)
        ON CONFLICT(user_id) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,updated_at=EXCLUDED.updated_at
      `, [userUuid, name.firstName, name.lastName ?? null, timestamp]);

      const existingCount = await tx.query<SqlRow>("SELECT count(*)::int AS count FROM addresses WHERE user_id=$1", [userUuid]);
      const isFirst = Number(existingCount.rows[0]?.count ?? 0) === 0;
      const defaultBilling = input.isDefaultBilling === true || isFirst;
      const defaultDelivery = input.isDefaultDelivery === true || isFirst;
      if (defaultBilling) await tx.query("UPDATE addresses SET is_default_billing=false,updated_at=$2 WHERE user_id=$1 AND is_default_billing=true", [userUuid, timestamp]);
      if (defaultDelivery) await tx.query("UPDATE addresses SET is_default_delivery=false,updated_at=$2 WHERE user_id=$1 AND is_default_delivery=true", [userUuid, timestamp]);

      if (input.id?.trim()) {
        const updated = await tx.query<SqlRow>(`
          UPDATE addresses SET label=$3,recipient_name=$4,company_name=$5,vat_number=$6,line1=$7,line2=$8,locality=$9,region=$10,
            postcode=$11,country_code=$12,phone=$13,is_default_billing=$14,is_default_delivery=$15,updated_at=$16
          WHERE user_id=$1 AND public_id=$2
          RETURNING public_id
        `, [userUuid, input.id.trim(), label, input.fullName.trim().replace(/\s+/g, " "), companyName ?? null, vatNumber ?? null, line1, line2 ?? null, locality, region ?? null, postcode, countryCode, phone ?? null, defaultBilling, defaultDelivery, timestamp]);
        if (!updated.rowCount) throw new Error("Saved address not found");
      } else {
        await tx.query(`
          INSERT INTO addresses(id,public_id,user_id,market_id,label,recipient_name,company_name,vat_number,line1,line2,locality,region,postcode,country_code,phone,
            is_default_billing,is_default_delivery,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)
        `, [randomUUID(), id("addr"), userUuid, marketUuid, label, input.fullName.trim().replace(/\s+/g, " "), companyName ?? null, vatNumber ?? null, line1, line2 ?? null, locality, region ?? null, postcode, countryCode, phone ?? null, defaultBilling, defaultDelivery, timestamp]);
      }
    }, { isolation: "serializable" });
    return this.profile(customerId);
  }

  async remove(customerId: string, addressId: string, now = Date.now()): Promise<CustomerCheckoutProfile> {
    await this.#uow.withTransaction(customerScope(customerId, "customer-address-delete"), async (tx) => {
      const userUuid = await this.#userUuid(tx, customerId);
      const removed = await tx.query<SqlRow>(`DELETE FROM addresses WHERE user_id=$1 AND public_id=$2 RETURNING is_default_billing,is_default_delivery`, [userUuid, addressId]);
      if (!removed.rowCount) throw new Error("Saved address not found");
      const timestamp = new Date(now);
      if (removed.rows[0]?.is_default_billing === true) {
        await tx.query(`UPDATE addresses SET is_default_billing=true,updated_at=$2 WHERE id=(SELECT id FROM addresses WHERE user_id=$1 ORDER BY updated_at DESC,id LIMIT 1)`, [userUuid, timestamp]);
      }
      if (removed.rows[0]?.is_default_delivery === true) {
        await tx.query(`UPDATE addresses SET is_default_delivery=true,updated_at=$2 WHERE id=(SELECT id FROM addresses WHERE user_id=$1 ORDER BY updated_at DESC,id LIMIT 1)`, [userUuid, timestamp]);
      }
    }, { isolation: "serializable" });
    return this.profile(customerId);
  }

  async attachOrderSnapshots(input: { customerId: string; orderId: string; billingAddressId: string; deliveryAddressId?: string; now: number }): Promise<void> {
    await this.#uow.withTransaction(customerScope(input.customerId, `customer-order-addresses:${input.orderId}`), async (tx) => {
      const userUuid = await this.#userUuid(tx, input.customerId);
      const order = await tx.query<SqlRow>(`
        SELECT id::text AS id,fulfilment_preference,checkout_address_locked_at,billing_address_snapshot,shipping_address_snapshot
        FROM customer_orders WHERE public_id=$1 AND user_id=$2 FOR UPDATE
      `, [input.orderId, userUuid]);
      if (!order.rowCount) throw new Error("Order not found for customer");
      const existing = order.rows[0];
      const mode = orderMode(existing.fulfilment_preference);
      const existingBilling = typeof existing.billing_address_snapshot === "string" ? JSON.parse(existing.billing_address_snapshot) : existing.billing_address_snapshot as Record<string, unknown> | undefined;
      const existingShipping = typeof existing.shipping_address_snapshot === "string" ? JSON.parse(existing.shipping_address_snapshot) : existing.shipping_address_snapshot as Record<string, unknown> | undefined;
      if (existing.checkout_address_locked_at) {
        if (existingBilling?.addressId !== input.billingAddressId) throw new Error("Order billing address is already locked and cannot be changed");
        if (mode === "local_delivery" && existingShipping?.addressId !== input.deliveryAddressId) throw new Error("Order delivery address is already locked and cannot be changed");
        return;
      }

      const profile = await tx.query<SqlRow>("SELECT first_name,last_name FROM customer_profiles WHERE user_id=$1", [userUuid]);
      const customerFullName = [rowText(profile.rows[0]?.first_name), rowText(profile.rows[0]?.last_name)].filter(Boolean).join(" ");
      if (!customerFullName || customerFullName.split(/\s+/).length < 2) throw new Error("Full customer name is required before checkout");
      if (mode === "local_delivery" && !input.deliveryAddressId) throw new Error("Local delivery requires a saved delivery address");
      const requestedAddressIds = [input.billingAddressId, ...(mode === "local_delivery" && input.deliveryAddressId ? [input.deliveryAddressId] : [])];
      const addresses = await tx.query<SqlRow>(`
        SELECT public_id,label,recipient_name,company_name,vat_number,line1,line2,locality,region,postcode,country_code,phone,is_default_billing,is_default_delivery
        FROM addresses WHERE user_id=$1 AND public_id=ANY($2::text[])
      `, [userUuid, requestedAddressIds]);
      const byId = new Map(addresses.rows.map((row) => [String(row.public_id), savedAddress(row)]));
      const billing = byId.get(input.billingAddressId);
      if (!billing) throw new Error("Select a saved billing address belonging to your account");

      let shippingSnapshot: Record<string, unknown> | null = null;
      if (mode === "local_delivery") {
        const delivery = byId.get(input.deliveryAddressId!);
        if (!delivery) throw new Error("Select a saved delivery address belonging to your account");
        shippingSnapshot = localDeliverySnapshot(delivery, customerFullName);
      } else if (mode === "shipping") {
        shippingSnapshot = boxNowSnapshot(existingShipping);
      }

      await tx.query(`
        UPDATE customer_orders
        SET billing_address_snapshot=$3::jsonb,shipping_address_snapshot=$4::jsonb,checkout_address_locked_at=$5,updated_at=$5
        WHERE id=$1 AND user_id=$2 AND checkout_address_locked_at IS NULL
      `, [String(existing.id), userUuid, JSON.stringify(billingSnapshot(billing, customerFullName)), JSON.stringify(shippingSnapshot), new Date(input.now)]);
    }, { isolation: "serializable" });
  }

  async #userUuid(tx: SqlExecutor, customerId: string): Promise<string> {
    const result = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [customerId]);
    if (!result.rowCount) throw new Error("Customer account not found");
    return String(result.rows[0].id);
  }

  async #marketUuid(tx: SqlExecutor, marketId: string): Promise<string> {
    const result = await tx.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code=$1 OR id::text=$1", [marketId]);
    if (!result.rowCount) throw new Error("Market not found");
    return String(result.rows[0].id);
  }
}
