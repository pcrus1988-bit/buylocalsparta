import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorTrustClient } from "../../../components/VendorTrustClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorTrustWorkspace } from "../../../lib/vendor-backoffice-service";
export const metadata: Metadata = { title: "Vendor Media & Compliance", robots: { index: false, follow: false } };
export default async function VendorTrustPage() { const principal = await getVendorSession(); if (!principal) redirect("/vendor/login"); return <main className="vendor-app"><VendorWorkspaceHeader /><section className="shell vendor-hero vendor-hero-compact"><div><div className="eyebrow">Trust workflow</div><h1>Media & Compliance</h1><p className="lead">Ανέβασε media με rights metadata και compliance evidence. Κάθε αρχείο παραμένει ιδιωτικό μέχρι scan, moderation και platform verification.</p></div></section><VendorTrustClient initial={await vendorTrustWorkspace(principal)} /></main>; }
