import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyScanner } from "../../../components/VendorDailyScanner";
import { getVendorSession } from "../../../lib/vendor-session";

export const metadata: Metadata = { title: "KONTA MOY Daily · Scan", robots: { index: false, follow: false } };

export default async function DailyScanPage() {
  if (!await getVendorSession()) redirect("/daily/login");
  return <VendorDailyScanner />;
}
