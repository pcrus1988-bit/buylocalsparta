import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyAskLocalClient } from "../../../components/VendorDailyAskLocalClient";
import { getDailySession } from "../../../lib/daily-session";
import { synchronizeOperationalEvents, vendorAdviceWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "KONTA MOY Daily · Ask Local", robots: { index: false, follow: false } };

export default async function DailyAskLocalPage() {
  const principal = await getDailySession();
  if (!principal) redirect("/daily/login");
  synchronizeOperationalEvents();
  return <VendorDailyAskLocalClient initial={await vendorAdviceWorkspace(principal)} />;
}
