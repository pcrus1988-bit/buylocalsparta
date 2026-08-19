import type { VendorPlatformInvoiceRow } from "../lib/vendor-platform-invoices";
import { WorkspaceEmptyState,WorkspaceRecordDetails,WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

const euro=(minor:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);
const localDate=(value:string)=>new Date(`${value}T12:00:00+03:00`).toLocaleDateString("el-GR");

export function VendorPlatformInvoicesPanel({invoices}:{invoices:readonly VendorPlatformInvoiceRow[]}){
  return <section className="vendor-section section-tint"><div className="shell">
    <WorkspaceSectionHeading eyebrow="Χρεώσεις KONTA MOY" title="Τιμολόγια προμηθειών & fees" note="Εδώ εμφανίζονται μόνο φορολογικά παραστατικά που έχουν γίνει αποδεκτά από AADE/myDATA και ανήκουν στο δικό σου vendor account."/>
    {invoices.length===0?<WorkspaceEmptyState title="Δεν υπάρχουν ακόμη τιμολόγια KONTA MOY προς το κατάστημά σου." body="Όταν εκδοθεί παραστατικό για commission, listing ή recurring fee και λάβει MARK, θα εμφανιστεί εδώ αυτόματα."/>:<div className="workspace-queue-list">{invoices.map(invoice=><article className="workspace-queue-card" key={invoice.id}>
      <div className="workspace-queue-head"><div><strong>{invoice.documentNumber}</strong><small>{localDate(invoice.issueDate)} · περίοδος {localDate(invoice.periodStart)} – {localDate(invoice.periodEnd)}</small></div><span className="status-pill">AADE accepted</span></div>
      <div className="workspace-queue-primary"><span>Καθαρή {euro(invoice.netMinor)}</span><span>ΦΠΑ {euro(invoice.taxMinor)}</span><span>Σύνολο <strong>{euro(invoice.grossMinor)}</strong></span><span>Συμψηφισμένο {euro(invoice.offsetMinor)}</span></div>
      <WorkspaceRecordDetails label="Fiscal identifiers"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>MARK</strong><span>{invoice.mark}</span></div><div className="workspace-compact-row"><strong>UID</strong><span>{invoice.uid??"—"}</span></div><div className="workspace-compact-row"><strong>Email delivery</strong><span>{invoice.emailStatus}</span></div></div></WorkspaceRecordDetails>
      <div className="workspace-action-bar"><span>{invoice.offsetMinor>0?"Το ποσό συμψηφισμού έχει ήδη ληφθεί υπόψη στην αντίστοιχη εκκαθάριση.":"Δεν έχει καταχωριστεί settlement offset για αυτό το παραστατικό."}</span><div className="workspace-action-buttons"><a className="button button-secondary" href={`/api/vendor/finance/platform-invoices?invoiceId=${encodeURIComponent(invoice.id)}&document=pdf`}>Λήψη PDF</a></div></div>
    </article>)}</div>}
  </div></section>;
}
