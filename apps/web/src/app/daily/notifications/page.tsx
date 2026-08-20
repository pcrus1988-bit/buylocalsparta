import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyNotificationSettings } from "../../../components/VendorDailyNotificationSettings";
import { getDailySession } from "../../../lib/daily-session";
import { dailyPushStatus } from "../../../lib/daily-push";

export const metadata: Metadata = {
  title: "KONTA MOY Daily · Ειδοποιήσεις",
  robots: { index: false, follow: false }
};

export default async function DailyNotificationsPage() {
  const principal = await getDailySession();
  if (!principal) redirect("/daily/login");
  const status = await dailyPushStatus(principal);
  return <VendorDailyNotificationSettings configured={status.configured} publicKey={status.publicKey} devices={status.devices} csrfToken={principal.csrfToken} />;
}
