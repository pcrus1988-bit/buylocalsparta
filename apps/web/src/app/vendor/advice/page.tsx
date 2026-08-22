import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorAdviceClient } from "../../../components/VendorAdviceClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { synchronizeOperationalEvents, vendorAdviceWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Vendor Advice", robots: { index: false, follow: false } };

export default async function VendorAdvicePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  synchronizeOperationalEvents();
  const workspace = await vendorAdviceWorkspace(principal);
  const normalized = {
    ...workspace,
    appointments: workspace.appointments.map((appointment) => ({
      ...appointment,
      status: ["pending", "confirmed", "rescheduled"].includes(String(appointment.status)) ? "booked" : appointment.status
    }))
  };
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Customer care</div><h1>Συμβουλές & αιτήματα</h1><p className="lead">Μηνύματα, ραντεβού και Ask Local για το δικό σου κατάστημα — οργανωμένα γύρω από ό,τι χρειάζεται απάντηση.</p></div></section>
    <VendorAdviceClient initial={normalized} />
  </main>;
}
