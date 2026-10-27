import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest} from "../../lib/mazi-api";
import {formattedDate,goodsCategories,goodsConditions,goodsFulfillment,goodsPriceTypes,
 goodsUnits,listingKinds,listingPrice,type MaziListing} from "../../lib/mazi-community";
import {publishMaziListing,editMaziListing,renewMaziListing,closeMaziListing,startInquiry} from "../community-actions";
import {MaziCommunityNav} from "../community-nav";
import {GoodsFields} from "./goods-fields";
import s from "../community.module.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Αγορά φυσικών ειδών · ΜΑΖΙ",robots:{index:false,follow:false}};
export default async function Marketplace({searchParams}:{searchParams:Promise<{
 notice?:string;page?:string;item_category?:string;kind?:string;q?:string;city?:string
}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const {notice,kind:rawKind,item_category:rawCategory,q:rawQuery,city:rawCity,page:rawPage}=await searchParams;
 const item_category=rawCategory&&rawCategory in goodsCategories?rawCategory:"";
 const kind=["offer","request"].includes(rawKind||"")?rawKind||"":"";
 const q=(rawQuery||"").trim().slice(0,80),city=(rawCity||"").trim().slice(0,100);
 const page=/^(0|[1-9][0-9]{0,1})$/.test(rawPage||"0")?Number(rawPage||0):0;
 const params={...(item_category?{item_category}:{}),...(kind?{kind}:{}),...(city?{city}:{}),...(q?{q}:{})};
 const linkFor=(nextPage:number)=>"/marketplace?"+new URLSearchParams({...params,page:String(nextPage)}).toString();
 const [publicFeed,mine]=await Promise.all([
  maziMemberRequest<{listings:MaziListing[];has_more:boolean}>("marketplace_list",{page,item_category,kind,query:q,city}),
  maziMemberRequest<{listings:MaziListing[]}>("marketplace_my")
 ]);
 const now=Date.now(),twoWeeks=14*86400000;
 return <main id="content" className={s.stage}><div className={s.shell}>
  <section className={s.intro}>
   <span className={s.eyebrow}>ΜΑΖΙ / ΑΠΟ ΕΠΙΧΕΙΡΗΣΗ ΣΕ ΕΠΙΧΕΙΡΗΣΗ</span>
   <h1>Είδη που <em>προσφέρουμε.</em><br/>Είδη που <em>αναζητούμε.</em></h1>
   <p>Μία ιδιωτική αγορά για πραγματικά φυσικά αγαθά μεταξύ επαληθευμένων επιχειρήσεων:
    εξοπλισμό, αποθέματα, πρώτες ύλες, έπιπλα και πολλά ακόμη.</p>
   <div className={s.goodsHeroLinks}>
    <a href="#publish">Δημοσίευσε ένα είδος ↓</a>
    <a href="#discover">Δες τις καταχωρίσεις ↓</a>
   </div>
  </section>
  <MaziCommunityNav/>
  {!publicFeed.ok||!mine.ok?<div className={s.warn}>
   <h2>{(!publicFeed.ok&&publicFeed.error==="not_verified")||(!mine.ok&&mine.error==="not_verified")?
    "Πρόσβαση μόνο σε επαληθευμένα μέλη":"Η αγορά ειδών δεν είναι προσωρινά διαθέσιμη"}</h2>
   <p>Απαιτείται ενεργή έγκριση της επιχείρησης και επαλήθευση ΓΕΜΗ. Δεν εμφανίζονται
    καταχωρίσεις ή στοιχεία επιχειρήσεων χωρίς αυτόν τον έλεγχο.</p>
   <Link className={s.minor} href="/members">Έλεγχος συμμετοχής ↗</Link>
  </div>:<>
   {notice==="created"?<p className={s.notice} role="status">Η καταχώρισή σου δημοσιεύτηκε για 60 ημέρες.</p>:null}
   {notice==="edited"?<p className={s.notice} role="status">Οι αλλαγές αποθηκεύτηκαν.</p>:null}
   {notice==="renewed"?<p className={s.notice} role="status">Η καταχώριση ανανεώθηκε για 60 ημέρες.</p>:null}
   {notice==="closed"?<p className={s.notice} role="status">Η καταχώριση έκλεισε.</p>:null}
   {notice==="not_saved"?<p className={s.warn} role="alert">Η ενέργεια δεν ολοκληρώθηκε. Έλεγξε τα στοιχεία,
    τον τύπο τιμής, την κατάσταση και τα όρια δημοσίευσης.</p>:null}
   <div className={s.columns}>
    <section id="publish" className={s.panel}>
     <span className={s.eyebrow}>ΝΕΑ ΑΓΓΕΛΙΑ · 01</span>
     <h2>Τι προσφέρεις ή χρειάζεσαι;</h2>
     <p className={s.meta}>Πραγματικά φυσικά είδη μόνο. Η καταχώριση ισχύει για 60 ημέρες,
      είναι επεξεργάσιμη και μπορεί να κλείσει ανά πάσα στιγμή.</p>
     <form className={s.form} action={publishMaziListing}>
      <GoodsFields/>
      <button type="submit" className={s.action}>Δημοσίευση στην αγορά ↗</button>
     </form>
     <p className={s.hint}>Η ΜΑΖΙ δεν είναι μέρος της αγοραπωλησίας και δεν διαχειρίζεται
      πληρωμές, αποστολές, εγγυήσεις ή παραστατικά. Η επικοινωνία ξεκινά ιδιωτικά.</p>
    </section>
    <section id="discover" className={s.feed} aria-label="Ενεργές αγγελίες φυσικών ειδών">
     <div className={s.goodsFeedTop}><div><span className={s.eyebrow}>Η ΑΓΟΡΑ · 02</span>
      <h2>Ανταλλαγή πραγματικών ειδών.</h2></div>
      <span className={s.tag}>Σελίδα {page+1}</span>
     </div>
     <form method="get" action="/marketplace" className={s.goodsDiscovery} role="search">
      <label>Αναζήτηση είδους<input name="q" maxLength={80} defaultValue={q} placeholder="Επωνυμία, μοντέλο, είδος…"/></label>
      <label>Προσφορά ή ζήτηση<select name="kind" defaultValue={kind}><option value="">Και τα δύο</option>
       <option value="offer">Προσφέρω</option><option value="request">Αναζητώ</option></select></label>
      <label>Κατηγορία<select name="item_category" defaultValue={item_category}><option value="">Όλες οι κατηγορίες</option>
       {Object.entries(goodsCategories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Πόλη / περιοχή<input name="city" maxLength={100} defaultValue={city} placeholder="π.χ. Σπάρτη"/></label>
      <button type="submit" className={s.action}>Εύρεση καταχωρίσεων ↗</button>
     </form>
     {!publicFeed.listings.length?<div className={s.empty}>
      Δεν βρέθηκαν ενεργές καταχωρίσεις για τα συγκεκριμένα φίλτρα.
      <p><Link href="/marketplace">Καθαρισμός φίλτρων ↗</Link></p>
     </div>:publicFeed.listings.map(item=><article key={item.id} className={s.entry}>
      <div className={s.tags}><span className={s.goodsKind}>{listingKinds[item.kind]}</span>
       <span className={s.tag}>{goodsCategories[item.item_category]}</span></div>
      <h3>{item.title}</h3>
      <p className={s.meta}>{item.author_business_name} · {formattedDate(item.created_at)}</p>
      <p className={s.body}>{item.description}</p>
      <div className={s.goodsSpecs}>
       <div><small>ΚΑΤΑΣΤΑΣΗ</small><strong>{goodsConditions[item.item_condition]}</strong></div>
       <div><small>ΠΟΣΟΤΗΤΑ</small><strong>{item.quantity.toLocaleString("el-GR")} {goodsUnits[item.quantity_unit]}</strong></div>
       <div><small>ΤΟΠΟΘΕΣΙΑ</small><strong>{item.location_city}</strong></div>
       <div><small>ΠΑΡΑΔΟΣΗ</small><strong>{goodsFulfillment[item.fulfillment]}</strong></div>
      </div>
      <div className={s.goodsPrice}><span>{goodsPriceTypes[item.price_type]}</span>
       <strong>{listingPrice(item)}</strong></div>
      {!item.is_mine?<details className={s.goodsDetails}>
       <summary>Ιδιωτικό αίτημα προς την επιχείρηση ↗</summary>
       <form action={startInquiry} className={s.form}>
        <input type="hidden" name="listing_id" value={item.id}/>
        <label>Μήνυμα ενδιαφέροντος<textarea name="body" required minLength={20} maxLength={1500}
         rows={4} placeholder="Πες τι χρειάζεσαι, σε ποια ποσότητα και πώς θα μπορούσατε να προχωρήσετε."/></label>
        <button type="submit" className={s.action}>Αποστολή ιδιωτικού αιτήματος ↗</button>
        <small>Η συνέχεια γίνεται στα προσωπικά μηνύματα. Οι διευθύνσεις email δεν κοινοποιούνται.</small>
       </form>
      </details>:null}
      <div className={s.footerLine}><span className={s.meta}>Ισχύει έως {formattedDate(item.expires_at)}</span>
       <Link className={s.reportLink} href={`/community/report?resource_type=listing&resource_id=${item.id}`}>Αναφορά</Link></div>
     </article>)}
     <nav className={s.pagination} aria-label="Σελίδες της αγοράς">
      {page>0?<Link className={s.minor} href={linkFor(page-1)}>← Προηγούμενη</Link>:<span/>}
      {publicFeed.has_more&&page<99?<Link className={s.minor} href={linkFor(page+1)}>Επόμενη →</Link>:null}
     </nav>
    </section>
   </div>
   <section className={s.panel} style={{marginTop:26}}>
    <div className={s.goodsFeedTop}><div><span className={s.eyebrow}>Ο ΔΙΚΟΣ ΜΟΥ ΧΩΡΟΣ · 03</span>
     <h2>Οι καταχωρίσεις μου</h2></div><span className={s.tag}>{mine.listings.length} καταχωρίσεις</span></div>
    {!mine.listings.length?<p className={s.meta}>Δεν έχεις καταχωρίσεις ακόμη.</p>:<div className={s.feed}>
     {mine.listings.map(item=>{
      const expired=Date.parse(item.expires_at)<=now;
      const renewable=item.status==="active"&&Date.parse(item.expires_at)-now<=twoWeeks;
      return <article key={item.id} className={s.entry}>
       <div className={s.split}><div><div className={s.tags}><span className={s.tag}>{listingKinds[item.kind]}</span>
         <span className={s.tag}>{goodsCategories[item.item_category]}</span></div>
        <h3>{item.title}</h3></div>
        <span className={s.tag}>{item.status==="closed"?"Κλειστή":expired?"Έληξε":"Ενεργή"}</span>
       </div>
       <p className={s.meta}>Λήξη: {formattedDate(item.expires_at)}</p>
       {item.status==="active"?<div className={s.goodsOwnerActions}>
        {renewable?<form action={renewMaziListing}><input type="hidden" name="listing_id" value={item.id}/>
          <button type="submit" className={s.minor}>Ανανέωση για 60 ημέρες</button></form>:null}
        <form action={closeMaziListing}><input type="hidden" name="listing_id" value={item.id}/>
         <button type="submit" className={s.minor}>Κλείσιμο</button></form>
        <details className={s.goodsDetails}><summary>Επεξεργασία ↗</summary>
         <form action={editMaziListing} className={s.form}>
          <input type="hidden" name="listing_id" value={item.id}/><GoodsFields item={item}/>
          <button className={s.action} type="submit">Αποθήκευση αλλαγών</button>
         </form>
        </details>
       </div>:null}
      </article>;
     })}
    </div>}
   </section>
  </>}
 </div></main>;
}