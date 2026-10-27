import Link from "next/link";
import { legalRecords, legalOrder, legalUrl, LEGAL_DATE, type LegalSlug } from "../../lib/legal-documents";
import styles from "./legal.module.css";
import {MAZI_LEGAL_ADDENDA,MAZI_LEGAL_ADDENDUM_VERSION} from "../../lib/mazi-legal-addenda-v2";
export function LegalView({slug}: {slug:LegalSlug}) {
 const doc=legalRecords[slug];
 const sections=[...doc.sections,...(MAZI_LEGAL_ADDENDA[slug]??[])];
 return <main id="content" className={styles.page}>
   <section className={styles.hero}><div className="shell">
     <span className="eyebrow light">ΜΑΖΙ · ΝΟΜΙΚΗ ΤΕΚΜΗΡΙΩΣΗ / {doc.eyebrow}</span>
     <h1>{doc.title}</h1><p>{doc.summary}</p>
     <div className={styles.heroMeta}><span>Κωδικοποίηση 2.0 · {LEGAL_DATE} · {MAZI_LEGAL_ADDENDUM_VERSION}</span><span>{doc.status==="proposed"?"Κανονισμός του οικονομικού προγράμματος · εξατομικευμένη αποδοχή πριν από χρέωση":"Δημοσιευμένη ενημέρωση για την τρέχουσα πιλοτική χρήση"}</span></div>
   </div></section>
   <div className={`shell ${styles.layout}`}>
    <nav aria-label="Νομικές ενότητες" className={styles.side}>
      <Link href="/legal" className={styles.indexLink}>← Όλα τα νομικά κείμενα</Link>
      {legalOrder.map(key=><Link key={key} href={legalUrl(key)} aria-current={key===slug?"page":undefined} className={key===slug?styles.active:undefined}>{legalRecords[key].title}</Link>)}
      <Link href="/invitation-terms">Ισχύοντες όροι μη οικονομικής πρόσκλησης</Link>
    </nav>
    <article className={styles.article}>
      <p className={styles.notice}><strong>Σημαντική διάκριση:</strong> Η τρέχουσα πρόσκληση παρέχει μόνο μη οικονομική πιλοτική πρόσβαση. Οι προτεινόμενες οικονομικές ρήτρες δεν αποτελούν ενεργή σύμβαση, συνδρομή ή ενεργοποίηση του Ταμείου. Απαιτούνται νομική/φοροτεχνική έγκριση και χωριστή ρητή αποδοχή.</p>
      <div className={styles.toc}><strong>Περιεχόμενα</strong><ol>{sections.map((section,i)=><li key={section.heading}><a href={`#article-${i+1}`}>{section.heading}</a></li>)}</ol></div>
      {doc.sections.map((section,i)=><section className={styles.section} id={`article-${i+1}`} key={section.heading}>
        <h2>{section.heading}</h2>{section.paragraphs.map((paragraph,j)=><p key={j}>{paragraph}</p>)}
      </section>)}
      <aside className={styles.sources}>
        <h2>Νομοθετικές και επιχειρησιακές αναφορές</h2>
        <p>Η πραγματική πιλοτική πρόσκληση παραμένει μη οικονομική. Οι οικονομικές συμβάσεις ενεργοποιούνται μόνο με ξεχωριστή, καταγεγραμμένη αποδοχή. Η πολιτική διαγραφής δεν ισχυρίζεται ανεπιβεβαίωτη παραγωγική αυτοματοποίηση.</p>
        <a href="https://www.dpa.gr/el/enimerwtiko/nomothesia/proswpikon_dedomenon" target="_blank" rel="noopener noreferrer">Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα</a>
        <a href="https://www.aade.gr/exypiretisi-enimerosi/hristikoi-odigoi/enarxi-epiheirimatikis-drastiriotitas/tirisi-logistikon-arheion-biblion" target="_blank" rel="noopener noreferrer">ΑΑΔΕ · Λογιστικά αρχεία</a>
        <a href="https://kontamou.site/hubs/join" target="_blank" rel="noopener noreferrer">KONTA ΜΟΥ · επίσημος πίνακας HUB PRO</a>
        <a href="https://eur-lex.europa.eu/eli/reg/2016/679/oj" target="_blank" rel="noopener noreferrer">ΓΚΠΔ · Κανονισμός (ΕΕ) 2016/679</a>
        <a href="https://eur-lex.europa.eu/eli/reg/2022/2065/oj" target="_blank" rel="noopener noreferrer">Κανονισμός Ψηφιακών Υπηρεσιών (DSA)</a>
        <a href="https://www.aade.gr/sites/default/files/2026-04/n.5144_2024.pdf" target="_blank" rel="noopener noreferrer">Ν. 5144/2024 · Άρθρο 16, κουπόνια και ΦΠΑ</a>
        <a href="mailto:info@kontamou.site">info@kontamou.site</a>
      </aside>
    </article>
   </div>
 </main>;
}
