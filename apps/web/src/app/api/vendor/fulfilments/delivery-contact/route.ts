import { requireVendorSession } from "../../../../../lib/vendor-session";

export async function POST(request: Request) {
  try {
    await requireVendorSession(request, true);
    return Response.json({ error: "Η διεύθυνση πελάτη είναι διαθέσιμη μόνο στον ανατεθειμένο οδηγό και στους εξουσιοδοτημένους διαχειριστές παράδοσης." }, {
      status: 403,
      headers: { "cache-control": "no-store, private" }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_contact_denied" }, {
      status: 400,
      headers: { "cache-control": "no-store, private" }
    });
  }
}
