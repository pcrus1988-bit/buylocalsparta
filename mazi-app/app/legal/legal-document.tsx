import Link from "next/link";
import { legalRecords, legalOrder, legalUrl, LEGAL_DATE, type LegalSlug } from "../../lib/legal-documents";
import styles from "./legal.module.css";
export function LegalView({slug}: {slug:LegalSlug}) {
 const doc=legalRecords[slug];
 return <main id="content" className={styles.page}>
   <section className={styles.hero}><div className="shell">
     <span className="eyebrow light">ΜΑΖΙ · ΝΟΜΙΚΗ ΤΕΚΜΗΡΙΩΣΗ / {doc.eyebrow}</span>
     <h1>{doc.title}</h1><p>{doc.summary}</p>
     <div className={styles.heroMeta}><span>Έκδοση 1.1 · {LEGAL_DATE}</span><span>{doc.status==="proposed"?"Προτεινόμενο πλαίσιο · απαιτεί νομική έγκριση":"Δημοσιευμένη ενημέρωση για την τρέχουσα πιλοτική χρήση"}</span></div>
   </div></section>
   <div className={`shell ${styles.layout}`}>
    <nav aria-label="Νομικές ενότητες" className={styles.side}>
      <Link href="/legal" className={styles.indexLink}>← Όλα τα νομικά κείμενα</Link>
      {legalOrder.map(key=><Link key={key} href={legalUrl(key)} aria-current={key===slug?"page":undefined} className={key===slug?styles.active:undefined}>{legalRecords[key].title}</Link>)}
      <Link href="/invitation-terms">Ισχύοντες όροι μη οικονομικής πρόσκλησης</Link>
    </nav>
    <article className={styles.article}>
      <p className={styles.notice}><strong>Σημαντική διάκριση:</strong> Η τρέχουσα πρόσκληση παρέχει μόνο μη οικονομική πιλοτική πρόσβαση. Οι προτεινόμενες οικονομικές ρήτρες δεν αποτελούν ενεργή σύμβαση, συνδρομή ή ενεργοποίηση του Ταμείου. Απαιτούνται νομική/φοροτεχνική έγκριση και χωριστή ρητή αποδοχή.</p>
      <div className={styles.toc}><strong>Περιεχόμενα</strong><ol>{doc.sections.map((section,i)=><li key={section.heading}><a href={`#article-${i+1}`}>{section.heading}</a></li>)}</ol></div>
      {doc.sections.map((section,i)=><section className={styles.section} id={`article-${i+1}`} key={section.heading}>
        <h2>{section.heading}</h2>{section.paragraphs.map((paragraph,j)=><p key={j}>{paragraph}</p>)}
      </section>)}
      <aside className={styles.sources}>
        <h2>Νομοθετικές και επιχειρησιακές αναφορές</h2>
        <p>Οι τελικές προθεσμίες, οι εμπορικές συμβάσεις και τα συστήματα διαγραφής πρέπει να ελεγχθούν από αρμόδιο επαγγελματία και από τα πραγματικά τεχνικά αρχεία πριν από ενεργοποίηση.</p>
        <a href="https://www.dpa.gr/el/enimerwtiko/nomothesia/proswpikon_dedomenon" target="_blank" rel="noopener noreferrer">Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα</a>
        <a href="https://www.aade.gr/exypiretisi-enimerosi/hristikoi-odigoi/enarxi-epiheirimatikis-drastiriotitas/tirisi-logistikon-arheion-biblion" target="_blank" rel="noopener noreferrer">ΑΑΔΕ · Λογιστικά αρχεία</a>
        <a href="https://kontamou.site/hubs/join" target="_blank" rel="noopener noreferrer">KONTA ΜΟΥ · επίσημος πίνακας HUB PRO</a>
        <a href="mailto:info@kontamou.site">info@kontamou.site</a>
      </aside>
    </article>
   </div>
 </main>;
}
