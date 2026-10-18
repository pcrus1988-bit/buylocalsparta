import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../../components/AdminWorkspaceHeader";
import { ResearchSurveyAdminNav } from "../../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../../lib/admin-session";
import { researchKadCoverageAudit } from "../../../../../../../lib/research-kad-analysis-audit";
import { SECTOR_LABELS } from "../../../../../../../lib/research-geographic-relations-runtime";

export const metadata: Metadata = {
  title: "Admin · ΚΑΔ & Κλάδος · Ερευνητική κάλυψη",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";
const format = (n: number) => n.toLocaleString("el-GR");
const percent = (n:number,total:number)=>total?((n/total)*100).toLocaleString("el-GR",{maximumFractionDigits:1})+"%":"—";

export default async function ResearchKadAuditPage({params}:{
  params:Promise<{slug:string}>
}) {
  const principal=await getAdminSession();
  if(!principal) redirect("/admin/login");
  if(!hasAdminPermission(principal,"research.read")) redirect("/admin");
  const {slug}=await params;
  const data=await researchKadCoverageAudit(principal,slug);
  if(!data) notFound();
  const root="/admin/research/surveys/"+encodeURIComponent(slug);
  const full=data.immutableContextFrozen===data.total &&
    data.matchedKadPresent===data.total && data.fullActivityCodesPresent===data.total;
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken}
      entityLabel="Research · ΚΑΔ data governance"/>
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">KONTA MOY · Retail Observatory</div>
      <h1>Κάλυψη Κλάδων / ΚΑΔ &amp; Διατήρηση για ανάλυση</h1>
      <p className="lead">Ελέγχουμε εάν κάθε απάντηση παραμένει ταξινομήσιμη και
        μετά την αποσύνδεση των προσκλήσεων από τα στοιχεία επιχειρήσεων.</p>
      <div className="hero-actions">
        <Link className="button button-secondary" prefetch={false} href={root+"/kad"}>Πλαίσιο πληθυσμού</Link>
        <Link className="button button-secondary" prefetch={false} href={root+"/map/distribution"}>Χάρτης απαντήσεων</Link>
        <Link className="button button-secondary" prefetch={false} href={root+"/map/relations"}>Συσχετισμοί</Link>
      </div>
    </div></section>
    <ResearchSurveyAdminNav slug={slug} current="kad"/>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Απογραφή πραγματικών απαντήσεων"
        title="Κάλυψη ΚΑΔ στις συμμετοχές"
        note="Η πηγή είναι το παγωμένο ΓΕΜΗ frame, όχι νέα απάντηση του συμμετέχοντα."/>
      <div className="analytics-workflow-grid">
        {([
          ["Μη αποσυρμένες συμμετοχές",data.total],
          ["Οριστικές απαντήσεις",data.completed],
          ["Απαντήσεις σε εξέλιξη",data.inProgress],
          ["Κλάδος διαθέσιμος",data.sectorPresent],
          ["Σχετικοί ΚΑΔ διαθέσιμοι",data.matchedKadPresent],
          ["Πλήρης λίστα ΚΑΔ ΓΕΜΗ",data.fullActivityCodesPresent],
          ["Σε αμετάβλητο αρχείο ανά συμμετοχή",data.immutableContextFrozen],
          ["Ακόμη συνδεδεμένοι με το πλαίσιο",data.currentFrameLinked]
        ] as const).map(([label,count])=>
          <article key={label} className="analytics-workflow-card">
            <span>{label}</span>
            <strong style={{fontSize:"1.5rem"}}>{format(count)}</strong>
            <small>{percent(count,data.total)} των μη αποσυρμένων</small>
          </article>)}
      </div>
      <div className="workspace-inline-note" role="status" style={{marginTop:18}}>
        <strong>{full?"Έτοιμο για διατήρηση αναλυτικών μεταβλητών.":"Χρειάζεται συμπλήρωση της αρχειοθέτησης."}</strong>
        {" "}Η κρυπτογράφηση και η διαγραφή στοιχείων επικοινωνίας δεν συνεπάγονται
        διαγραφή των επιστημονικών μεταβλητών, αλλά η επεξεργασία τους παραμένει
        υπό την πολιτική διατήρησης και τα δικαιώματα των υποκειμένων.
        Η καταστροφή ταυτοποιητικών συνδέσεων επιτρέπεται μόνο αφού αποθηκευτούν
        οι απαιτούμενες ταξινομήσεις και επαληθευτεί η κάλυψη.
      </div>
      <p className="research-relation-small-note">
        Εξαιρούνται από όλες τις αναλύσεις {format(data.withdrawnExcluded)} αποσυρμένες συμμετοχές.
        Δεν τεκμαίρεται ότι ο πρώτος ΚΑΔ είναι κύριος. Μία επιχείρηση μπορεί να
        ανήκει σε πολλαπλές 4-ψήφιες ή 8-ψήφιες ΚΑΔ ομάδες.
      </p>
    </section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Αξιοπιστία μεταβλητών"
        title="Πηγή, ταξινομία και έκδοση"
        note="Προέλευση: frozen GEMI frame κατά την πρόσκληση. Οι εκδόσεις παγιώνονται και δεν αντικαθίστανται σιωπηρά."/>
      <table className="workspace-table">
        <thead><tr><th>Ταξινομία</th><th>Πηγή</th><th style={{textAlign:"right"}}>Ερωτηματολόγια</th></tr></thead>
        <tbody>{data.classificationVersions.map(x=><tr key={x.version+":"+x.source}>
          <td>{x.version}</td><td>{x.source}</td><td style={{textAlign:"right"}}>{format(x.count)}</td>
        </tr>)}</tbody>
      </table>
      <div className="workspace-inline-note" style={{marginTop:12}}>
        <strong>Μεθοδολογική επιφύλαξη:</strong> Ο Κλάδος είναι μονοτιμή,
        κανόνας κατάταξης για το δείγμα· οι ΚΑΔ του ΓΕΜΗ είναι πολλαπλές
        δραστηριότητες. Δεν έχουμε ανεξάρτητη επιβεβαίωση του σημερινού
        κύριου ΚΑΔ από τον συμμετέχοντα. Για μελλοντικές αλλαγές ταξινομίας
        διατηρείται και η αρχική πλήρης λίστα ΓΕΜΗ με τον αρχικό κανόνα έκδοσης.
      </div>
    </section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ανά τομέα και ΚΑΔ"
        title="Πληρότητα και κατανομή μεταξύ συμμετεχόντων"
        note="Οι μετρήσεις είναι ενδεικτικές για όσους ανταποκρίθηκαν, όχι αντιπροσωπευτικά ποσοστά του κλάδου."/>
      {!data.exactSmallCells ? <p className="workspace-inline-note">
        Η αναλυτική κατάτμηση ανά κλάδο και ΚΑΔ εμφανίζεται μόνο σε
        εξουσιοδοτημένους αναλυτές της έρευνας, ώστε να αποφεύγεται η
        ανακατασκευή μικρών ομάδων με αφαιρέσεις.
      </p> : <>
        <h3>Επιχειρήσεις ανά κλάδο</h3>
        <table className="workspace-table">
          <thead><tr><th>Κλάδος</th><th>Συμμετοχές</th><th>Οριστικές</th><th>ΚΑΔ διαθέσιμοι</th><th>Αποθηκευμένες ταξινομήσεις</th></tr></thead>
          <tbody>{data.sectors.map(s=><tr key={s.sector}>
            <td>{SECTOR_LABELS[s.sector]??s.sector}</td>
            <td>{format(s.total)}</td><td>{format(s.completed)}</td>
            <td>{format(s.hasMatchedKad)}</td><td>{format(s.frozen)}</td>
          </tr>)}</tbody>
        </table>
        <h3>4-ψήφιες οικογένειες ΚΑΔ (πολλαπλή συμμετοχή)</h3>
        <table className="workspace-table">
          <thead><tr><th>Οικογένεια ΚΑΔ</th><th>Συμμετοχές με τη δραστηριότητα</th></tr></thead>
          <tbody>{data.kadFourDigit.map(x=><tr key={x.code}>
            <td>{x.code}</td><td>{x.respondents===null?"Μικρή ομάδα":format(x.respondents)}</td>
          </tr>)}</tbody>
        </table>
        <p className="research-relation-small-note">Μία επιχείρηση μπορεί να εμφανίζεται σε
          περισσότερες οικογένειες ΚΑΔ. Οι μικρές ομάδες δεν
          τεκμηριώνουν γενικεύσιμα συμπεράσματα και δεν δημοσιεύονται ατομικά.</p>
      </>}
    </section>
  </main>;
}
