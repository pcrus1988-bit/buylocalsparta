import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyNotificationSettings } from "../../../../components/VendorDailyNotificationSettings";
import { getDailySession } from "../../../../lib/daily-session";
import { createDailyPushBridgeToken, dailyPushBridgeOrigin } from "../../../../lib/daily-push-bridge";
import { dailyPushStatus } from "../../../../lib/daily-push";

export const metadata: Metadata = {
  title: "KONTA MOY Daily · Ρυθμίσεις ειδοποιήσεων",
  robots: { index: false, follow: false }
};

export default async function DailyNotificationSettingsPage() {
  const principal = await getDailySession();
  if (!principal || !principal.vendorId) redirect("/daily/login");
  const status = await dailyPushStatus(principal);
  const bridgeToken = createDailyPushBridgeToken({ userId: principal.userId, vendorId: principal.vendorId });
  const bridgeUrl = `${dailyPushBridgeOrigin()}/daily/push-bridge#token=${encodeURIComponent(bridgeToken)}`;
  return <VendorDailyNotificationSettings configured={status.configured} publicKey={status.publicKey} devices={status.devices} csrfToken={principal.csrfToken} bridgeUrl={bridgeUrl} />;
}
