import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "../../../../components/SiteHeader";
import { OrderDetailClient } from "../../../../components/OrderDetailClient";
import { getAccountSession } from "../../../../lib/account-session";
import { accountOrderDetail } from "../../../../lib/account-view";

type Props = Readonly<{ params: Promise<{ id: string }> }>;
export const metadata: Metadata = { title: "Παραγγελία", robots: { index: false, follow: false } };
export default async function OrderPage({ params }: Props) {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account");
  const { id } = await params;
  try {
    const detail = await accountOrderDetail(principal, id);
    return <main><div className="announcement">Customer order · μία αγορά, ιδιωτικά fulfilments ανά τοπικό συνεργάτη.</div><SiteHeader compact /><section className="shell page-hero order-page-hero"><a className="text-link" href="/account">← Λογαριασμός</a></section><OrderDetailClient initial={detail} /></main>;
  } catch { notFound(); }
}
