import type { Metadata } from "next";
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

export default async function AccountDocumentsPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/documents");
  const documents = await listPaintBuildDocuments(principal);

  return <main className="account-app">
    <div className="announcement">Οι αναλυτικοί οδηγοί έργων σου αποθηκεύονται ιδιωτικά στον λογαριασμό σου.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page">
      <div className="customer-page-heading">
        <div><div className="eyebrow">Το αρχείο σου</div><h1>Τα Έγγραφά μου</h1></div>
        <p>Κάθε Paint & Build PDF κρατά το ακριβές snapshot οδηγιών και προϊόντων που ίσχυε όταν δημιουργήθηκε.</p>
      </div>
    </section>
    <section className="shell customer-order-directory" aria-label="Αποθηκευμένα έγγραφα">
      {documents.length ? documents.map((document) => <article className="customer-order-card" key={document.id}>
        <div className="customer-order-card-head">
          <div>
            <strong>{document.projectName}</strong>
            <small>{date(document.createdAt)} · {projectTypeLabel(document.projectType)}</small>
          </div>
          <span className="customer-order-card-status">Paint & Build PDF</span>
        </div>
        <p>Αναλυτικός οδηγός έργου με το ιστορικό snapshot τεχνικής καθοδήγησης.</p>
        <div className="customer-order-card-actions">
          <a className="button" href={`/api/account/documents/${encodeURIComponent(document.id)}`}>Λήψη PDF</a>
        </div>
      </article>) : <div className="account-empty">
        <h2>Δεν έχεις ακόμη αποθηκευμένα έγγραφα.</h2>
        <p>Όταν δημιουργήσεις PDF από το Paint & Build Studio ενώ είσαι συνδεδεμένος, θα εμφανιστεί αυτόματα εδώ.</p>
        <a className="button" href="/paint-and-build-studio">Άνοιγμα Paint & Build Studio</a>
      </div>}
    </section>
  </main>;
}
