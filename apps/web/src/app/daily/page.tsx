import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyHomeClient } from "../../components/VendorDailyHomeClient";
import { getDailySession } from "../../lib/daily-session";
import { dailyPushStatus } from "../../lib/daily-push";
import { vendorDashboard } from "../../lib/vendor-runtime";
import { synchronizeOperationalEvents, vendorAdviceWorkspace } from "../../lib/vendor-backoffice-service";
import { vendorOrderNotificationWorkspace } from "../../lib/order-sla";
import { productionDatabaseConfigured } from "../../lib/postgres-runtime";

export const metadata: Metadata = {
  title: "KONTA MOY Daily",
  description: "Καθημερινή λειτουργία παραγγελιών, Ask Local και παραλαβών για συνεργάτες KONTA MOY.",
  robots: { index: false, follow: false }
};

const emptySlaWorkspace = {
  metrics: { requiringAction: 0, breached: 0, escalated: 0, unread: 0 },
  cases: [],
  notifications: []
};

export default async function VendorDailyPage() {
  const principal = await getDailySession();
  if (!principal) redirect("/daily/login");

  synchronizeOperationalEvents();
  const generatedAt = Date.now();
  const [dashboard, advice, sla, push] = await Promise.all([
    vendorDashboard(principal),
    vendorAdviceWorkspace(principal),
    productionDatabaseConfigured() ? vendorOrderNotificationWorkspace(principal) : Promise.resolve(emptySlaWorkspace),
    dailyPushStatus(principal)
  ]);

  return <VendorDailyHomeClient dashboard={dashboard} advice={advice} sla={sla} push={push} generatedAt={generatedAt} />;
}
