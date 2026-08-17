import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorFinanceClient } from "../../../components/VendorFinanceClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorFinanceWorkspace } from "../../../lib/vendor-backoffice-service";
export const metadata: Metadata = { title: "Vendor Finance", robots: { index: false, follow: false } };
export default async function VendorFinancePage() { const principal = await getVendorSession(); if (!principal) redirect("/vendor/login"); return <main className="vendor-app"><VendorWorkspaceHeader /><section className="shell vendor-hero vendor-hero-compact"><div><div className="eyebrow">Supplier finance</div><h1>Invoices & Settlements</h1><p className="lead">Υπέβαλε supplier invoice έναντι accrued procurement και παρακολούθησε payable/settlement status. Approval και payout controls παραμένουν στην πλατφόρμα.</p></div></section><VendorFinanceClient initial={await vendorFinanceWorkspace(principal)} /></main>; }
