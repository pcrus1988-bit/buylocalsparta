import type { SessionPrincipal } from "@buy-local-sparta/core";
import type { CustomerSavedAddress } from "@buy-local-sparta/postgres-runtime/customer-addresses";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CheckoutFiscalDocumentType = "receipt" | "invoice";
export type CheckoutFiscalSnapshot = Readonly<{
  documentType: CheckoutFiscalDocumentType;
  source: "checkout_address_lock";
  lockedAt: string;
  business?: Readonly<{
    legalName: string;
    vatNumber: string;
    email: string;
    address: Readonly<{
      line1: string;
      line2?: string;
      locality: string;
      region?: string;
      postcode: string;
      countryCode: string;
    }>;
  }>;
}>;

export function checkoutFiscalPreference(request: Request): CheckoutFiscalDocumentType {
  const raw = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("km_checkout_fiscal="))?.split("=").slice(1).join("=");
  return raw === "invoice" ? "invoice" : "receipt";
}

export function buildCheckoutFiscalSnapshot(input: {
  documentType: CheckoutFiscalDocumentType;
  billingAddress: CustomerSavedAddress;
  email: string;
  now: number;
}): CheckoutFiscalSnapshot {
  if (input.documentType === "receipt") {
    return { documentType: "receipt", source: "checkout_address_lock", lockedAt: new Date(input.now).toISOString() };
  }
  const legalName = input.billingAddress.companyName?.trim();
  const vatNumber = input.billingAddress.vatNumber?.trim();
  const email = input.email.trim().toLowerCase();
  if (!legalName) throw new Error("Για τιμολόγιο, συμπλήρωσε την επωνυμία στην επιλεγμένη διεύθυνση τιμολόγησης.");
  if (!vatNumber || !validGreekVat(vatNumber)) throw new Error("Για τιμολόγιο, συμπλήρωσε έγκυρο ελληνικό ΑΦΜ στην επιλεγμένη διεύθυνση τιμολόγησης.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Για τιμολόγιο απαιτείται έγκυρο email λογαριασμού.");
  if (input.billingAddress.countryCode !== "GR" || !/^\d{5}$/.test(input.billingAddress.postcode)) throw new Error("Για τιμολόγιο απαιτείται έγκυρη ελληνική διεύθυνση τιμολόγησης.");
  return {
    documentType: "invoice",
    source: "checkout_address_lock",
    lockedAt: new Date(input.now).toISOString(),
    business: {
      legalName,
      vatNumber,
      email,
      address: {
        line1: input.billingAddress.line1,
        line2: input.billingAddress.line2,
        locality: input.billingAddress.locality,
        region: input.billingAddress.region,
        postcode: input.billingAddress.postcode,
        countryCode: input.billingAddress.countryCode
      }
    }
  };
}

export async function attachCheckoutFiscalSnapshot(principal: SessionPrincipal, input: {
  orderId: string;
  snapshot: CheckoutFiscalSnapshot;
  now: number;
}): Promise<void> {
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.sqlPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_access','true',true)");
    const result = await client.query<Record<string, unknown>>(`
      SELECT o.id::text AS order_uuid,o.checkout_address_locked_at,o.billing_address_snapshot
        FROM customer_orders o
        JOIN users u ON u.id=o.user_id
       WHERE o.public_id=$1 AND (u.public_id=$2 OR u.id::text=$2)
       FOR UPDATE OF o
    `, [input.orderId, principal.userId]);
    if (result.rowCount !== 1) throw new Error("Order not found for fiscal checkout lock");
    const row = result.rows[0];
    if (!row.checkout_address_locked_at) throw new Error("Billing address must be locked before the fiscal document choice");
    const billing = jsonObject(row.billing_address_snapshot);
    const existing = billing.fiscal;
    if (existing !== undefined) {
      if (!sameFiscalSnapshot(existing, input.snapshot)) throw new Error("Ο τύπος φορολογικού παραστατικού της παραγγελίας έχει ήδη κλειδώσει και δεν μπορεί να αλλάξει.");
      await client.query("COMMIT");
      return;
    }
    await client.query(`
      UPDATE customer_orders
         SET billing_address_snapshot=jsonb_set(billing_address_snapshot,'{fiscal}',$2::jsonb,true),updated_at=$3
       WHERE id=$1
         AND checkout_address_locked_at IS NOT NULL
         AND NOT (billing_address_snapshot ? 'fiscal')
    `, [String(row.order_uuid), JSON.stringify(input.snapshot), new Date(input.now)]);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export function validGreekVat(value: string): boolean {
  if (!/^\d{9}$/.test(value) || /^0{9}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 8).reduce((total, digit, index) => total + digit * 2 ** (8 - index), 0);
  return (sum % 11) % 10 === digits[8];
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {}
  }
  return {};
}

function sameFiscalSnapshot(existing: unknown, next: CheckoutFiscalSnapshot): boolean {
  const current = jsonObject(existing);
  if (current.documentType !== next.documentType || current.source !== next.source) return false;
  if (next.documentType === "receipt") return true;
  const currentBusiness = jsonObject(current.business);
  const nextBusiness = next.business;
  if (!nextBusiness) return false;
  return currentBusiness.legalName === nextBusiness.legalName
    && currentBusiness.vatNumber === nextBusiness.vatNumber
    && currentBusiness.email === nextBusiness.email;
}
