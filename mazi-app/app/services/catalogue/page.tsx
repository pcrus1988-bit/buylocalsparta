import type {Metadata} from "next";
import Link from "next/link";
import {maziPublicServiceCatalogue} from "../../../lib/mazi-services-api";

export const dynamic="force-dynamic";
export const metadata:Metadata={
 title:"250 Tokens υπηρεσιών | ΜΑΖΙ",
 description:"Δες τις επαγγελματικές υπηρεσίες ΜΑΖΙ που μπορούν να ζητούν τα μέλη με 250 μηνιαία Tokens μετά την ενεργοποίηση εξοφλημένης συνδρομής."
};
type Service={id:string;title:string;category:string;description:string;deliverable:string;tokens:number;turnaround_business_days:number;revisions_included:number};

export default async function PublicServiceCatalogue(){
 const response=await maziPublicServiceCatalogue<{services:Service[]}>();
 const error=!response.ok;
 const services=response.ok?response.services:[];
 const categories=[...new Set(services.map(s=>s.category))];
 return <main id="content">
  <section className="subhero"><div className="shell">
   <span className="eyebrow light">ΜΑΖΙ / ΤΑ ΟΦΕΛΗ ΤΩΝ ΜΕΛΩΝ</span>
   <h1>250 Tokens.<br/><em>Υπηρεσίες που χρειάζεσαι.</em></h1>
   <p>Στο μελλοντικό πρόγραμμα πληρωμένης συμμετοχής, κάθε εξοφλημένος μηνιαίος κύκλος παρέχει 250 νέα Tokens για υπηρεσίες κατ’ απαίτηση. Βλέπεις το κόστος πριν από κάθε αίτημα.</p>
   <div style={{display:"flex",gap:15,flexWrap:"wrap",marginTop:24}}>
    <Link href="/interest" className="button peach">Εκδήλωσε ενδιαφέρον ↗</Link>
    <Link href="/join" className="button dark">Είμαι ήδη μέλος ↗</Link>
   </div>
  </div></section>
  <section className="section shell">
   <span className="eyebrow">ΠΩΣ ΛΕΙΤΟΥΡΓΕΙ</span>
   <h2>Επιλέγεις. Ζητάς. Αξιοποιείς.</h2>
   <p>1 Token = 1€ καταλογικής αξίας εργασιών ΜΑΖΙ, χωρίς εξαργύρωση σε χρήματα. Μπορείς να συνδυάζεις επιμέρους υπηρεσίες εντός των 250 Tokens. Τα αχρησιμοποίητα Tokens λήγουν στο τέλος κάθε περιόδου και δεν μεταφέρονται.</p>
   <p className="legal-hint">Η κοινότητα λειτουργεί προς το παρόν ως μη οικονομική πιλοτική συμμετοχή. Δεν εκδίδονται ούτε χρεώνονται Tokens κατά την αίτηση ενδιαφέροντος ή την αποδοχή πρόσκλησης. Η φορολογική μεταχείριση, η σύμβαση και οι λειτουργικές λεπτομέρειες της μελλοντικής συνδρομής οριστικοποιούνται πριν την εμπορική ενεργοποίηση.</p>
  </section>
  <section className="section muted"><div className="shell">
   <span className="eyebrow">ΚΑΤΑΛΟΓΟΣ ΥΠΗΡΕΣΙΩΝ</span><h2>Πρακτικές λύσεις, χωρίς αόριστες χρεώσεις.</h2>
   {error?<p className="legal-hint" role="status">Ο κατάλογος δεν είναι διαθέσιμος αυτή τη στιγμή.</p>:
    categories.map(category=><section key={category} style={{marginTop:38}}>
     <h3 style={{fontSize:25,marginBottom:14}}>{category}</h3>
     <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(245px,1fr))",gap:16}}>
      {services.filter(service=>service.category===category).map(s=><article key={s.id} className="record-card">
       <span className="eyebrow">{s.tokens} TOKENS</span><h4 style={{fontSize:20,margin:"12px 0"}}>{s.title}</h4>
       <p>{s.description}</p><p><strong>Παραδοτέο:</strong> {s.deliverable}</p>
       <p className="small-muted">Ενδεικτικά {s.turnaround_business_days} εργάσιμες μετά την ανάληψη · {s.revisions_included} γύρος/γύροι διορθώσεων</p>
      </article>)}
     </div>
    </section>)
   }
   {!error&&!services.length?<p>Δεν διατίθενται προς το παρόν υπηρεσίες.</p>:null}
  </div></section>
  <section className="section shell">
   <h2>Τι δεν περιλαμβάνουν τα Tokens;</h2>
   <p>Εξωτερικές διαφημιστικές δαπάνες Meta ή Google, εκτυπώσεις, hosting, domain, κόστος τρίτων, επιτόπιες λήψεις ή επαγγελματικές αμοιβές εκτός καταλόγου. Οι χρόνοι παράδοσης είναι ενδεικτικοί, όχι εγγυήσεις αποτελεσμάτων.</p>
   <Link className="button dark" href="/interest">Γνώρισε το ΜΑΖΙ ↗</Link>
  </section>
 </main>;
}