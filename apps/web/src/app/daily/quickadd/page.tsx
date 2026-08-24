import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QuickAddWorkbench } from "../../../components/QuickAddWorkbench";
import { getDailySession } from "../../../lib/daily-session";

export const metadata: Metadata = { title: "Daily · Quick Product", robots: { index: false, follow: false, nocache: true } };

export default async function Page() {
  const principal = await getDailySession();
  if (!principal) redirect("/daily/login");
  return <main><QuickAddWorkbench csrfToken={principal.csrfToken} /></main>;
}
