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
  return getProductionPostgresRuntime().fiscalWork.lockCheckoutSnapshot({
    customerId: principal.userId,
    orderId: input.orderId,
    snapshot: input.snapshot,
    now: input.now
  });
}

export function validGreekVat(value: string): boolean {
  if (!/^\d{9}$/.test(value) || /^0{9}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 8).reduce((total, digit, index) => total + digit * 2 ** (8 - index), 0);
  return (sum % 11) % 10 === digits[8];
}
