import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyGiftCards } from "../../../components/VendorDailyGiftCards";
import { getDailySession } from "../../../lib/daily-session";

export const metadata: Metadata = { title: "KONTA MOY Daily · Gift Cards", robots: { index: false, follow: false, nocache: true } };

export default async function DailyGiftCardsPage() {
  const principal = await getDailySession();
  if (!principal) redirect("/daily/login");
  return <VendorDailyGiftCards csrfToken={principal.csrfToken} />;
}
