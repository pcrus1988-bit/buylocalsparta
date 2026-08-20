import { cookies } from "next/headers";
import { DAILY_SESSION_COOKIE, logoutDaily } from "../../../../lib/daily-runtime";
import { logoutVendor, VENDOR_SESSION_COOKIE } from "../../../../lib/vendor-runtime";

export async function POST() {
  const store = await cookies();
  const dailyToken = store.get(DAILY_SESSION_COOKIE)?.value;
  const vendorToken = store.get(VENDOR_SESSION_COOKIE)?.value;
  await Promise.all([logoutDaily(dailyToken), logoutVendor(vendorToken)]);
  store.delete(DAILY_SESSION_COOKIE);
  store.delete(VENDOR_SESSION_COOKIE);
  return Response.json({ ok: true });
}
