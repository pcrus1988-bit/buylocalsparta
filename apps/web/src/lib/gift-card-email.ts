import type { Notification } from "@buy-local-sparta/core";
import { ResendEmailProvider, resendConfigFromEnv, resendDeliveryEnabled } from "@buy-local-sparta/resend-notifications";

export type GiftCardEmailStatus = Readonly<{ sent: boolean; error?: string }>;

const PLATFORM_EMAIL = "info@kontamou.site";
const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

function provider() {
  if (!resendDeliveryEnabled(process.env)) return undefined;
  return new ResendEmailProvider(resendConfigFromEnv(process.env));
}

function notification(input: {
  id: string;
  eventType: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}): Notification {
  return {
    id: input.id,
    channel: "email",
    purpose: "transactional",
    eventType: input.eventType,
    templateVersion: "v1",
    locale: "el",
    title: input.title,
    body: input.body,
    payload: input.payload ?? {},
    status: "queued",
    deliveryAttempts: 0,
    createdAt: Date.now()
  };
}

async function send(destination: string, message: Notification, idempotencyKey: string): Promise<GiftCardEmailStatus> {
  const emailProvider = provider();
  if (!emailProvider) return { sent: false, error: "Η αποστολή email δεν είναι διαθέσιμη αυτή τη στιγμή." };
  try {
    await emailProvider.send({ notification: message, destination, idempotencyKey });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "email_delivery_failed" };
  }
}

export async function sendVendorIssuedGiftCardEmail(input: {
  destination: string;
  customerName: string;
  vendorName: string;
  cardId: string;
  code: string;
  valueMinor: number;
}): Promise<GiftCardEmailStatus> {
  const message = notification({
    id: `gift-card-vendor-issue:${input.cardId}`,
    eventType: "gift_card.vendor_issued",
    title: "Η KONTA MOY Gift Card σου είναι έτοιμη",
    body: `Γεια σου ${input.customerName},\n\nΗ ${input.vendorName} εξέδωσε για εσένα KONTA MOY Gift Card αξίας ${euro(input.valueMinor)}.\n\nΚωδικός Gift Card: ${input.code}\n\nΜπορείς να χρησιμοποιείς το διαθέσιμο υπόλοιπο σε περισσότερες από μία αγορές. Φύλαξε τον κωδικό σου με ασφάλεια.`,
    payload: {
      cardId: input.cardId,
      vendorName: input.vendorName,
      valueMinor: input.valueMinor,
      ctaPath: "/account/gift-cards",
      ctaLabel: "Οι Gift Cards μου"
    }
  });
  return send(input.destination, message, `gift-card-vendor-issue:${input.cardId}:customer`);
}

export async function sendPhysicalGiftCardRedemptionEmails(input: {
  vendorEmail: string;
  vendorName: string;
  vendorId: string;
  suffix: string;
  amountMinor: number;
  remainingMinor: number;
  ledgerId: string;
}): Promise<Readonly<{ vendor: GiftCardEmailStatus; platform: GiftCardEmailStatus }>> {
  const detail = `Εξαργυρώθηκε ${euro(input.amountMinor)} από Gift Card •••${input.suffix} στο φυσικό σημείο ${input.vendorName}.\n\nΝέο διαθέσιμο υπόλοιπο: ${euro(input.remainingMinor)}.\n\nΗ συναλλαγή επιβεβαιώθηκε από το κατάστημα ως ποσό που θα χειριστεί ως πληρωμή με μετρητά.\n\nVendor UID: ${input.vendorId}\nLedger: ${input.ledgerId}`;
  const vendorMessage = notification({
    id: `gift-card-redeem:${input.ledgerId}:vendor`,
    eventType: "vendor.gift_card_redeemed",
    title: `Εξαργύρωση Gift Card ${euro(input.amountMinor)}`,
    body: detail,
    payload: {
      vendorId: input.vendorId,
      ledgerId: input.ledgerId,
      amountMinor: input.amountMinor,
      remainingMinor: input.remainingMinor,
      ctaPath: "/daily/gift-cards",
      ctaLabel: "Gift Cards"
    }
  });
  const platformMessage = notification({
    id: `gift-card-redeem:${input.ledgerId}:platform`,
    eventType: "admin.gift_card_physical_redeemed",
    title: `Physical Gift Card redemption · ${input.vendorName}`,
    body: detail,
    payload: {
      vendorId: input.vendorId,
      vendorName: input.vendorName,
      ledgerId: input.ledgerId,
      amountMinor: input.amountMinor,
      remainingMinor: input.remainingMinor,
      ctaPath: "/admin/gift-cards",
      ctaLabel: "Admin Gift Cards"
    }
  });

  const [vendor, platform] = await Promise.all([
    send(input.vendorEmail, vendorMessage, `gift-card-redeem:${input.ledgerId}:vendor`),
    send(PLATFORM_EMAIL, platformMessage, `gift-card-redeem:${input.ledgerId}:platform`)
  ]);
  return { vendor, platform };
}
