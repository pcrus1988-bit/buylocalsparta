import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { getAccountSession } from "../../../lib/account-session";
import { listCustomerBuildStudioDocuments } from "../../../lib/build-studio-project-documents";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Τα Έγγραφά μου", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountDocumentsPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/documents");
  const documents = await listCustomerBuildStudioDocuments(principal.userId);

  return (
    <main className="account-app">
      <div className="announcement">Τα ιδιωτικά έγγραφα και οι οδηγοί έργων σου, σε ένα σημείο.</div>
      <SiteHeader compact />
      <AccountSectionNavigation />

      <section className={styles.shell}>
        <div className={styles.hero}>
          <span>Ο ΛΟΓΑΡΙΑΣΜΟΣ ΜΟΥ · ΙΔΙΩΤΙΚΟ ΑΡΧΕΙΟ</span>
          <h1>Τα Έγγραφά μου</h1>
          <p>
            Εδώ αποθηκεύονται τα snapshots των οδηγών που δημιούργησες στο Paint & Build Studio.
            Κάθε οδηγός κρατά το έργο, το επαληθευμένο προϊόν και την τεχνική καθοδήγηση όπως ήταν τη στιγμή της αποθήκευσης.
          </p>
          <Link href="/paint-and-build-studio">Νέο Paint & Build έργο →</Link>
        </div>

        {documents.length ? (
          <div className={styles.grid}>
            {documents.map((document) => (
              <article className={styles.card} id={`document-${document.id}`} key={document.id}>
                <div className={styles.cardMeta}>
                  <span>PAINT & BUILD PROJECT GUIDE</span>
                  <time dateTime={document.createdAt}>
                    {new Date(document.createdAt).toLocaleDateString("el-GR", { day: "2-digit", month: "long", year: "numeric" })}
                  </time>
                </div>
                <h2>{document.title}</h2>
                <p><strong>{document.brandName}</strong> · {document.productName}</p>
                <small>Scenario: {document.scenarioKey}</small>
                <div className={styles.actions}>
                  <a href={`/api/account/documents/${document.id}/pdf`}>Λήψη PDF</a>
                  <Link href="/paint-and-build-studio">Νέο έργο</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <span>ΔΕΝ ΥΠΑΡΧΟΥΝ ΑΚΟΜΗ ΕΓΓΡΑΦΑ</span>
            <h2>Ο πρώτος οδηγός σου θα εμφανιστεί εδώ.</h2>
            <p>Ολοκλήρωσε ένα έργο στο Paint & Build Studio, επίλεξε επαληθευμένο προϊόν και πάτησε «Αποθήκευση στα Έγγραφά μου».</p>
            <Link href="/paint-and-build-studio">Άνοιξε το Paint & Build Studio →</Link>
          </div>
        )}
      </section>
    </main>
  );
}
