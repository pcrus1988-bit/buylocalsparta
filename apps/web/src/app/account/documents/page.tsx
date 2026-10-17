import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { listPaintBuildDocuments } from "../../../lib/paint-build-project-documents";

export const metadata: Metadata = { title: "Τα Έγγραφά μου", robots: { index: false, follow: false } };

const date = (value: string) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function projectTypeLabel(value: string): string {
  if (value === "paint") return "Βαφή";
  if (value === "waterproofing") return "Στεγανοποίηση";
  if (value === "insulation") return "Θερμομόνωση";
  if (value === "repair") return "Επισκευή";
  return value;
}

function DocumentIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/>
    <path d="M14 2v6h5M9 13h6M9 17h6"/>
  </svg>;
}

export default async function AccountDocumentsPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/documents");
  const documents = await listPaintBuildDocuments(principal);

  return <main className="account-app">
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page account-documents-page">
      <div className="customer-page-heading">
        <div><div className="eyebrow">Paint & Build Studio · Το αρχείο σου</div><h1>Τα έγγραφά μου</h1></div>
        <p>Φύλαξε και ξανακατέβασε τους οδηγούς PDF που έχεις δημιουργήσει για τα έργα σου.</p>
      </div>
      <div className="account-documents-toolbar">
        <div className="account-documents-total"><span className="account-documents-icon"><DocumentIcon /></span><div><strong>{documents.length}</strong><small>{documents.length === 1 ? "αποθηκευμένος οδηγός" : "αποθηκευμένοι οδηγοί"}</small></div></div>
        <Link className="button button-secondary" href="/paint-and-build-studio">＋ Νέος οδηγός</Link>
      </div>
      {documents.length ? <div className="account-documents-grid" aria-label="Αποθηκευμένοι οδηγοί έργων">
        {documents.map((document) => <article className="account-document-card" key={document.id}>
          <div className="account-document-card-top"><span className="account-documents-icon"><DocumentIcon /></span><span className="account-document-type">{projectTypeLabel(document.projectType)}</span></div>
          <h2>{document.projectName}</h2>
          <p>Οδηγός Paint & Build με τις οδηγίες και τα προϊόντα όπως καταγράφηκαν κατά τη δημιουργία του.</p>
          <small>Δημιουργήθηκε {date(document.createdAt)}</small>
          <a className="button account-document-download" href={`/api/account/documents/${encodeURIComponent(document.id)}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/></svg>
            Λήψη PDF
          </a>
        </article>)}
      </div> : <div className="account-documents-empty">
        <span className="account-documents-icon"><DocumentIcon /></span>
        <h2>Εδώ θα εμφανιστούν οι οδηγοί σου</h2>
        <p>Δημιούργησε έναν οδηγό PDF στο Paint & Build Studio ενώ είσαι συνδεδεμένος, ώστε να αποθηκευτεί στον λογαριασμό σου.</p>
        <Link className="button" href="/paint-and-build-studio">Άνοιγμα Paint & Build Studio</Link>
      </div>}
    </section>
  </main>;
}
