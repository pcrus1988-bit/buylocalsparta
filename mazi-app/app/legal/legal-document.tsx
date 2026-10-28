import Link from "next/link";
import {legalRecords,legalOrder,legalRelations,legalUrl,LEGAL_DATE,LEGAL_VERSION,type LegalSlug} from "../../lib/legal-documents";
import styles from "./legal.module.css";
import {legalSourceMap} from "../../lib/legal/v31-sources";
const policyRoute=/^(\/legal\/[a-z]+|\/privacy|\/terms|\/invitation-terms|\/marketplace\/rules|\/services\/catalogue|\/hubs\/join)$/;
const policySplit=/(\/legal\/[a-z]+|\/privacy|\/terms|\/invitation-terms|\/marketplace\/rules|\/services\/catalogue|\/hubs\/join)/g;
function LinkedParagraph({value}:{value:string}){
 return <p>{value.split(policySplit).map((fragment,i)=>policyRoute.test(fragment)?
  <Link key={i} href={fragment==="/hubs/join"?"https://kontamou.site/hubs/join":fragment}>{fragment}</Link>:fragment)}</p>;
}
export function LegalView({slug}:{slug:LegalSlug}){
 const doc=legalRecords[slug];
 const sections=doc.sections;
 const current=doc.status==="current";
 return <main id="content" className={styles.page}>
  <section className={styles.hero}><div className="shell">
   <span className="eyebrow light">ΜΑΖΙ · ΝΟΜΙΚΗ ΤΕΚΜΗΡΙΩΣΗ / {doc.eyebrow}</span>
   <h1>{doc.title}</h1><p>{doc.summary}</p>
   <div className={styles.heroMeta}>
    <span>Κωδικοποίηση 3.1 · {LEGAL_DATE} · {LEGAL_VERSION}</span>
    <span>{current?"Κανόνες και ενημέρωση τρέχουσας λειτουργίας":"Ειδικό πλαίσιο πληρωμένης συμμετοχής · εφαρμογή μετά από ατομική αποδοχή"}</span>
   </div>
  </div></section>
  <div className={`shell ${styles.layout}`}>
   <nav aria-label="Νομικές ενότητες" className={styles.side}>
    <Link href="/legal" className={styles.indexLink}>← Όλα τα νομικά κείμενα</Link>
    {legalOrder.map(key=><Link key={key} href={legalUrl(key)} aria-current={key===slug?"page":undefined} className={key===slug?styles.active:undefined}>{legalRecords[key].title}</Link>)}
    <Link href="/invitation-terms">Ισχύοντες όροι μη οικονομικής πρόσκλησης</Link>
    <Link href="/marketplace/rules">Ειδικοί B2B όροι Marketplace</Link>
   </nav>
   <article className={styles.article}>
    <p className={styles.notice}><strong>{current?"Τρέχουσα εφαρμογή:":"Συμβατική ενεργοποίηση:"}</strong> {slug==="retention"?
      "Η προστασία των δεδομένων και η αρχή χρονικού περιορισμού ισχύουν ήδη για τον πιλοτικό λογαριασμό. Η δημοσίευση προθεσμιών δεν αποδεικνύει ότι έχει ολοκληρωθεί η επαλήθευση κάθε εργασίας εκκαθάρισης.":
      current?"Οι κανόνες χρήσης και η υποχρεωτική ενημέρωση ισχύουν κατά το πραγματικό πεδίο της τρέχουσας υπηρεσίας. Για την πιλοτική πρόσκληση εφαρμοστέα παραμένει η χωριστά αποδεκτή έκδοση /invitation-terms.":
      "Το παρόν κείμενο ρυθμίζει αποκλειστικά το αντίστοιχο αντικείμενο της πληρωμένης λειτουργίας. Η υπάρχουσα μη οικονομική πρόσκληση δεν χρεώνεται ούτε ενεργοποιεί οικονομική υποχρέωση ή ενίσχυση. Απαιτείται χωριστή ατομική αποδοχή και νόμιμη έναρξη."}</p>
    <div className={styles.toc}><strong>Περιεχόμενα</strong><ol>{sections.map((section,i)=><li key={section.heading}><a href={`#article-${i+1}`}>{section.heading}</a></li>)}</ol></div>
    {sections.map((section,i)=><section className={styles.section} id={`article-${i+1}`} key={section.heading}>
     <h2>{section.heading}</h2>{section.paragraphs.map((paragraph,j)=><LinkedParagraph key={j} value={paragraph}/>)}
    </section>)}
    <aside className={styles.sources}>
     <h2>Σχετικές πολιτικές</h2>
     <p>Οι λεπτομέρειες κάθε διαφορετικού αντικειμένου ορίζονται στο αντίστοιχο ειδικό κείμενο. Η παραπομπή δεν δημιουργεί νέα αυτόματη χρέωση ή αναδρομική αποδοχή.</p>
     {legalRelations[slug].map(key=><Link key={key} href={legalUrl(key)}>{legalRecords[key].title}</Link>)}
     {slug==="terms"||slug==="community"||slug==="compliance"?<Link href="/marketplace/rules">Ειδικοί όροι B2B αγοράς φυσικών ειδών</Link>:null}
     {slug==="terms"||slug==="membership"||slug==="compliance"?<Link href="/invitation-terms">Ενεργή έκδοση όρων πιλοτικής πρόσκλησης</Link>:null}
    </aside>
    <aside className={styles.sources}>
     <h2>Νομοθετικές πηγές της συγκεκριμένης πολιτικής</h2>
     <p>Οι παρακάτω επίσημες ή νομοθετικές παραπομπές αφορούν το συγκεκριμένο αντικείμενο. Η εφαρμογή τους εξαρτάται από τη φύση της υπηρεσίας και τα πραγματικά περιστατικά.</p>
     {legalSourceMap[slug].map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>)}
     <Link href="/legal/report">Αναφορά περιεχομένου, ένσταση ή GDPR αίτημα</Link><a href="mailto:info@kontamou.site">info@kontamou.site</a>
    </aside>
   </article>
  </div>
 </main>;
}
