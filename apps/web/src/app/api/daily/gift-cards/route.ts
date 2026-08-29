import { requireDailySession } from "../../../../lib/daily-session";
import { sendPhysicalGiftCardRedemptionEmails, sendVendorIssuedGiftCardEmail } from "../../../../lib/gift-card-email";
import {
  issueVendorPhysicalGiftCard,
  lookupVendorPhysicalGiftCard,
  redeemVendorPhysicalGiftCard,
  vendorGiftCardAccess
} from "../../../../lib/vendor-gift-card-service";

function statusFor(message: string) {
  if (message === "DAILY_AUTH_REQUIRED") return 401;
  if (message === "VENDOR_GIFT_CARD_ACCESS_REQUIRED") return 403;
  return 400;
}

export async function GET(request: Request) {
  try {
    const principal = await requireDailySession(request, false);
    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim();
    if (!code) {
      const access = await vendorGiftCardAccess(principal);
      return Response.json({ access });
    }
    const card = await lookupVendorPhysicalGiftCard(principal, code);
    return Response.json({ card });
  } catch (error) {
    const message = error instanceof Error ? error.message : "gift_card_lookup_failed";
    return Response.json({ error: message }, { status: statusFor(message) });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "issue") {
      if (body.paymentConfirmed !== true) {
        return Response.json({ error: "Επιβεβαίωσε ότι η πληρωμή της Gift Card έχει εισπραχθεί στο κατάστημα πριν την έκδοση." }, { status: 400 });
      }
      const result = await issueVendorPhysicalGiftCard(principal, {
        valueMinor: Number(body.valueMinor),
        customerName: typeof body.customerName === "string" ? body.customerName : "",
        customerEmail: typeof body.customerEmail === "string" ? body.customerEmail : ""
      });
      const email = await sendVendorIssuedGiftCardEmail({
        destination: typeof body.customerEmail === "string" ? body.customerEmail.trim().toLowerCase() : "",
        customerName: typeof body.customerName === "string" ? body.customerName.trim() : "",
        vendorName: result.vendor.vendorName,
        cardId: result.card.id,
        code: result.code,
        valueMinor: result.card.initialValueMinor
      });
      return Response.json({ result, email }, { status: 201 });
    }

    if (action === "redeem") {
      if (body.redemptionConfirmed !== true) {
        return Response.json({ error: "Επιβεβαίωσε την εξαργύρωση και τον χειρισμό της ως πληρωμή στο φυσικό κατάστημα." }, { status: 400 });
      }
      const result = await redeemVendorPhysicalGiftCard(principal, {
        code: typeof body.code === "string" ? body.code : "",
        amountMinor: Number(body.amountMinor),
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : ""
      });
      const emails = await sendPhysicalGiftCardRedemptionEmails({
        vendorEmail: result.vendor.vendorEmail,
        vendorName: result.vendor.vendorName,
        vendorId: result.vendor.vendorId,
        suffix: result.card.suffix,
        amountMinor: result.amountMinor,
        remainingMinor: result.remainingBalanceMinor,
        ledgerId: result.ledgerId
      });
      return Response.json({ result, emails });
    }

    return Response.json({ error: "Μη έγκυρη ενέργεια Gift Card." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "gift_card_operation_failed";
    return Response.json({ error: message }, { status: statusFor(message) });
  }
}
