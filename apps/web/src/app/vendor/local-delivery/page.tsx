import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";
import { hasVendorCapability } from "@buy-local-sparta/core";
import { updateVendorLocalDelivery, vendorLocalDeliveryWorkspace } from "../../../lib/vendor-self-governed-service";

export const metadata: Metadata = { title: "Τοπική παράδοση HUB", robots: { index: false, follow: false } };

async function saveDelivery(formData: FormData) {
  "use server";
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const prefixes = String(formData.get("postcodePrefixes") ?? "")
    .split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
  await updateVendorLocalDelivery(principal, { active: formData.get("active") === "on", postcodePrefixes: prefixes });
  revalidatePath("/vendor/local-delivery");
}

export default async function VendorLocalDeliveryPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const context = await vendorOperatingContextForPrincipal(principal);
  if (!hasVendorCapability(context, "local_delivery.manage")) redirect("/vendor");
  const workspace = await vendorLocalDeliveryWorkspace(principal);
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">SELF_GOVERNED HUB</div><h1>Τοπική παράδοση</h1>
      <p className="lead">Όρισε την πραγματική γεωγραφική κάλυψη της δικής σου τοποθεσίας. Οι κανόνες χρέωσης και η πλατφορμική πολιτική παραμένουν ξεχωριστά.</p></div>
      <aside className="dashboard-health-card"><span>HUB</span><strong>{workspace.hubId ?? workspace.marketId}</strong><p>{workspace.active ? "Η δική σου ζώνη είναι ενεργή." : "Η δική σου ζώνη είναι ανενεργή."}</p></aside>
    </section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Κάλυψη" title="Ταχυδρομικοί κώδικες" note="Χρησιμοποίησε πλήρεις ΤΚ ή prefixes 2–5 ψηφίων. Η ρύθμιση εφαρμόζεται μόνο στο δικό σου κατάστημα και location." />
      <WorkspaceHowItWorks>
        <p><strong>Ενεργό:</strong> το κατάστημα δηλώνει ότι μπορεί να εξυπηρετήσει local delivery στις παρακάτω περιοχές.</p>
        <p><strong>ΤΚ:</strong> γράψε π.χ. 24100, 24101 ή μικρότερο prefix όταν θέλεις ευρύτερη κάλυψη.</p>
        <p><strong>Checkout:</strong> η τελική διαθεσιμότητα εξακολουθεί να ελέγχει προϊόν, location και πλατφορμικούς κανόνες.</p>
      </WorkspaceHowItWorks>
      <form action={saveDelivery} className="workspace-tool-panel" style={{padding:"1rem"}}>
        <label style={{display:"flex",gap:".6rem",alignItems:"center",marginBottom:"1rem"}}><input type="checkbox" name="active" defaultChecked={workspace.active} /> Ενεργοποίηση δικής μου local-delivery ζώνης</label>
        <label style={{display:"grid",gap:".45rem"}}><strong>ΤΚ / prefixes</strong><textarea name="postcodePrefixes" rows={5} defaultValue={workspace.postcodePrefixes.join(", ")} placeholder="24100, 24101, 24102" /></label>
        <div style={{marginTop:"1rem"}}><button className="button" type="submit">Αποθήκευση κάλυψης</button></div>
      </form>
    </section>
  </main>;
}
