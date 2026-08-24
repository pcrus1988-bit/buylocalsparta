import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorAdviceClient } from "../../../components/VendorAdviceClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { synchronizeOperationalEvents, vendorAdviceWorkspace } from "../../../lib/vendor-backoffice-service";
import { vendorAskLocalRichContext } from "../../../lib/vendor-ask-local-rich-context";

export const metadata: Metadata = { title: "Vendor Advice", robots: { index: false, follow: false } };

export default async function VendorAdvicePage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  synchronizeOperationalEvents();
  const [workspace, richRequests] = await Promise.all([
    vendorAdviceWorkspace(principal),
    vendorAskLocalRichContext(principal)
  ]);
  const normalized = {
    ...workspace,
    appointments: workspace.appointments.map((appointment) => ({
      ...appointment,
      status: ["pending", "confirmed", "rescheduled"].includes(String(appointment.status)) ? "booked" : appointment.status
    }))
  };
  const richEvidence = richRequests.filter((request) => request.voiceTranscript || request.barcode || request.referenceImageDataUrl);

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Customer care</div><h1>Συμβουλές & αιτήματα</h1><p className="lead">Μηνύματα, ραντεβού και Ask Local για το δικό σου κατάστημα — οργανωμένα γύρω από ό,τι χρειάζεται απάντηση.</p></div></section>
    {richEvidence.length ? <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ask Local 2.0" title="Φωτογραφίες, barcode & φωνητικές σημειώσεις" note="Αυτό το υλικό είναι ιδιωτικό και εμφανίζεται μόνο επειδή το αίτημα έχει ανατεθεί στο κατάστημά σου. Χρησιμοποίησέ το αποκλειστικά για να αναγνωρίσεις και να εξυπηρετήσεις το αίτημα." />
      <div className="workspace-queue-list">{richEvidence.map((request) => <article className="workspace-queue-card" key={request.id}>
        <div className="workspace-queue-head"><div><strong>{request.need}</strong><small>{request.referenceNumber} · {new Date(request.createdAt).toLocaleString("el-GR")}</small></div><span className="status-pill">{request.captureSource ?? "rich"}</span></div>
        {request.referenceImageDataUrl ? <div className="ask-local-context"><Image src={request.referenceImageDataUrl} alt={`Ιδιωτική φωτογραφία αναφοράς ${request.referenceNumber}`} width={420} height={315} unoptimized /></div> : null}
        <div className="workspace-compact-list">
          {request.barcode ? <div className="workspace-compact-row"><strong>Barcode / μοντέλο</strong><span>{request.barcode}</span><small>Επιβεβαίωσέ το πριν βασιστείς στην ταυτοποίηση.</small></div> : null}
          {request.voiceTranscript ? <div className="workspace-compact-row"><strong>Φωνητική σημείωση</strong><span>{request.voiceTranscript}</span></div> : null}
        </div>
        <a className="button" href="/daily">Απάντηση στο Daily</a>
      </article>)}</div>
    </section> : null}
    <VendorAdviceClient initial={normalized} />
  </main>;
}
