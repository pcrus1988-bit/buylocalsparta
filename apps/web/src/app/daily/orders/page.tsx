import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyOrdersClient } from "../../../components/VendorDailyOrdersClient";
import { getDailySession } from "../../../lib/daily-session";
import { vendorDashboard } from "../../../lib/vendor-runtime";
import { synchronizeOperationalEvents } from "../../../lib/vendor-backoffice-service";
import { vendorOrderNotificationWorkspace } from "../../../lib/order-sla";
import { productionDatabaseConfigured } from "../../../lib/postgres-runtime";

export const metadata: Metadata = {
  title: "KONTA MOY Daily · Orders",
  robots: { index: false, follow: false }
};

const emptySlaWorkspace = {
  metrics: { requiringAction: 0, breached: 0, escalated: 0, unread: 0 },
  cases: [],
  notifications: []
};

export default async function DailyOrdersPage() {
  const principal = await getDailySession();
  if (!principal) redirect("/daily/login");
  synchronizeOperationalEvents();

  const [dashboard, sla] = await Promise.all([
    vendorDashboard(principal),
    productionDatabaseConfigured() ? vendorOrderNotificationWorkspace(principal) : Promise.resolve(emptySlaWorkspace)
  ]);

  return <VendorDailyOrdersClient dashboard={dashboard} sla={sla} />;
}
