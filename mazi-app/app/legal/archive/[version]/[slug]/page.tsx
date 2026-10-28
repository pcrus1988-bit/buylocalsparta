import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {legalOrder,legalRecords,legalUrl} from "../../../../../lib/legal-documents";
import {MAZI_ARCHIVED_VERSION,MAZI_ARCHIVED_DATE,archivedRecord,archivedDigest,archiveExportUrl} from "../../../../../lib/legal/legal-archive";
import styles from "../../../legal.module.css";
export const dynamicParams=false;
export function generateStaticParams(){return legalOrder.map(slug=>({version:MAZI_ARCHIVED_VERSION,slug}));}
export async function generateMetadata({params}:{params:Promise<{version:string;slug:string}>}):Promise<Metadata>{
 const {version,slug}=await params;const doc=archivedRecord(version,slug);
 if(!doc)return {title:"Μη διαθέσιμη έκδοση · ΜΑΖΙ",robots:{index:false,follow:false}};
 return {title:`Ιστορική έκδοση ${MAZI_ARCHIVED_VERSION} · ${doc.title}`,description:`Ακριβές ιστορικό δημοσιευμένο κείμενο ${MAZI_ARCHIVED_DATE} · ${doc.title}`,robots:{index:false,follow:true}};
}
export default async function ArchivedLegalPage({params}:{params:Promise<{version:string;slug:string}>}){
 const {version,slug}=await params;
 const doc=archivedRecord(version,slug);if(!doc)notFound();
 const digest=archivedDigest(doc);
 const item=slug as keyof typeof legalRecords;
 return <main id="content" className={styles.page}>
   <section className={styles.hero}><div className="shell">
    <span className="eyebrow light">ΜΑΖΙ / ΕΠΑΛΗΘΕΥΣΙΜΟ ΙΣΤΟΡΙΚΟ ΕΚΔΟΣΕΩΝ</span>
    <h1>{doc.title}</h1>
    <p>Κλειδωμένο ιστορικό κείμενο έκδοσης {MAZI_ARCHIVED_VERSION}. Η δημοσίευση ή ανάγνωση δεν αποδεικνύει τη συναίνεση ή συμβατική αποδοχή συγκεκριμένου μέλους.</p>
    <div className={styles.heroMeta}><span>Έκδοση: {version} · {MAZI_ARCHIVED_DATE}</span><span>Πηγή: ιστορικό στιγμιότυπο δημοσιευμένης πολιτικής</span></div>
   </div></section>
   <div className={`shell ${styles.layout}`}>
    <nav className={styles.side} aria-label="Ιστορικές πολιτικές">
     <Link className={styles.indexLink} href="/legal">← Νομικό Κέντρο</Link>
     <Link href={legalUrl(item)}>Τρέχουσα πολιτική</Link>
     <Link href="/legal/changes">Ιστορικό εκδόσεων</Link>
     <Link href={archiveExportUrl(item)}>Λήψη πλήρους ιστορικού κειμένου (.txt)</Link>
    </nav>
    <article className={styles.article}>
     <p className={styles.notice}><strong>Ιστορική έκδοση · όχι νέα αποδοχή:</strong> Η έκδοση αποθηκεύθηκε για τεκμηρίωση της δημοσιευμένης διατύπωσης. Μόνο πραγματική ατομική διαδικασία αποδοχής μπορεί να τεκμηριώσει ότι ο συγκεκριμένος συμβαλλόμενος δεσμεύθηκε από ορισμένη έκδοση.</p>
     <div className={styles.toc}><strong>Περιεχόμενα</strong><ol>{doc.sections.map((section,i)=><li key={section.heading}><a href={`#archive-${i+1}`}>{section.heading}</a></li>)}</ol></div>
     {doc.sections.map((section,i)=><section className={styles.section} id={`archive-${i+1}`} key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph,j)=><p key={j}>{paragraph}</p>)}</section>)}
     <aside className={styles.sources}>
      <h2>Αποτύπωμα περιεχομένου</h2>
      <p>SHA-256 του κανονικοποιημένου JSON της ιστορικής πολιτικής: <code>{digest}</code></p>
      <p>Το αποτύπωμα επιτρέπει την επαλήθευση ακεραιότητας αυτού του κειμένου. Δεν αποτελεί ψηφιακή υπογραφή, βεβαίωση νομικής συμμόρφωσης ή απόδειξη της αποδοχής από μέλος.</p>
      <Link href={archiveExportUrl(item)}>Λήψη κειμένου UTF-8</Link>
     </aside>
    </article>
   </div>
  </main>;
}
