import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyClient } from "../../components/VendorDailyClient";
import { getVendorSession } from "../../lib/vendor-session";
import { vendorDashboard } from "../../lib/vendor-runtime";
import { synchronizeOperationalEvents, vendorAdviceWorkspace } from "../../lib/vendor-backoffice-service";

export const metadata: Metadata = {
  title: "KONTA MOY Daily",
  description: "Καθημερινή λειτουργία παραγγελιών, Ask Local και παραλαβών για συνεργάτες KONTA MOY.",
  robots: { index: false, follow: false }
};

export default async function VendorDailyPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/daily/login");

  synchronizeOperationalEvents();
  const [dashboard, advice] = await Promise.all([
    vendorDashboard(principal),
    vendorAdviceWorkspace(principal)
  ]);

  return <VendorDailyClient dashboard={dashboard} advice={advice} />;
}
