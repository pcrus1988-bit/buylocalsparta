import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorAdviceClient } from "../../../components/VendorAdviceClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { synchronizeOperationalEvents, vendorAdviceWorkspace } from "../../../lib/vendor-backoffice-service";
export const metadata: Metadata = { title: "Vendor Advice", robots: { index: false, follow: false } };
export default async function VendorAdvicePage() { const principal = await getVendorSession(); if (!principal) redirect("/vendor/login"); synchronizeOperationalEvents(); return <main className="vendor-app"><VendorWorkspaceHeader /><section className="shell vendor-hero vendor-hero-compact"><div><div className="eyebrow">Human commerce</div><h1>Advice</h1><p className="lead">Συνομιλίες, ραντεβού, Ask Local/counteroffers και ειδοποιήσεις μόνο για το δικό σου κατάστημα.</p></div></section><VendorAdviceClient initial={await vendorAdviceWorkspace(principal)} /></main>; }
