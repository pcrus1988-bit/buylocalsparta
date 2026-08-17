import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorCatalogClient } from "../../../components/VendorCatalogClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorCatalogWorkspace } from "../../../lib/vendor-backoffice-service";
export const metadata: Metadata = { title: "Vendor Catalog", robots: { index: false, follow: false } };
export default async function VendorCatalogPage() { const principal = await getVendorSession(); if (!principal) redirect("/vendor/login"); return <main className="vendor-app"><VendorWorkspaceHeader /><section className="shell vendor-hero vendor-hero-compact"><div><div className="eyebrow">Vendor catalog workflow</div><h1>Κατάλογος</h1><p className="lead">Δημιούργησε source products, κάνε CSV dry-run και υπέβαλε προϊόντα στο Product Matching Centre. Η τελική αντιστοίχιση και δημοσίευση παραμένει platform approval.</p></div></section><VendorCatalogClient initial={await vendorCatalogWorkspace(principal)} /></main>; }
