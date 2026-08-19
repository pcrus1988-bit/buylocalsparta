import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyNotificationSettings } from "../../../components/VendorDailyNotificationSettings";
import { getVendorSession } from "../../../lib/vendor-session";

export const metadata: Metadata = {
  title: "KONTA MOY Daily · Ειδοποιήσεις",
  robots: { index: false, follow: false }
};

export default async function DailyNotificationsPage() {
  if (!await getVendorSession()) redirect("/daily/login");

  return <VendorDailyNotificationSettings deliveryReady={false} />;
}
