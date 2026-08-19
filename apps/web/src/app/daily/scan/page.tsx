import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyScanner } from "../../../components/VendorDailyScanner";
import { getDailySession } from "../../../lib/daily-session";

export const metadata: Metadata = { title: "KONTA MOY Daily · Scan", robots: { index: false, follow: false } };

export default async function DailyScanPage() {
  if (!await getDailySession()) redirect("/daily/login");
  return <VendorDailyScanner />;
}
