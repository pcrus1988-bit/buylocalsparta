import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest} from "../../lib/mazi-api";
import {formattedDate,listingCategories,listingKinds,type MaziListing} from "../../lib/mazi-community";
import {publishMaziListing,closeMaziListing,startInquiry} from "../community-actions";
import {MaziCommunityNav} from "../community-nav";
import s from "../community.module.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Marketplace μελών",robots:{index:false,follow:false}};
export default async function Marketplace({searchParams}:{searchParams:Promise<{notice?:string;page?:string;category?:string;kind?:string;q?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const {notice,category:rawCategory,kind:rawKind,q:rawQuery,page:rawPage}=await searchParams;
 const category=["goods","services","partnerships"].includes(rawCategory||"")?rawCategory||"":"";
 const kind=["offer","request"].includes(rawKind||"")?rawKind||"":"";
 const q=(rawQuery||"").trim().slice(0,80);
 const page=/^(0|[1-9][0-9]{0,1})$/.test(rawPage||"0")?Number(rawPage||0):0;
 const linkFor=(nextPage:number)=>"/marketplace?"+new URLSearchParams({page:String(nextPage),...(category?{category}:{}),...(kind?{kind}:{}),...(q?{q}:{})}).toString();
 const [publicFeed,mine]=await Promise.all([
  maziMemberRequest<{listings:MaziListing[];has_more:boolean}>("marketplace_list",{page,category,kind,query:q}),
  maziMemberRequest<{listings:MaziListing[]}>("marketplace_my")
 ]);
 return <main id="content" className={s.stage}><div className={s.shell}>
  <section className={s.intro}><span className={s.eyebrow}>ΜΑΖΙ / ΠΡΑΓΜΑΤΙΚΕΣ ΕΠΙΧΕΙΡΗΣΕΙΣ</span>
   <h1>Marketplace <em>μελών.</em></h1>
   <p>Αναζήτησε υπηρεσίες, προϊόντα ή συνεργασίες από επαληθευμένες επιχειρήσεις. Οι αναρτήσεις είναι προτάσεις συνεργασίας, όχι ηλεκτρονικές συναλλαγές ή εγγυημένες προσφορές.</p>
  </section>
  <MaziCommunityNav/>
  {!publicFeed.ok||!mine.ok?<div className={s.warn}>
   <h2>{(!publicFeed.ok&&publicFeed.error==="not_verified")||(!mine.ok&&mine.error==="not_verified")?"Πρόσβαση μόνο σε επαληθευμένα μέλη":"Η κοινότητα δεν είναι προσωρινά διαθέσιμη"}</h2>
   <p>Χρειάζεται ενεργή έγκριση επιχείρησης και επιβεβαίωση ΓΕΜΗ. Δεν εμφανίζονται δεδομένα χωρίς έλεγχο.</p><Link className={s.minor} href="/members">Κατάσταση μέλους ↗</Link>
  </div>:<>
   {notice==="created"?<p className={s.notice} role="status">Η καταχώρισή σου δημοσιεύτηκε στην κοινότητα.</p>:null}
   {notice==="closed"?<p className={s.notice} role="status">Η καταχώριση έκλεισε.</p>:null}
   {notice==="not_saved"?<p className={s.warn} role="alert">Η ενέργεια δεν ολοκληρώθηκε. Έλεγξε τα στοιχεία και τα όρια δημοσίευσης.</p>:null}
   <div className={s.columns}>
    <section className={s.panel}><h2>Νέα καταχώριση</h2><p className={s.meta}>Μόνο μία πραγματική επαληθευμένη επιχείρηση μπορεί να δημοσιεύσει.</p>
     <form className={s.form} action={publishMaziListing}>
      <label>Τύπος<select name="kind" required><option value="offer">Προσφέρω</option><option value="request">Αναζητώ</option></select></label>
      <label>Κατηγορία<select name="category" required><option value="services">Υπηρεσίες</option><option value="goods">Προϊόντα</option><option value="partnerships">Συνεργασίες</option></select></label>
      <label>Τίτλος<input name="title" required minLength={8} maxLength={140} placeholder="Τι προσφέρεις ή αναζητάς;"/></label>
      <label>Περιγραφή<textarea name="description" required minLength={30} maxLength={2500} rows={7} placeholder="Δώσε χρήσιμες, πραγματικές λεπτομέρειες, χωρίς προσωπικά δεδομένα τρίτων."/></label>
      <button type="submit" className={s.action}>Δημοσίευση ↗</button>
     </form>
     <p className={s.hint}>Δεν πραγματοποιούνται πληρωμές μέσω MAZI. Απόφυγε τη δημοσιοποίηση προσωπικών στοιχείων ή όρων που δεν έχουν συμφωνηθεί.</p>
    </section>
    <section className={s.feed} aria-label="Ενεργές καταχωρίσεις">
     <h2>Καταχωρίσεις μελών · Σελίδα {page+1}</h2>
     <form method="get" action="/marketplace" className={s.discovery} role="search">
      <label>Αναζήτηση τίτλου<input name="q" maxLength={80} defaultValue={q} placeholder="Π.χ. γραφιστική, προμηθευτές…" /></label>
      <label>Τύπος<select name="kind" defaultValue={kind}><option value="">Όλα</option><option value="offer">Προσφέρω</option><option value="request">Αναζητώ</option></select></label>
      <label>Κατηγορία<select name="category" defaultValue={category}><option value="">Όλες</option><option value="services">Υπηρεσίες</option><option value="goods">Προϊόντα</option><option value="partnerships">Συνεργασίες</option></select></label>
      <button type="submit" className={s.action}>Αναζήτηση</button>
     </form>
     {!publicFeed.listings.length?<div className={s.empty}>Δεν υπάρχουν ακόμη ενεργές καταχωρίσεις από επαληθευμένα μέλη.</div>:publicFeed.listings.map(item=>
      <article key={item.id} className={s.entry}>
       <div className={s.tags}><span className={s.tag}>{listingKinds[item.kind]}</span><span className={s.tag}>{listingCategories[item.category]}</span></div>
       <h3>{item.title}</h3>
       <p className={s.meta}>{item.author_business_name} · {formattedDate(item.created_at)}</p>
       <p className={s.body}>{item.description}</p>
       {!item.is_mine?<details style={{margin:"18px 0 0",padding:"12px 0",borderTop:"1px solid #dbe5db"}}>
        <summary style={{cursor:"pointer",fontWeight:700,color:"#1d6545"}}>Ιδιωτική επικοινωνία με την επιχείρηση</summary>
        <form action={startInquiry} className={s.form} style={{marginTop:14}}>
         <input type="hidden" name="listing_id" value={item.id}/>
         <label>Μήνυμα ενδιαφέροντος<textarea name="body" required minLength={20} maxLength={1500} rows={4} placeholder="Περιέγραψε το ενδιαφέρον σου και μια πιθανή συνεργασία."/></label>
         <button type="submit" className={s.action}>Αποστολή ιδιωτικού αιτήματος ↗</button>
         <small>Η συνέχεια γίνεται στον ιδιωτικό χώρο μηνυμάτων. Τα email δεν κοινοποιούνται.</small>
        </form>
       </details>:null}
       <div className={s.footerLine}><Link className={s.reportLink} href={`/community/report?resource_type=listing&resource_id=${item.id}`}>Αναφορά περιεχομένου</Link></div>
      </article>
     )}
     <nav className={s.pagination} aria-label="Σελίδες marketplace">{page>0?<Link className={s.minor} href={linkFor(page-1)}>← Προηγούμενη</Link>:<span/>}{publicFeed.has_more&&page<99?<Link className={s.minor} href={linkFor(page+1)}>Επόμενη →</Link>:null}</nav>
    </section>
   </div>
   <section className={s.panel} style={{marginTop:26}}>
    <h2>Οι καταχωρίσεις μου</h2>
    {!mine.listings.length?<p className={s.meta}>Δεν έχεις δημοσιεύσει ακόμη καταχωρίσεις.</p>:<div className={s.feed}>
     {mine.listings.map(item=><article key={item.id} className={s.entry}>
       <div className={s.split}><strong>{item.title}</strong><span className={s.tag}>{item.status==="active"?"Ενεργή":"Κλειστή"}</span></div>
       <p className={s.meta}>{listingKinds[item.kind]} · {formattedDate(item.created_at)}</p>
       {item.status==="active"?<form action={closeMaziListing}>
        <input type="hidden" name="listing_id" value={item.id}/><button className={s.minor} type="submit">Κλείσιμο καταχώρισης</button>
       </form>:null}
     </article>)}
    </div>}
   </section>
  </>}
 </div></main>;
}